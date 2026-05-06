# 微信扫码登录接入文档

中转站地址: `https://wx.lovclaw.com`
端点协议: 浏览器 302 跳转完成授权 + 一次性 `ticket` 由业务后端兑换

> ⚠️ `client_secret` 只能存放在你的**业务后端**, 绝对不要下发到浏览器或写入前端打包产物。

---

## 0. 准备

向中转站管理员提供:
- `client` 名称 (英数 + `_-`, 例如 `qicai`)
- 你站点的 `origin` (例: `https://66cai.site`, 必须 `https`, 无末尾斜杠)
- 登录完成回调路径 `done_path` (例: `/login/wechat-done`, 必须以 `/` 开头)

管理员会下发: `client`, `client_secret` (≥16 字符长随机串)。

> 如果你已经接入了短信验证码登录, **可以复用同一个** `client` / `client_secret`。
> 同一端点 `/api/public/oauth/exchange` 同时支持 `provider: "wechat"` 与 `provider: "phone"`。

---

## 1. 流程总览

```
浏览器                     你的站点                wx.lovclaw.com           微信
  │  点 "微信登录"          │                          │                     │
  │ ─ 302 to relay ───────────────────────────────────►│                     │
  │   /oauth/wechat/start?client=qicai&return_path=/x  │                     │
  │                                                    │ ─ 302 to weixin ──►│
  │                                                    │  (PC 扫码 / 微信内授权)
  │                                                    │ ◄── code+state ────│
  │                                                    │  换 openid/userinfo │
  │ ◄── 302 to your done_path?ticket=...&provider=wechat&return_path=/x ───  │
  │  GET /login/wechat-done?ticket=...                │                      │
  │  (你的页面把 ticket 交给你的后端)                   │                      │
  │     ├─ POST /api/login/wechat-done {ticket}                              │
  │     │       │                                                            │
  │     │       │  POST /api/public/oauth/exchange ───►│                     │
  │     │       │  { client, client_secret, ticket }   │                     │
  │     │       │ ◄────── { openid, unionid, ... } ────│                     │
  │     │       │  ↳ upsert 用户, 下发自家 session                            │
  │     │ ◄── ok ─                                                           │
  │     └─ 跳到 return_path                                                   │
```

要点:
- 中转站**只把 `ticket` 通过 URL 回传给浏览器**, 不会把 openid / 昵称 / 头像直接放进 URL。
- 真正的用户资料只能由你的后端用 `client_secret` 去 exchange, **2 分钟内有效, 只能换一次**。
- 中转站会自动判断 UA: 微信内置浏览器走公众号网页授权, 其他浏览器走网站应用扫码。你这边不用区分。

---

## 2. 端点详细

### 2.1 入口跳转 (浏览器)

```
GET https://wx.lovclaw.com/oauth/wechat/start
    ?client=qicai
    &return_path=/dashboard      // 可选, 必须以 / 开头, 长度 ≤200, 不允许 //
    &flow=web|mp                 // 可选, 一般不要传, 让中转站按 UA 自动选
```

实现: 在你的站点放一个 "微信登录" 按钮, 点击后 `window.location.href = ...` 跳过去即可。

错误返回 (会 302 到 `wx.lovclaw.com/error?code=...&msg=...`):
- `unknown_client` — `client` 没在白名单
- `misconfigured` — 中转站环境变量没配齐 (找管理员)
- `user_cancelled` — 用户在微信端取消了授权

### 2.2 完成回调 (浏览器)

授权成功后, 中转站会 302 到:
```
{your_origin}{done_path}?ticket=<32字节随机>&provider=wechat[&return_path=/dashboard]
```

你需要在 `done_path` 路由里:
1. 取出 `ticket` (一次性, 2 分钟有效)
2. 立即把 `ticket` POST 给你自己的后端 (**不要在前端 fetch 中转站**)
3. 后端调 `/api/public/oauth/exchange` 换用户信息
4. 完成自家 session 下发后, 跳到 `return_path` (没有则跳首页)

> 安全提示: 不要把 `ticket` 写进 localStorage 或暴露给第三方脚本。它等价于一次性登录凭证。

### 2.3 `POST /api/public/oauth/exchange` (后端到后端)

请求:
```json
{
  "client": "qicai",
  "client_secret": "xxxxxxxxxxxxxxxxxxxx",
  "ticket": "yyyy...."
}
```
- `Content-Type: application/json`
- 必须**从你的后端**发起, 不要从浏览器直接调

响应 200 (微信通道):
```json
{
  "provider": "wechat",
  "openid":   "oABC...",       // 同一公众号/网站应用下唯一
  "unionid":  "uXYZ..." | null,// 同一开放平台主体下唯一; 推荐用它做主键
  "nickname": "张三" | null,
  "avatar":   "https://thirdwx.qlogo.cn/..." | null,
  "sex":      0 | 1 | 2 | null,
  "province": "Guangdong" | null,
  "city":     "Shenzhen" | null,
  "country":  "CN" | null,
  "issued_at": 1730800000      // 秒级时间戳, ticket 创建时间
}
```

错误:
- `400 invalid_request` — body 格式错
- `401 unknown_client` / `401 bad_credentials`
- `403 ticket_client_mismatch` — ticket 不属于你
- `410 ticket_not_found_or_expired` — 2 分钟内没换, 或不存在
- `410 ticket_already_used` — 同一 ticket 不能复用

> PC 网站应用 (`snsapi_login`) 的 `unionid` 仅当公众号 + 网站应用绑定到同一开放平台时才返回。
> 微信内置浏览器 (`snsapi_userinfo`) 通常会带 `nickname` / `avatar`; PC 扫码若 `userinfo` 拉取失败, 仍能拿到 `openid` (其余字段为 null)。

---

## 3. 用户主键怎么选?

| 字段 | 何时用 |
| ---- | ------ |
| `unionid` | **首选**。同一微信用户在你"网站应用 + 公众号 + 小程序"下都是同一个 unionid。 |
| `openid`  | 兜底。当 `unionid` 为 `null` 时退化使用; 注意 PC `openid` 与 公众号 `openid` **不互通**。 |

推荐表结构 (示意):
```
users(id, ...)
user_wechat(user_id, unionid UNIQUE, openid, openid_mp, nickname, avatar, updated_at)
```
查找逻辑: 先按 `unionid` 命中; 没命中再按当前 flow 的 `openid` 命中; 都没命中则建新用户。

---

## 4. 后端示例 (Node / Express)

```ts
// 你的站点路由
const RELAY = "https://wx.lovclaw.com";
const CREDS = {
  client: "qicai",
  client_secret: process.env.RELAY_CLIENT_SECRET!, // 仅服务端
};

// 浏览器在 /login/wechat-done 拿到 ticket 后, POST 到这里
app.post("/api/login/wechat-done", async (req, res) => {
  const ticket = String(req.body?.ticket ?? "");
  if (!ticket) return res.status(400).json({ error: "missing_ticket" });

  const r = await fetch(`${RELAY}/api/public/oauth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...CREDS, ticket }),
  });
  const data = await r.json();
  if (!r.ok || data.provider !== "wechat") {
    return res.status(r.status).json(data);
  }

  // === 你的业务: upsert 用户, 下发自家 session ===
  const user = await upsertUserByWechat({
    unionid: data.unionid,
    openid:  data.openid,
    nickname: data.nickname,
    avatar:   data.avatar,
  });
  await issueSessionCookie(res, user.id);

  res.json({ ok: true });
});
```

前端 `done_path` 页面 (示意 React):
```tsx
// /login/wechat-done
useEffect(() => {
  const url = new URL(window.location.href);
  const ticket = url.searchParams.get("ticket");
  const back   = url.searchParams.get("return_path") || "/";
  if (!ticket) { window.location.replace("/login?err=no_ticket"); return; }

  fetch("/api/login/wechat-done", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  })
    .then(r => r.json())
    .then(j => window.location.replace(j.ok ? back : "/login?err=exchange"))
    .catch(() => window.location.replace("/login?err=network"));
}, []);
```

---

## 5. 安全要点

- `client_secret` 只放在后端环境变量, 不要提交到 git, 不要打到前端 bundle
- `ticket` 拿到后**立刻**在后端 exchange; 不要存数据库, 不要回前端
- `done_path` 处理完后**立即清掉 URL 上的 `ticket`** (例如 `history.replaceState`), 避免出现在浏览器历史/分析脚本里
- 校验 `return_path` 必须以 `/` 开头, 不允许 `//` 或绝对 URL (中转站已强校验, 你这边再防一次更稳)
- 登录完成后下发的是**你自家的 session**, 与中转站无关; 中转站不持久化任何用户数据

---

## 6. 错误对照速查

| HTTP | error                          | 处理                                  |
| ---- | ------------------------------ | ------------------------------------ |
| 302  | unknown_client (relay /error)  | 检查 `client` 名是否在白名单           |
| 302  | misconfigured                  | 联系中转站管理员检查微信凭据           |
| 302  | user_cancelled                 | 用户取消授权, 引导重试                |
| 302  | wechat_token_failed            | 微信 code→token 失败, 一般是 code 过期 |
| 400  | invalid_request                | exchange body 不合法                  |
| 401  | unknown_client / bad_credentials | 检查 `client` / `client_secret`     |
| 403  | ticket_client_mismatch         | ticket 不属于你的 client              |
| 410  | ticket_not_found_or_expired    | 超过 2 分钟未 exchange, 重新登录       |
| 410  | ticket_already_used            | 不要复用 ticket                       |

---

## 7. 联调

- 健康检查 (公开): `GET https://wx.lovclaw.com/healthz`
  返回里 `env.WECHAT_APPID / WECHAT_APPSECRET / WECHAT_MP_APPID / WECHAT_MP_APPSECRET / CLIENTS_JSON` 全 `true` 即配置就绪。
- 本地调试: 把 `done_path` 暂指向你 dev 域名也可以, 但该 dev 域名必须先加进白名单 (新建一个 dev 专用 `client`)。
- 微信侧域名: 中转站的 `wx.lovclaw.com` 已在「网站应用授权回调域」与「公众号网页授权域名」配置, 你的站点**不需要**在微信后台做任何配置。
