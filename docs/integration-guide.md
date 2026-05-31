# 微信中转登录 — 新站点接入文档

> 适用对象: 需要通过本中转站完成 **微信登录** (扫码 / 微信内授权) 的第三方业务站点
> 中转站地址: `https://wx.lovclaw.com`
> 协议: 浏览器 302 跳转 + 后端用一次性 `ticket` 兑换用户信息
> 同一套凭据也可直接复用 **短信验证码登录**, 详见末尾"扩展"。

---

## 0. 接入前你需要提供给中转站管理员

请把以下信息发给本中转站管理员, 我们会回填一个 `client_secret`:

| 字段 | 示例 | 说明 |
| ---- | ---- | ---- |
| `client` | `newsite` | 英数 + `_-`, 全小写, 在中转站全局唯一; 后续所有请求都要带 |
| `origin` | `https://newsite.com` | 你站点的**主域名**, 必须 `https`, 不要带末尾 `/` |
| `done_path` | `/login/wechat-done` | 登录完成后中转站会把浏览器 302 回这个路径 (你需要实现) |

管理员会下发:
- `client` (即上面那个名字)
- `client_secret` — **≥32 位长随机串, 仅在你的后端环境变量里使用**

> ⚠️ `client_secret` 等于你站点的"中转站后台口令"。**绝对不要**写进前端代码、不要提交进 git、不要打进客户端 bundle、不要通过任何接口下发到浏览器。

---

## 1. 整体流程

```
浏览器                你的站点                  wx.lovclaw.com           微信
  │ 点"微信登录"         │                              │                  │
  │ window.location ───────────────────────────────────►│                  │
  │   /oauth/wechat/start?client=newsite&return_path=/x │                  │
  │                                                     │ ─ 302 to 微信 ─► │
  │                                                     │ ◄ code+state ─── │
  │                                                     │ 用 code 换 openid │
  │ ◄── 302 to https://newsite.com/login/wechat-done?ticket=...&provider=wechat&return_path=/x
  │                                                     │                  │
  │  GET /login/wechat-done?ticket=...                                     │
  │     ├─ 前端把 ticket POST 给自家后端                                    │
  │     │     ├─ POST https://wx.lovclaw.com/api/public/oauth/exchange ───►│
  │     │     │       { client, client_secret, ticket }                    │
  │     │     │ ◄────── { openid, unionid, nickname, avatar, ... } ───────│
  │     │     │  ↳ upsert 用户 + 下发**你自己的** session cookie            │
  │     │ ◄── ok ──                                                        │
  │     └─ 前端 history.replace(return_path)                                │
```

关键点:
1. **中转站只把 `ticket` 通过 URL 回传**, 不会把 openid / 昵称 / 头像放进 URL。
2. `ticket` **2 分钟内必须由你的后端 exchange, 且只能换一次**。
3. 中转站根据 UA 自动选择: 微信内置浏览器 → 公众号网页授权 (`snsapi_userinfo`); 其他浏览器 → 网站应用扫码 (`snsapi_login`)。**你不用区分**。
4. 微信侧域名 (`wx.lovclaw.com`) 已经在「网站应用授权回调域」和「公众号网页授权域名」里配置好。**你的站点不需要去微信后台做任何配置**。

---

## 2. 端点详解

### 2.1 入口跳转 — `GET /oauth/wechat/start` (浏览器直接打开)

```
https://wx.lovclaw.com/oauth/wechat/start
    ?client=newsite                  // 必填
    &return_path=/dashboard          // 可选; 必须以 / 开头, 长度 ≤200, 禁止 //
    &flow=web|mp                     // 可选; 一般别传, 让中转站按 UA 自动选
```

实现方式: 一个普通的链接或按钮即可。

```html
<a href="https://wx.lovclaw.com/oauth/wechat/start?client=newsite&return_path=/dashboard">
  微信登录
</a>
```

失败时中转站会 302 到 `https://wx.lovclaw.com/error?code=...&msg=...`, 常见 `code`:

| code | 含义 |
| ---- | ---- |
| `unknown_client` | `client` 名不在白名单 → 检查拼写或联系管理员 |
| `misconfigured` | 中转站环境变量缺失 → 联系管理员 |
| `user_cancelled` | 用户在微信端取消授权 → 引导重试 |
| `wechat_token_failed` | 微信侧 code→token 失败 (通常是 code 过期) → 重试 |

### 2.2 完成回调 — 你需要实现 `GET {origin}{done_path}`

中转站授权完成后会 302 到:

```
https://newsite.com/login/wechat-done?ticket=<32字节随机>&provider=wechat[&return_path=/dashboard]
```

你的页面要做的事:

1. 从 URL 取 `ticket` 和 `return_path`。
2. **立刻** `POST` 给自己的后端 (例如 `/api/login/wechat-done`)。
3. 拿到结果后 `history.replaceState` 清掉 URL 上的 `ticket` (避免泄漏)。
4. 跳到 `return_path` (没有则跳首页)。

**禁止行为**:
- ❌ 不要在前端直接 `fetch('https://wx.lovclaw.com/api/public/oauth/exchange', ...)` — 会暴露 `client_secret`。
- ❌ 不要把 `ticket` 写进 `localStorage` / cookie / 分析脚本。
- ❌ 不要让用户能后退回到带 ticket 的 URL。

### 2.3 后端到后端 — `POST /api/public/oauth/exchange`

**只能从你的后端调**。

请求:

```http
POST https://wx.lovclaw.com/api/public/oauth/exchange
Content-Type: application/json

{
  "client": "newsite",
  "client_secret": "<你的 32+ 位 client_secret>",
  "ticket": "<从浏览器 URL 拿到的 ticket>"
}
```

响应 200:

```json
{
  "provider": "wechat",
  "openid":   "oABC...",          // 同一公众号/网站应用下唯一
  "unionid":  "uXYZ..." | null,   // 同开放平台主体下唯一 — 推荐用作用户主键
  "nickname": "张三" | null,
  "avatar":   "https://thirdwx.qlogo.cn/..." | null,
  "sex":      0 | 1 | 2 | null,
  "province": "Guangdong" | null,
  "city":     "Shenzhen" | null,
  "country":  "CN" | null,
  "issued_at": 1730800000
}
```

错误码:

| HTTP | error | 处理 |
| ---- | ----- | ---- |
| 400 | `invalid_request` | body 不符合 schema |
| 401 | `unknown_client` | `client` 没在白名单 |
| 401 | `bad_credentials` | `client_secret` 错 |
| 403 | `ticket_client_mismatch` | ticket 不属于你 |
| 410 | `ticket_not_found_or_expired` | 超过 2 分钟未换 / 不存在 |
| 410 | `ticket_already_used` | ticket 不能复用 |

---

## 3. 用户主键怎么选

| 字段 | 何时用 |
| ---- | ------ |
| `unionid` | **首选**。同一微信用户在你的网站应用 / 公众号 / 小程序下都是同一个 `unionid`, 是跨产品识别同一人的唯一字段。 |
| `openid` | 兜底。当 `unionid` 为 `null` 时使用。注意 **PC 扫码的 openid 与公众号的 openid 不互通**。 |

推荐表结构 (示意):

```sql
users         (id, ...)
user_wechat   (user_id, unionid UNIQUE NULLS NOT DISTINCT,
               openid_web, openid_mp, nickname, avatar, updated_at)
```

匹配逻辑:

```
1. 若 unionid 非空 → 按 unionid 查
2. 否则按当前 flow 对应的 openid 查 (web 进 openid_web, mp 进 openid_mp)
3. 都没命中 → 新建用户
4. 命中后用最新的 nickname/avatar 覆盖
```

---

## 4. 后端示例 (Node / Express)

```ts
const RELAY = "https://wx.lovclaw.com";
const CREDS = {
  client: "newsite",
  client_secret: process.env.RELAY_CLIENT_SECRET!, // 服务端 env, 永远别下发
};

// 浏览器 done_path 页面会 POST 到这里
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

  // 你的业务: upsert + 自家 session
  const user = await upsertUserByWechat({
    unionid:  data.unionid,
    openid:   data.openid,
    nickname: data.nickname,
    avatar:   data.avatar,
  });
  await issueSessionCookie(res, user.id);
  res.json({ ok: true });
});
```

前端 `done_path` 页面 (React 示意):

```tsx
// /login/wechat-done
import { useEffect } from "react";

export default function WechatDone() {
  useEffect(() => {
    const url    = new URL(window.location.href);
    const ticket = url.searchParams.get("ticket");
    const back   = url.searchParams.get("return_path") || "/";

    if (!ticket) {
      window.location.replace("/login?err=no_ticket");
      return;
    }

    // 立刻清掉 URL 上的 ticket
    window.history.replaceState({}, "", url.pathname);

    fetch("/api/login/wechat-done", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    })
      .then((r) => r.json())
      .then((j) => window.location.replace(j.ok ? back : "/login?err=exchange"))
      .catch(() => window.location.replace("/login?err=network"));
  }, []);

  return <p>登录中…</p>;
}
```

---

## 5. 安全清单 (上线前自查)

- [ ] `client_secret` 仅出现在后端运行时环境变量, **未**进 git / 未进前端 bundle
- [ ] 前端**不**直接调用 `wx.lovclaw.com` 的任何接口
- [ ] `done_path` 页面在 exchange 后用 `history.replaceState` 清掉 `ticket`
- [ ] `return_path` 在你的后端再校验一次: 必须以 `/` 开头, 不允许 `//` 或绝对 URL
- [ ] 自家 session cookie 设置 `HttpOnly; Secure; SameSite=Lax`
- [ ] 同 IP / 同账号对 `/api/login/wechat-done` 的频率有限制 (防刷 ticket 撞库)

---

## 6. 联调与排错

- 健康检查: `GET https://wx.lovclaw.com/healthz`
  返回里 `env.WECHAT_APPID / WECHAT_APPSECRET / WECHAT_MP_APPID / WECHAT_MP_APPSECRET / CLIENTS_JSON` 全 `true` 即配置就绪。
- 本地 dev 调试: 申请一个独立的 dev `client` (例如 `newsite-dev`), `origin` 填你的 dev 域名 (必须 https, 可用 ngrok / cloudflared)。
- 常见 401 `unknown_client` → 检查请求里的 `client` 名是否与白名单完全一致 (区分大小写)。
- 常见 401 `bad_credentials` → 检查后端 env 里的 `client_secret` 是否被截断 / 多了空格 / 用错环境。

---

## 7. 扩展: 同一 `client` 复用短信验证码登录

如果你也想用本中转站做手机号验证码登录, **可以复用同一对** `client` / `client_secret`, 无需重新申请。三个新端点:

| 端点 | 作用 |
| ---- | ---- |
| `POST /api/public/sms/start`  | 申请 `sid` (10 分钟有效) |
| `POST /api/public/sms/send`   | 给手机号下发 6 位验证码 (单号 60s 冷却) |
| `POST /api/public/sms/verify` | 校验验证码, 得到 `ticket` |

`ticket` 再走同一个 `/api/public/oauth/exchange` 兑换:

```json
{ "provider": "phone", "phone": "+8613800001111", "issued_at": 1730800000 }
```

详细字段、错误码与示例代码见: `docs/sms-public-api.md`。

---

## 8. 联系方式

接入 / 白名单 / `client_secret` 轮换, 联系本中转站管理员。把以下信息一起发过来可以一次开通:

```
client      = newsite
origin      = https://newsite.com
done_path   = /login/wechat-done
是否同时启用短信验证码登录 = 是 / 否
```
