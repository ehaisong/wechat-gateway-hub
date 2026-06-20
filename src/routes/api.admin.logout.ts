// POST /api/admin/logout — 管理员登出
import { createFileRoute } from "@tanstack/react-router";
import { adminClearCookieHeader, verifyAdminRequest } from "@/server/auth.server";
import { logAdminLogout } from "@/server/logger.server";

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
}

export const Route = createFileRoute("/api/admin/logout")({
  // @ts-expect-error server option
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") || "";
        logAdminLogout(ip, ua);

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": adminClearCookieHeader(),
          },
        });
      },
    },
  },
});
