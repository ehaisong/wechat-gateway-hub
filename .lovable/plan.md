## 目标

构建一个独立的微信扫码登录中转服务 `b.com`,统一承接微信开放平台网站应用的授权回调,然后把登录凭证安全地分发回多个前端业务站点(`a.com` / `c.com` / `d.com`)。本仓库**只交付中转站本身**,不包含业务前端,也不使用 Lovable Cloud(避开任何托管数据库/认证),便于通过 GitHub → Zeabur → 国内云服务器自主部署。

## 整体流程

```text
[a.com 前端] --点击微信登录--> [b.com /oauth/wechat/start?client=a&return_path=/dashboard]
                                          |
                                          | 1. 校验 client 在白名单
                                          | 2. 生成 state, 服务端保存 {client, return_path, exp}
                                          | 3. 302 到微信 qrconnect (redirect_uri = b.com/wechat/callback)
                                          v
                                   [open.weixin.qq.com 扫码授权]
                                          |
                                          v
                          [b.com /wechat/callback?code=...&state=...]
                                          |
                                          | 4. 校验 state, 取出来源 client
                                          | 5. code -> access_token -> openid/unionid/userinfo
                                          | 6. 生成一次性 ticket, 服务端保存 {wechat_user, client, exp, used=false}
                                          | 7. 302 回 https://a.com/login/wechat-done?ticket=xxx&return_path=/dashboard
                                          v
                                  [a.com 前端 BFF]
                                          |
                                          | 8. BFF 调 POST b.com/oauth/wechat/exchange  body={ticket, client_secret}
                                          |    b.com 校验 client_secret + ticket 未用 + 未过期 + client 匹配 -> 标记已用
                                          |    返回 {openid, unionid, nickname, avatar, ...}
                                          | 9. a.com BFF 用这些信息建/查自己用户表, set-cookie session
                                          v
                                  [用户登录完成,留在 a.com]
```

关键不变量:
- 微信开放平台只配置一个授权回调域 `b.com`,`a.com/c.com/d.com` 完全不出现在微信后台。
- `redirect_uri` 永远是 `https://b.com/wechat/callback`。
- `state` 只是一个**不可猜测的随机串**(例如 32 字节 base64url),URL 上不携带任何业务语义,真正的上下文存在 b.com 服务端。
- 用户信息**绝不**通过 URL query 回传给业务站点,只回传一次性 `ticket`,业务后端用 `client_secret` 走后端到后端的 HTTPS 调用换取。
- `a.com / c.com / d.com` 必须事先在 b.com 的白名单里注册,登录后跳转地址只能由白名单拼出,杜绝开放重定向。

## 中转站需要提供的接口

| 路径 | 方法 | 调用方 | 作用 |
|---|---|---|---|
| `/oauth/wechat/start` | GET (302) | 浏览器 | 入口,生成 state,跳转微信 qrconnect |
| `/wechat/callback` | GET (302) | 微信 | 微信回调,换 openid,签发 ticket,跳回业务站点 |
| `/oauth/wechat/exchange` | POST | 业务后端(server-to-server) | 用 ticket + client_secret 换取用户信息,一次性 |
| `/healthz` | GET | 监控 | 健康检查 |
| `/admin` (可选,简单页) | GET | 运维 | 查看已注册的 client 配置和最近登录日志(不存储用户 PII) |

### `/oauth/wechat/start` 入参
- `client`(必填): 来源标识,如 `a` / `c` / `d`
- `return_path`(可选): 业务站点登录完成后想停留的相对路径,必须以 `/` 开头,做长度和字符校验,**绝不接受完整 URL**
- 行为:
  - 校验 `client` 是否在白名单
  - 生成 `state`(32 字节随机)
  - 服务端 KV 写入 `state -> {client, return_path, created_at, exp=5min}`
  - 302 到 `https://open.weixin.qq.com/connect/qrconnect?appid=...&redirect_uri=<urlencoded b.com/wechat/callback>&response_type=code&scope=snsapi_login&state=<state>#wechat_redirect`

### `/wechat/callback`
- 微信回传 `code`, `state`
- 取出并**立刻删除** state 记录(防重放),校验未过期
- 用 `code` + `AppID` + `AppSecret` 调微信 `access_token` 接口
- 用 `access_token + openid` 调 `userinfo` 接口拿 `unionid / nickname / headimgurl`(可选,看是否需要)
- 生成 `ticket`(32 字节随机),KV 写入 `ticket -> {client, wechat_user_payload, exp=2min, used=false}`
- 从白名单查出 `client.origin` 和 `client.done_path`(例如 `https://a.com` + `/login/wechat-done`)
- 302 到 `${origin}${done_path}?ticket=${ticket}&return_path=${encoded return_path}`
- 错误分支(用户取消、code 失效、state 找不到)统一渲染一个简洁错误页,带"返回"链接

### `/oauth/wechat/exchange`
- 入参 JSON: `{ ticket, client, client_secret }`
- 校验:
  - `client` 在白名单
  - `client_secret` 与白名单里该 client 的 secret 比对(constant time)
  - `ticket` 存在、未过期、`used=false`、`ticket.client === client`
- 标记 `used=true`(原子操作),返回:
  ```json
  {
    "openid": "...",
    "unionid": "...",
    "nickname": "...",
    "avatar": "...",
    "issued_at": 1730000000
  }
  ```
- 失败统一返回 401/410,不暴露细节

## Client 白名单配置

通过环境变量(JSON 字符串)或挂载的 `clients.json` 配置,例如:

```json
{
  "a": {
    "origin": "https://a.com",
    "done_path": "/login/wechat-done",
    "client_secret_hash": "sha256:..."
  },
  "c": { "origin": "https://c.com", "done_path": "/login/wechat-done", "client_secret_hash": "..." },
  "d": { "origin": "https://d.com", "done_path": "/login/wechat-done", "client_secret_hash": "..." }
}
```

`client_secret` 只发给业务后端持有,b.com 只存哈希。

## 状态存储(state / ticket)

需要一个**短 TTL 的 KV**,二选一:

- **Redis**(推荐生产用,Zeabur / 阿里云 / 腾讯云都好开):key 自动过期,简单可靠
- **进程内 Map + TTL**(单实例 demo 可用,重启丢失,不能水平扩容)

代码里用一个 `KVStore` 接口抽象,默认提供两种实现,通过 `KV_DRIVER=memory|redis` 切换。

## 中转站本身的页面

只需要两个极简页面(b.com 不是面向终端用户的产品):

1. `/`(首页): 说明 "本服务为微信扫码登录中转,直接访问无意义",显示已注册 client 数量、版本号
2. `/error`: 统一错误页,展示错误码和"返回来源站点"的链接(从 state 上下文里推断)

不做用户登录、不做管理后台 UI(留 hook,后续如需可加)。

## 部署适配(避开 Lovable Cloud)

由于本项目模板是 TanStack Start + Cloudflare Worker,但你要部署到**国内服务器**,需要做以下调整:

- **构建产物切换为 Node 服务端**: 修改 `vite.config.ts` 让 TanStack Start 用 `node-server` preset,而不是 Cloudflare Workers preset。产物是一个标准 Node `server.js`,可以直接 `node .output/server/index.mjs` 启动。
- **不引入 `@/integrations/supabase/*`、Lovable Cloud 客户端**:本仓库根本不创建这些文件。
- **环境变量在 Node 进程中读取**:`process.env.WECHAT_APPID` / `WECHAT_APPSECRET` / `CLIENTS_JSON` / `REDIS_URL` / `KV_DRIVER`,不使用 `import.meta.env.VITE_*`(中转站不需要任何变量进客户端 bundle)。
- **Zeabur 部署**: 仓库根加一个 `zeabur.json`(可选)和 `Dockerfile`(推荐),Dockerfile 里 `bun install && bun run build`,然后 `CMD ["node", ".output/server/index.mjs"]`。Zeabur 自动识别 Dockerfile。
- **国内云服务器二次部署**: 同一个 Docker 镜像可以推到任意国内 Registry 后在阿里云/腾讯云 ECS 上跑;也可以直接 `git pull && bun run build && pm2 start`。
- **HTTPS**: b.com 必须 HTTPS(微信 qrconnect 强烈建议;`secure cookie` 也需要)。在国内服务器前面挂 Nginx + Let's Encrypt 或云厂商证书。文档里给出 Nginx 反代示例。

## 安全要点(写进 README,代码里也落实)

- `state` / `ticket` 都是 ≥ 32 字节随机,base64url
- `state` TTL 5 分钟,`ticket` TTL 2 分钟,均**一次性**
- `return_path` 强校验:必须以 `/` 开头、长度 ≤ 200、不含 `\` 或 `//`、不含换行
- 跳回业务站点的 URL 完全由白名单 `origin + done_path` 拼出,**不接受任何来自 URL 的域名输入**
- `/oauth/wechat/exchange` 走 server-to-server,要求 client_secret;考虑加 IP 白名单(可选,环境变量配置)
- 调微信接口失败要分类:网络错误、`errcode 40029`(code 失效)、`40163`(code 已用)等,统一映射到错误页
- 对 `/oauth/wechat/start` 和 `/oauth/wechat/exchange` 加简单频率限制(基于内存或 Redis 的滑动窗口)
- 日志:记录 `client / state_id_hash / ticket_id_hash / 时间 / 结果`,**不记录** openid / unionid / 微信用户名

## 业务前端 / 业务后端怎么接(写进 README)

`a.com` 前端:
```html
<a href="https://b.com/oauth/wechat/start?client=a&return_path=/dashboard">微信登录</a>
```

`a.com` 后端实现 `/login/wechat-done`(GET):
1. 收到 `?ticket=xxx&return_path=/dashboard`
2. 后端调用 `POST https://b.com/oauth/wechat/exchange`,body = `{ticket, client: "a", client_secret: "..."}`
3. 拿到 `openid/unionid/...`,在自己用户表 upsert
4. `set-cookie` 自己的 session,302 到 `return_path`

README 里给一个 Node 的最小示例和一个通用 curl 示例。

## 技术细节

- 框架: TanStack Start(已有模板),路由用 file-based,所有逻辑都是 server route(`src/routes/api/...` 和 `src/routes/oauth/...`)
- 部署目标: Node 服务端(改 `vite.config.ts` 的 nitro preset 为 `node-server`),不使用 Cloudflare Workers,不使用 Lovable Cloud
- 关键依赖: `zod`(入参校验)、可选 `ioredis`(Redis 驱动);避免任何 Node-only 在 Worker 里跑不了的包(因为我们就是 Node)
- 文件结构(节选):
  ```
  src/
    routes/
      index.tsx                       极简首页
      error.tsx                       统一错误页
      oauth/wechat/start.ts           server route, 302 到微信
      wechat/callback.ts              server route, 微信回调 -> 签 ticket -> 跳回
      api/oauth/wechat/exchange.ts    server route, ticket 换用户信息
      healthz.ts
    server/
      wechat.server.ts                调微信 access_token / userinfo
      kv.server.ts                    KVStore 接口 + memory + redis 实现
      clients.server.ts               白名单加载与校验
      crypto.server.ts                随机串、constant-time compare、sha256
      ratelimit.server.ts             简单限流
  Dockerfile
  README.md                           部署 + 业务方接入指南
  .env.example
  ```

## 本仓库交付内容

1. 上述中转站完整代码(可跑通)
2. `Dockerfile` + `.env.example` + `README.md`(中文,包含微信开放平台配置、Zeabur 部署、Nginx 反代、业务方接入示例)
3. 极简首页 + 统一错误页
4. **不**包含 a.com / c.com / d.com 业务前端,也不包含业务后端示例代码,只在 README 里给伪代码和 curl 示例

## 不在范围内

- 跨站 SSO(各站独立 cookie session,不共享登录态)
- 中转站自己的用户库 / JWT 签发
- 管理后台 UI(白名单走配置文件 / 环境变量)
- 微信公众号 / 小程序登录(只做网站应用 `snsapi_login`)
