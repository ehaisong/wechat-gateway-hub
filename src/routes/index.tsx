import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WeChat Login Relay" },
      { name: "description", content: "Unified WeChat QR-code login relay for multi-frontend systems." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <header className="mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            service online
          </div>
          <h1 className="mt-6 text-4xl md:text-5xl font-bold tracking-tight">
            WeChat Login Relay
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
            微信扫码登录中转站。统一承接微信开放平台网站应用的授权回调,并把登录凭证安全分发回各业务前端。
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Endpoints
          </h2>
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            <EndpointRow method="GET" path="/oauth/wechat/start" caller="browser" desc="入口,生成 state,跳转微信二维码" />
            <EndpointRow method="GET" path="/wechat/callback" caller="WeChat" desc="授权回调,签发 ticket,跳回业务站点" />
            <EndpointRow method="POST" path="/api/public/oauth/wechat/exchange" caller="business backend" desc="ticket + client_secret 换取用户信息(一次性)" />
            <EndpointRow method="GET" path="/healthz" caller="monitor" desc="健康检查" />
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            How it works
          </h2>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs leading-relaxed text-foreground/90">
{`a.com  ─click──►  b.com /oauth/wechat/start?client=a&return_path=/dashboard
                   │
                   │  state ⇒ KV  {client, return_path, exp 5m}
                   ▼
              open.weixin.qq.com/connect/qrconnect (scope=snsapi_login)
                   │
                   ▼
       b.com /wechat/callback?code=…&state=…
                   │
                   │  code ⇒ openid/unionid/userinfo
                   │  ticket ⇒ KV  {client, user, exp 2m, used:false}
                   ▼
       a.com /login/wechat-done?ticket=…&return_path=/dashboard
                   │
                   │  POST b.com/api/public/oauth/wechat/exchange
                   │       { ticket, client, client_secret }
                   ▼
       a.com BFF set-cookie session  ──►  302 /dashboard`}
          </pre>
        </section>

        <section className="mb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Configuration
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li>• 微信开放平台「授权回调域」填写本服务部署的域名(例如 <code className="text-foreground">b.com</code>)。</li>
            <li>• 业务站点 <code className="text-foreground">a.com / c.com / d.com</code> 不需要在微信后台配置。</li>
            <li>• 通过环境变量 <code className="text-foreground">CLIENTS_JSON</code> 注册业务站点白名单。</li>
            <li>• 详见仓库根目录 <code className="text-foreground">README.md</code>。</li>
          </ul>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          直接访问本域名通常无意义 — 请从业务站点的「微信登录」按钮发起。
        </footer>
      </div>
    </div>
  );
}

function EndpointRow({ method, path, caller, desc }: { method: string; path: string; caller: string; desc: string }) {
  const methodColor =
    method === "GET" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
    method === "POST" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
    "bg-muted text-muted-foreground";
  return (
    <li className="grid grid-cols-1 md:grid-cols-[80px_1fr_140px] gap-2 md:gap-4 px-4 py-3 text-sm items-baseline">
      <span className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-bold ${methodColor}`}>{method}</span>
      <div>
        <code className="font-semibold">{path}</code>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <span className="text-xs text-muted-foreground md:text-right">caller: {caller}</span>
    </li>
  );
}
