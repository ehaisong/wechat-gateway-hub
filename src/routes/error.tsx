import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/error")({
  head: () => ({
    meta: [
      { title: "Login Error — WeChat Login Relay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ErrorPage,
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : "unknown",
    msg: typeof s.msg === "string" ? s.msg : "登录过程中出现了一个问题。",
  }),
});

const FRIENDLY: Record<string, string> = {
  unknown_client: "未知或未注册的来源站点。",
  misconfigured: "中转服务尚未完成配置,请联系管理员。",
  missing_state: "缺少 state 参数,请重新发起登录。",
  invalid_state: "登录会话已过期或无效,请重新发起登录。",
  user_cancelled: "你在微信中取消了授权。",
  wechat_token_failed: "向微信换取登录凭证失败,请稍后重试。",
};

function ErrorPage() {
  const { code, msg } = Route.useSearch();
  const friendly = FRIENDLY[code] ?? msg;

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.5 3.75h3l7.5 13.5-1.5 2.25h-15L1.5 17.25l9-13.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">登录未完成</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{friendly}</p>

        <div className="mt-6 rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground">
          <div><span className="opacity-60">code:</span> <code className="text-foreground">{code}</code></div>
          {msg && code !== "unknown" && <div className="mt-1"><span className="opacity-60">msg:</span> {msg}</div>}
        </div>

        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            返回首页
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          请回到原业务站点重新点击「微信登录」。
        </p>
      </div>
    </div>
  );
}
