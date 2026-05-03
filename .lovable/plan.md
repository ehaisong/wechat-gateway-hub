## 目标

在现有微信登录中转站 `wx.lovclaw.com` 上新增「手机号 + 短信验证码」登录通道，复用现有 ticket 机制：
- 使用阿里云短信服务（Dysmsapi）发码 + 中转站本地校验
- 中转站托管登录页 `/login/phone`
- 业务站只需添加一种"登录入口" `/oauth/phone/start?client=...`，回调形态与微信登录完全一致：`done_path?ticket=...`
- 回兑 payload 简洁：`{provider:"phone", phone:"+8613800001111", issued_at}`

## 整体流程

```text
业务站 "手机号登录" 按钮
  └─ 302 -> https://wx.lovclaw.com/oauth/phone/start?client=a&return_path=/dashboard
      └─ 302 -> /login/phone?sid=<state>           (中转站托管页, 同源)
          ├─ 用户输入手机号 -> POST /api/sms/send {sid, phone, captcha?}
          │   └─ 中转站调用阿里云 SMS 发码, 写入 KV
          ├─ 用户输入验证码 -> POST /api/sms/verify {sid, phone, code}
          │   └─ 校验通过, 签发 ticket, 返回 {ticket, redirect}
          └─ 前端 location.replace(redirect)
              └─ 302 -> https://a.com/login/wechat-done?ticket=...&provider=phone

业务站后端 POST https://wx.lovclaw.com/api/public/oauth/exchange
  body: { ticket, client, client_secret }
  resp: { provider:"phone", phone:"+8613800001111", issued_at }
```

要点：
- 业务站现有 `/login/wechat-done` 页面只需扩展兼容 `provider=phone`，无需新做页面（建议起一个语义化通用名 `/login/done`，但向后兼容 `wechat-done`）。
- 兑换接口复用同一个 endpoint，按 `provider` 字段区分 payload，业务站一处接入。

## 新增/改动文件

### 一、阿里云 SMS 客户端（新增）
`src/server/aliyun-sms.server.ts`
- 实现阿里云 RPC 风格 v3 (Dysmsapi 2017-05-25) `SendSms` 签名（HMAC-SHA1，POPv3）
- 不引入 `@alicloud/*` SDK（含 Node 原生依赖、Worker 跑不动），用纯 fetch + Web Crypto 自实现签名
- 入参：`{ phone, code, signName, templateCode, templateParam:{code} }`
- 出参：`{ ok, requestId, bizId?, code, message }`
- 失败抛业务错误（含 aliyun Code/Message）

环境变量：
- `ALIYUN_SMS_ACCESS_KEY_ID`
- `ALIYUN_SMS_ACCESS_KEY_SECRET`
- `ALIYUN_SMS_SIGN_NAME`（短信签名，例如「轻爪科技」）
- `ALIYUN_SMS_TEMPLATE_CODE`（模板 CODE，例如 `SMS_123456789`）
- `ALIYUN_SMS_REGION`（默认 `cn-hangzhou`，endpoint `dysmsapi.aliyuncs.com`）

### 二、手机号验证码业务层（新增）
`src/server/phone-otp.server.ts`
封装 KV 操作 + 限流 + 校验：
- `requestOtp(sid, phone, ip)`：
  - 校验 phone 格式（默认中国大陆 `1[3-9]\d{9}`，可加 E.164 兼容）
  - 限流：
    - `rl:phone:<phone>` 60s 内只允许 1 次
    - `rl:phone-day:<phone>` 24h 内最多 10 次
    - `rl:ip:<ip>` 5 分钟内最多 5 次
  - 生成 6 位随机 code（`crypto.getRandomValues`）
  - 写入 `otp:<sid>:<phone>` = `{codeHash, attempts:0, exp:5min}`，TTL 300s
  - 调用阿里云发送
- `verifyOtp(sid, phone, code)`：
  - 取 `otp:<sid>:<phone>`
  - `attempts++`，>=5 直接删除并返回 `too_many_attempts`
  - 比对 sha256(code+sid)，成功则删除并返回 ok
- code 在 KV 中只存 hash，避免 KV 泄露 = 验证码泄露

### 三、起点路由（新增）
`src/routes/oauth.phone.start.ts` (`/oauth/phone/start`)
与 `oauth.wechat.start.ts` 结构对称：
- 校验 `client`、`return_path`
- 创建 `state` 记录写 KV：`{client, return_path, provider:"phone", created_at}`，TTL 10 分钟
- 302 到同站 `/login/phone?sid=<state>`

### 四、托管登录页（新增 SSR + 客户端）
`src/routes/login.phone.tsx`
- SSR 校验 `sid` 存在且未过期，否则渲染错误页
- 渲染极简表单（用现有 shadcn `Input` `Button`）：
  - Step 1: 手机号 + 「发送验证码」按钮
  - Step 2: 6 位验证码输入（`InputOTP`）+ 「登录」按钮
  - 60s 倒计时 + 错误提示 + loading 态
- 全部走 fetch 调下面两个 API；成功后用返回的 redirect URL 跳走

### 五、API 路由（新增）
`src/routes/api.sms.send.ts` (`/api/sms/send`)
- 仅同源调用，校验 Origin/Referer 与 `RELAY_BASE_URL` 一致（防外站滥用）
- body: `{sid, phone}`，Zod 校验
- 取出 IP（`x-forwarded-for` 第一个）做 IP 限流
- 调 `requestOtp`
- resp: `{ok:true, cooldown:60}` 或 `{ok:false, error:"rate_limited", retry_after}`

`src/routes/api.sms.verify.ts` (`/api/sms/verify`)
- 同源校验
- body: `{sid, phone, code}`
- 取出 sid 对应 state（不消费），校验存在 + provider==="phone"
- 调 `verifyOtp`
- 成功：
  - 签发 `ticket` 写 KV `ticket:<ticket>` = `{client, provider:"phone", phone:"+86xxx", created_at}`，TTL 2 分钟
  - 消费 state（删除）
  - 返回 `{ok:true, redirect:"https://a.com/login/wechat-done?ticket=...&provider=phone"}`
- 失败：`{ok:false, error:"bad_code"|"expired"|"too_many_attempts"}`

### 六、改动现有文件

`src/routes/wechat.callback.ts`
- 把 `TicketRecord` 类型移到 `src/server/ticket.server.ts`，新增 `provider:"wechat"|"phone"` 字段；微信路径写入时补 `provider:"wechat"`
- `done_path?ticket=...` 后追加 `&provider=wechat`（业务站无需依赖也可用）

`src/routes/api.public.oauth.wechat.exchange.ts`
- 改名/新增同义路由 `src/routes/api.public.oauth.exchange.ts` (`/api/public/oauth/exchange`)，同时保留旧路径作为别名 302 / 双导出，避免破坏 66cai.site
- 响应根据 `provider` 分支：
  - `wechat`：原样
  - `phone`：`{provider:"phone", phone, issued_at}`

`src/routes/healthz.ts`
- env 自检追加 5 项：`ALIYUN_SMS_ACCESS_KEY_ID/SECRET/SIGN_NAME/TEMPLATE_CODE/REGION`

`src/server/clients.server.ts`
- 无需改动（仍用同一份 client 白名单）

`.env.example`
- 追加 5 项阿里云配置

### 七、日志
所有新增端点统一加 `[phone-start] / [phone-page] / [sms-send] / [sms-verify] / [aliyun]` 前缀，记录：
- sid 前 8 位、phone 脱敏（`138****1111`）、IP、UA、限流命中、阿里云 requestId、耗时
- 不打印 code / accessKeySecret

## 业务站接入提示词（产出物）

最后给一段简短提示词复制给 66cai.site 项目，要点：
1. 新增按钮「手机号登录」，跳 `https://wx.lovclaw.com/oauth/phone/start?client=66cai&return_path=...`
2. `/login/wechat-done` 页面接收 `?ticket=...&provider=phone|wechat`，POST 到自家后端
3. 自家后端调 `POST https://wx.lovclaw.com/api/public/oauth/exchange { ticket, client, client_secret }`，按 `provider` 分支：phone → 用 phone upsert 用户；wechat → 沿用现状

## 用户需要做的事

1. 阿里云控制台准备：
   - RAM 子账号 + AK/SK，授权 `AliyunDysmsFullAccess`
   - 短信签名（已审核通过）
   - 短信模板（变量占位 `${code}`，例如：`您的验证码是${code}，5 分钟内有效，请勿泄露。`）
2. 在 Zeabur 添加 5 个环境变量（见上）
3. 重新部署并访问 `https://wx.lovclaw.com/healthz` 确认 env 全为 true

## 安全/合规小结

- code 只存 hash + 一次性 + TTL + 5 次尝试上限
- 三层限流：单号 60s / 单号 24h / 单 IP 5min
- 同源校验防止 CSRF + 第三方刷接口
- ticket 一次性、2 分钟过期、client_secret 二次校验、payload 不进浏览器
- 日志全程脱敏

## 不在本次范围

- 图形验证码（已留好 send 接口的 `captcha?` 字段，后续接入 hCaptcha/腾讯云验证码无需改协议）
- 国际号段（默认仅中国大陆，阿里云国际短信需另买产品另签名）
- 多语言 UI（先中文）

确认无误后我切到执行模式实施。如果需要，我可以先只实现「中转站本身」，业务站接入文档我会同步生成。
