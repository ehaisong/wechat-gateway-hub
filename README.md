# WeChat Login Relay (微信扫码登录中转站)

为 **多前端 + 单后端** 的系统架构提供统一的微信扫码登录入口。

```
a.com / c.com / d.com  ──►  b.com (本服务)  ──►  微信开放平台  ──►  b.com  ──►  原前端
```

只在微信开放平台配置 **一个** 网站应用,授权回调域填写本服务部署的域名 `b.com`。各业务前端只负责发起登录请求,无需在微信后台配置。

---

## 设计要点

| | |
|---|---|
| 微信开放平台 scope | `snsapi_login`(网站应用扫码登录) |
| 授权回调域 | 仅 `b.com`(本服务的部署域名) |
| 来源传递 | 由 b.com 服务端用 `state` 索引保存,**不**把业务域名放在 URL 里 |
| 用户信息回传 | **绝不**走 URL,只回传一次性 `ticket`,业务后端用 `client_secret` 走 server-to-server 换取 |
| 跳回业务站点 | 完全由白名单 `origin + done_path` 拼出,杜绝开放重定向 |
| 各业务站 session | 由各业务站自己 set-cookie 维护,本服务**不**签发任何登录态 |

---

## 部署

### 1. 微信开放平台配置

在 [open.weixin.qq.com](https://open.weixin.qq.com) → 你的网站应用:

| 字段 | 值 |
|---|---|
| 授权回调域 | `b.com`(只填域名,不带 `https://`、路径、端口) |
| AppID / AppSecret | 拿到后填到本服务环境变量 |

### 2. 环境变量

复制 `.env.example` 为 `.env` 并填好:

- `WECHAT_APPID` / `WECHAT_APPSECRET` — 微信开放平台拿到
- `RELAY_BASE_URL` — 本服务对外 URL,必须 `https://`,**域名必须等于** 微信开放平台填写的「授权回调域」
- `CLIENTS_JSON` — 业务站点白名单,JSON 字符串。每个站点一个 `client_secret`(≥16 字符,只发给该站点后端)

### 3. Zeabur + 国内云服务器(推荐路径)

1. 把本仓库推到 GitHub。
2. 在 **Zeabur** 创建一个 Service,关联此仓库。Zeabur 会自动识别 `Dockerfile`。
3. 在 Zeabur 服务设置中粘贴上述环境变量。
4. 绑定你的国内已备案域名 `b.com`,Zeabur 自动签发 HTTPS。
5. 同样的镜像也可以推到阿里云 / 腾讯云 ACR,然后在 ECS 上 `docker run`。

> 微信开放平台审核要求域名已 ICP 备案,所以 `b.com` 必须是国内备案域名,服务也要部署在国内。Zeabur 在国内有可用区,或自行选阿里云 / 腾讯云 ECS。

### 4. Nginx 反代示例(自建机)

```nginx
server {
  listen 443 ssl http2;
  server_name b.com;

  ssl_certificate     /etc/letsencrypt/live/b.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/b.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## 接口

| 路径 | 方法 | 调用方 | 说明 |
|---|---|---|---|
| `/oauth/wechat/start?client=<a>&return_path=</path>` | GET (302) | 浏览器 | 入口,跳转微信二维码 |
| `/wechat/callback?code=&state=` | GET (302) | 微信 | 微信回调,签发 ticket 后跳回业务站点 |
| `/api/public/oauth/wechat/exchange` | POST | 业务后端 | ticket → 用户信息(一次性) |
| `/healthz` | GET | 监控 | 健康检查 |

### Exchange 接口

请求体:
```json
{ "ticket": "...", "client": "a", "client_secret": "..." }
```

成功 200:
```json
{
  "openid": "o123...",
  "unionid": "u456..." ,
  "nickname": "用户昵称",
  "avatar": "https://thirdwx.qlogo.cn/...",
  "sex": 1,
  "province": "北京",
  "city": "北京",
  "country": "中国",
  "issued_at": 1730000000
}
```

失败:
- `400 invalid_request` — 入参格式错误
- `401 unknown_client` / `bad_credentials` — client 不存在或 secret 错
- `403 ticket_client_mismatch` — ticket 不属于该 client
- `410 ticket_not_found_or_expired` / `ticket_already_used` — ticket 失效

---

## 业务站点接入

### 前端发起登录

```html
<a href="https://b.com/oauth/wechat/start?client=a&return_path=/dashboard">
  微信登录
</a>
```

> `return_path` 可选,必须以 `/` 开头(相对路径)。**不要传完整 URL**,会被忽略。

### 业务后端实现 `/login/wechat-done`(以 Node/Express 为例)

```ts
import express from "express";
const app = express();

app.get("/login/wechat-done", async (req, res) => {
  const ticket = String(req.query.ticket ?? "");
  const returnPath = String(req.query.return_path ?? "/");
  if (!ticket) return res.status(400).send("missing ticket");

  // server-to-server,client_secret 永远不出现在浏览器里
  const r = await fetch("https://b.com/api/public/oauth/wechat/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticket,
      client: "a",
      client_secret: process.env.WECHAT_RELAY_CLIENT_SECRET, // 与 b.com CLIENTS_JSON 中 a.client_secret 一致
    }),
  });
  if (!r.ok) return res.status(401).send("login failed");
  const wxUser = await r.json();

  // 在自己用户表里 upsert(unionid 优先,其次 openid)
  const user = await upsertUser({ unionid: wxUser.unionid, openid: wxUser.openid, nickname: wxUser.nickname, avatar: wxUser.avatar });

  // 设置自己站点的 session cookie
  res.cookie("session", await issueSession(user.id), { httpOnly: true, secure: true, sameSite: "lax" });

  // 安全跳转,严格只接受相对路径
  const safePath = returnPath.startsWith("/") && !returnPath.startsWith("//") ? returnPath : "/";
  res.redirect(safePath);
});
```

### curl 测试 exchange

```bash
curl -X POST https://b.com/api/public/oauth/wechat/exchange \
  -H "Content-Type: application/json" \
  -d '{"ticket":"<ticket from query>","client":"a","client_secret":"..."}'
```

---

## 安全

- `state` / `ticket` 均为 32 字节随机串,base64url 编码
- `state` TTL 5 分钟,`ticket` TTL 2 分钟,均**一次性**(`take` 操作原子地读取并删除)
- `return_path` 强校验:必须 `/` 开头、长度 ≤200、禁止 `//` / `\` / 换行
- 跳回业务站点 URL **完全**由白名单 `origin + done_path` 拼出
- `client_secret` 用 SHA-256 + 常量时间比较
- 用户 PII(openid / unionid / 昵称)**绝不**进 URL 也**不**写日志

---

## 状态存储

默认是进程内内存 KV,适合**单实例**部署。如果需要多实例横向扩展,在 `src/server/kv.server.ts` 中替换为 Redis 实现:

```ts
// 伪代码
import Redis from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

class RedisKV implements KVStore {
  async set(k, v, ttl) { await redis.set(k, JSON.stringify(v), "EX", ttl); }
  async get(k) { const r = await redis.get(k); return r ? JSON.parse(r) : null; }
  async take(k) {
    // GETDEL 是原子操作
    const r = await redis.getdel(k);
    return r ? JSON.parse(r) : null;
  }
  async del(k) { await redis.del(k); }
}
```

记得在 `Dockerfile` 里 `bun add ioredis`。

---

## 不在范围内

- 跨站 SSO(各站独立 cookie,不共享登录态)
- 中转站自己的用户库 / JWT 签发
- 微信公众号 / 小程序登录(只做网站应用 `snsapi_login`)
- 管理后台 UI(白名单走环境变量)
