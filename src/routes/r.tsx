import { createFileRoute } from "@tanstack/react-router";
import { getActiveShareDomain, sanitizeSharePath } from "../server/share-domains.server";

function buildTargetUrl(request: Request): { url: string | null; reason?: string } {
  const u = new URL(request.url);
  const active = getActiveShareDomain();
  if (!active) return { url: null, reason: "no_active_domain" };

  const to = sanitizeSharePath(u.searchParams.get("to"));
  // 透传所有 query，去掉 to 本身（to 已合并进 path）
  const passthrough = new URLSearchParams();
  for (const [k, v] of u.searchParams.entries()) {
    if (k === "to") continue;
    passthrough.append(k, v);
  }
  const qs = passthrough.toString();
  const target = `https://${active}${to}${qs ? (to.includes("?") ? "&" : "?") + qs : ""}`;
  return { url: target };
}

function isWeChatUA(ua: string | null): boolean {
  return !!ua && /MicroMessenger/i.test(ua);
}

export const Route = createFileRoute("/r")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { url, reason } = buildTargetUrl(request);
        if (!url) {
          return new Response(`share redirect unavailable: ${reason}`, {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        const ua = request.headers.get("user-agent");
        // 微信内置浏览器：返回一个极小的中转 HTML，停留 ~500ms 后再跳，规避部分微信版本对 302 的拦截
        if (isWeChatUA(ua)) {
          const safeUrl = url.replace(/"/g, "&quot;");
          const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${safeUrl}"><title>正在跳转…</title><style>html,body{height:100%;margin:0;background:#0a0a0a;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.wrap{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}.dot{width:8px;height:8px;border-radius:50%;background:#10b981;animation:p 1s infinite ease-in-out}@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}</style></head><body><div class="wrap"><div class="dot"></div><div>正在跳转，请稍候…</div></div><script>setTimeout(function(){location.replace(${JSON.stringify(url)})},500);</script></body></html>`;
          return new Response(html, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: url,
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      },
    },
  },
});
