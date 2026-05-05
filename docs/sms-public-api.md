# 短信验证码登录接入文档

中转站地址: `https://wx.lovclaw.com`
适用业务方: 项目 `898f4f0d-897f-437c-94c0-77d9f030fbc2`
端点协议: 三个 server-to-server JSON 端点 + 一次性 ticket 兑换

> ⚠️ `client_secret` 只能存放在你的**业务后端**, 绝对不要下发到浏览器。
> 推荐前端走自家 `/api/sms/*` -> 后端代理转发到本中转站。

---

## 0. 准备

向中转站管理员提供:
- `client` 名称 (英数 + `_-`, 例如 `qicai`)
- 你站点的 `origin` (例: `https://66cai.site`)
- 登录完成回调路径 `done_path` (例: `/login/phone-done`)

管理员会下发: `client`, `client_secret` (≥16 字符, 长随机串)。

---

## 1. 三步流程

```
前端                你的后端                wx.lovclaw.com
 │  请求 sid          │                       │
 │ ─────────────────► │  POST /api/public/sms/start
 │                    │ ────────────────────► │
 │ ◄──────── sid ──── │ ◄──────── sid ─────── │
 │  填手机号 / 点发送  │                       │
 │ ─────────────────► │  POST /api/public/sms/send
 │                    │ ────────────────────► │  (调阿里云发短信)
 │ ◄────── ok ─────── │ ◄────── ok ────────── │
 │  填验证码           │                       │
 │ ─────────────────► │  POST /api/public/sms/verify
 │                    │ ────────────────────► │
 │ ◄── login done ─── │ ◄────── ticket ────── │
 │                    │  POST /api/public/oauth/exchange
 │                    │ ────────────────────► │
 │                    │ ◄──── { phone } ───── │
 │                    │  ↳ 在你的库里查/建用户, 下发自家 session
```

---

## 2. 端点详细

所有端点:
- 方法: `POST`
- `Content-Type: application/json`
- 响应永远 JSON, 字段 `ok: true|false`
- 已配置 CORS (反射你的 `origin`), 但**仍建议从你的后端调用**避免泄露 `client_secret`

公共必填字段:
```json
{ "client": "qicai", "client_secret": "xxxxxxxxxxxxxxxxxxxx" }
```

### 2.1 `POST /api/public/sms/start`
申请一个登录会话 sid。

请求:
```json
{
  "client": "qicai",
  "client_secret": "...",
  "return_path": "/dashboard"   // 可选, 仅供你自己后续重定向时用
}
```
响应 200:
```json
{ "ok": true, "sid": "xxxxxxxx...", "expires_in": 600 }
```
- `sid` 有效期 10 分钟
- 同一个 `sid` 可多次发码 (受 60s/手机号 冷却), `verify` 成功后失效

错误:
- `401 unknown_client` / `401 bad_credentials`
- `400 invalid_request`

### 2.2 `POST /api/public/sms/send`
向手机号下发 6 位验证码。

请求:
```json
{
  "client": "qicai",
  "client_secret": "...",
  "sid": "....",
  "phone": "13800001111"   // 中国大陆, 接受 +8613..., 008613..., 13...
}
```
响应 200:
```json
{ "ok": true, "cooldown": 60 }
```
错误:
- `400 invalid_phone`
- `429 rate_limited` (附带 `retry_after` 秒数, 单手机号 60s 冷却)
- `410 session_expired` (sid 失效, 重新 start)
- `403 sid_client_mismatch` (sid 不属于你)
- `502 send_failed` (附带 `message`, 来自阿里云)

### 2.3 `POST /api/public/sms/verify`
校验验证码, 拿到一次性 `ticket`。

请求:
```json
{
  "client": "qicai",
  "client_secret": "...",
  "sid": "....",
  "phone": "13800001111",
  "code": "123456"
}
```
响应 200:
```json
{ "ok": true, "ticket": "yyyy....", "expires_in": 120 }
```
错误:
- `400 bad_code` (验证码错误, sid 仍然有效, 用户可继续输码)
- `400 too_many_attempts` (5 次后锁定, 需重新 send)
- `410 expired` / `410 session_expired`
- `403 sid_client_mismatch`

### 2.4 `POST /api/public/oauth/exchange`
用 `ticket` 换取手机号。**只能换一次, 2 分钟内有效。**

请求:
```json
{ "client": "qicai", "client_secret": "...", "ticket": "yyyy...." }
```
响应 200 (手机号通道):
```json
{
  "provider": "phone",
  "phone": "+8613800001111",   // E.164 格式, 始终带 +86 前缀
  "issued_at": 1730800000
}
```
错误:
- `410 ticket_not_found_or_expired` / `410 ticket_already_used`
- `403 ticket_client_mismatch`

> 同一端点也支持 `provider: "wechat"` 的 ticket — 见微信扫码登录文档。

---

## 3. 后端代理示例 (Node / fetch)

```ts
// 你站点: POST /api/sms/start
const RELAY = "https://wx.lovclaw.com";
const CREDS = { client: "qicai", client_secret: process.env.RELAY_CLIENT_SECRET! };

async function relay(path: string, body: object) {
  const r = await fetch(`${RELAY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...CREDS, ...body }),
  });
  return { status: r.status, json: await r.json() };
}

app.post("/api/sms/start",  async (req, res) => {
  const { status, json } = await relay("/api/public/sms/start", {
    return_path: req.body.return_path,
  });
  // 把 sid 透传给前端 (不要透传 client_secret)
  res.status(status).json(json);
});

app.post("/api/sms/send",   async (req, res) => {
  const { sid, phone } = req.body;
  const { status, json } = await relay("/api/public/sms/send", { sid, phone });
  res.status(status).json(json);
});

app.post("/api/sms/verify", async (req, res) => {
  const { sid, phone, code } = req.body;
  const v = await relay("/api/public/sms/verify", { sid, phone, code });
  if (!v.json.ok) return res.status(v.status).json(v.json);

  // 一步到位换手机号
  const ex = await relay("/api/public/oauth/exchange", { ticket: v.json.ticket });
  if (ex.json.provider !== "phone") return res.status(500).json({ error: "unexpected" });

  // === 你的业务: upsert 用户, 下发自家 session ===
  const user = await upsertUserByPhone(ex.json.phone);
  await issueSessionCookie(res, user.id);

  res.json({ ok: true });
});
```

---

## 4. 安全要点

- `client_secret` 仅在你的后端环境变量里; 不要提交到代码库, 不要返回给前端
- 收到 `ticket` 后立刻在**同一个后端进程**内 exchange, 不要把 ticket 发给前端
- 校验阶段把用户输入 `phone` 与 `code` 都做 trim + 长度限制
- 你自己的 `/api/sms/send` 建议加: 同 IP/同账号的 1 分钟内最多 1 次, 防刷
- 登录完成后下发的是**你自家的 session**, 与中转站无关

---

## 5. 错误对照速查

| HTTP | error                          | 处理                            |
| ---- | ------------------------------ | ------------------------------ |
| 400  | invalid_request / invalid_json | 检查请求体                       |
| 400  | invalid_phone                  | 提示用户重输手机号               |
| 400  | bad_code                       | 提示验证码错误, 允许重试         |
| 400  | too_many_attempts              | 重新 send                       |
| 401  | unknown_client                 | 检查 client 名称                |
| 401  | bad_credentials                | 检查 client_secret              |
| 403  | sid_client_mismatch            | sid 不属于你, 重新 start        |
| 410  | session_expired / expired      | sid 或验证码过期, 重新发起       |
| 410  | ticket_not_found_or_expired    | 2 分钟内未 exchange, 重新登录   |
| 410  | ticket_already_used            | 同一 ticket 不能复用             |
| 429  | rate_limited                   | 等待 `retry_after` 秒           |
| 502  | send_failed                    | 阿里云返回; `message` 给运营查   |

---

## 6. 联调

健康检查 (公开): `GET https://wx.lovclaw.com/healthz`
- 返回 `env.ALIYUN_SMS_*: true` 表示短信链路已配置

如需把你的 `client` 加入白名单, 联系中转站管理员提供:
`client = qicai`, `origin = https://66cai.site`, `done_path = /login/phone-done` (登录跳转回调可暂不使用)。
