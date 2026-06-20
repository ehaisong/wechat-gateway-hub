// POST /api/admin/login — 管理员登录
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminPassword, signAdminToken, adminSetCookieHeader } from "@/server/auth.server";
import { logAdminLogin } from "@/server/logger.server";

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
}

export const Route = createFileRoute("/api/admin/login")({
  // @ts-expect-error server option
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") || "";

        try {
          const body = (await request.json()) as { password?: string };
          const password = body?.password || "";

          if (!verifyAdminPassword(password)) {
            logAdminLogin(ip, ua, false, "密码错误");
            return new Response(
              JSON.stringify({ ok: false, error: "invalid_password", message: "密码错误" }),
              { status: 401, headers: { "Content-Type": "application/json" } },
            );
          }

          const token = signAdminToken();
          logAdminLogin(ip, ua, true);
          return new Response(
            JSON.stringify({ ok: true }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": adminSetCookieHeader(token),
              },
            },
          );
        } catch {
          logAdminLogin(ip, ua, false, "请求格式错误");
          return new Response(
            JSON.stringify({ ok: false, error: "invalid_request", message: "请求格式错误" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
