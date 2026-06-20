# 管理中心后台设计规划

## 一、目标

为微信中转站增加 Web 管理后台，实现以下功能：
- 管理员登录/登出
- 客户端站点白名单可视化管理（CLIENTS_JSON）
- 分享域名池可视化管理（SHARE_DOMAINS_JSON）
- 系统状态仪表盘
- 后续扩展：抗投诉遮罩管理、域名切换策略等

## 二、技术方案

### 2.1 认证机制

- 密码存储在 `.env` 的 `PASSWORD` 变量（已存在：`CFkeQavT16oi80rnP3Bzp9q42S5xtf7d`）
- 登录页：`/admin/login`，POST 提交密码
- 验证通过后签发 JWT token，存入 httpOnly secure cookie（`admin_token`）
- JWT 密钥：`ADMIN_JWT_SECRET` 环境变量，32字节随机
- Token 有效期：24 小时
- 所有 `/admin/*` 路由检查 cookie 中的 token

### 2.2 配置持久化方案

**从「环境变量只读」升级为「文件持久化 + 运行时修改」：**

```
data/
  config.json     ← 持久化存储 CLIENTS_JSON 和 SHARE_DOMAINS_JSON
  admin.json      ← 持久化存储管理后台自身配置
```

启动优先级：环境变量 → `data/config.json`（文件优先于 env，因为运行时修改会写入文件）
运行流程：
1. 服务启动时，先尝试从 `data/config.json` 加载配置
2. 若文件不存在，从环境变量初始化并写入文件
3. 运行时通过管理后台修改配置 → 写入文件 → 清除内存缓存
4. 下次读取时自动从文件重新加载

### 2.3 前端架构

```
/admin               → 重定向到 /admin/dashboard
/admin/login         → 登录页（无需布局）
/admin/dashboard     → 仪表盘
/admin/clients       → 客户端站点管理
/admin/domains       → 分享域名池管理
```

使用 shadcn/ui 组件（项目已集成），侧边栏布局：
```
┌──────────┬──────────────────────────┐
│          │                          │
│  Logo    │  Header Bar              │
│          │                          │
│  ──────  ├──────────────────────────┤
│ 仪表盘   │                          │
│ 站点管理 │  Content Area            │
│ 域名管理 │                          │
│          │                          │
│          │                          │
└──────────┴──────────────────────────┘
```

### 2.4 后端 API

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/admin/login` | POST | 登录（body: {password}） |
| `/api/admin/logout` | POST | 登出 |
| `/api/admin/session` | GET | 检查当前 session |
| `/api/admin/clients` | GET | 获取所有客户端 |
| `/api/admin/clients` | POST | 新增/更新客户端 |
| `/api/admin/clients/$name` | DELETE | 删除客户端 |
| `/api/admin/domains` | GET | 获取域名池 |
| `/api/admin/domains` | POST | 更新域名池 |
| `/api/admin/status` | GET | 系统状态（uptime, 内存, KV状态, 活跃连接等） |
| `/api/admin/health` | GET | 健康检查摘要 |

### 2.5 部署流程优化

**从「服务器直接 git pull」改为「本地构建 → 推送 → 服务器拉取」：**

```
本地开发 → git push → GitHub
                          ↓
              SSH到服务器 git pull → npm install → npm run build → pm2 restart
```

优势：
- 服务器不需要直接访问 GitHub（可通过本地代理推送）
- 构建在本地完成，服务器只做拉取和重启
- 出错时本地先验证

## 三、文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/server/auth.server.ts` | JWT 签发/验证、密码校验 |
| `src/server/config-store.server.ts` | 配置文件读写（config.json） |
| `src/server/admin-api.server.ts` | 管理后台 API 业务逻辑 |
| `src/routes/admin.login.tsx` | 登录页 |
| `src/routes/admin.tsx` | 管理后台根路由（鉴权中间件） |
| `src/routes/admin.dashboard.tsx` | 仪表盘 |
| `src/routes/admin.clients.tsx` | 客户端管理页 |
| `src/routes/admin.domains.tsx` | 域名管理页 |
| `src/routes/api.admin.login.ts` | 登录 API |
| `src/routes/api.admin.logout.ts` | 登出 API |
| `src/routes/api.admin.session.ts` | Session 检查 API |
| `src/routes/api.admin.clients.ts` | 客户端 CRUD API |
| `src/routes/api.admin.domains.ts` | 域名管理 API |
| `src/routes/api.admin.status.ts` | 状态 API |
| `src/components/admin/` | 管理后台 UI 组件 |
| `data/` | 配置数据目录 |
| `deploy.sh` / `deploy.ps1` | 部署脚本 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/server/clients.server.ts` | 改为从 config-store 读取，支持运行时更新 |
| `src/server/share-domains.server.ts` | 改为从 config-store 读取，支持运行时更新 |
| `.env` | 添加 `ADMIN_JWT_SECRET` |
| `.env.example` | 同步更新 |

## 四、安全考量

- 所有 `/api/admin/*` 和 `/admin/*` 路由必须验证 JWT
- 登录页 `/admin/login` 无需验证（白名单）
- JWT 用 SHA-256 HMAC 签名，密钥来自环境变量
- Cookie 设置：`HttpOnly; Secure; SameSite=Strict; Path=/admin`
- 登录失败返回模糊错误信息（不区分"用户不存在"和"密码错误"）
- API 限流：同一 IP 每分钟最多 10 次登录尝试
