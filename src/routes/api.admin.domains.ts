// /api/admin/domains — 分享域名池管理
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminRequest } from "@/server/auth.server";
import { adminGetDomains, adminUpdateDomains } from "@/server/admin-api.server";
import { logAdminAction } from "@/server/logger.server";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
}

export const Route = createFileRoute("/api/admin/domains")({
  // @ts-expect-error server option
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        return jsonResponse(adminGetDomains());
      },

      POST: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") || "";

        try {
          const body = (await request.json()) as { domains: { domain: string; enabled: boolean; isPrimary: boolean }[] };
          const result = adminUpdateDomains(body.domains || []);
          if ("error" in result) {
            return jsonResponse({ ok: false, ...result }, 400);
          }
          logAdminAction(ip, ua, "更新分享域名池", `${body.domains?.length || 0} 个域名`);
          return jsonResponse(result);
        } catch {
          return jsonResponse({ ok: false, error: "invalid_request" }, 400);
        }
      },
    },
  },
});
