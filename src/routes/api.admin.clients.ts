// /api/admin/clients — 客户端 CRUD
// 注意：TanStack Start 文件路由不支持 $name 动态段在此场景，
// 我们使用 query param 或 body 中的 name 来标识客户端
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminRequest } from "@/server/auth.server";
import {
  adminGetClients,
  adminUpsertClient,
  adminDeleteClient,
} from "@/server/admin-api.server";
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

export const Route = createFileRoute("/api/admin/clients")({
  // @ts-expect-error server option
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
        return jsonResponse(adminGetClients());
      },

      POST: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") || "";

        try {
          const body = await request.json() as {
            name: string;
            origin: string;
            done_path: string;
            client_secret: string;
          };
          const result = adminUpsertClient(body.name, {
            origin: body.origin,
            done_path: body.done_path,
            client_secret: body.client_secret,
          });
          if ("error" in result) {
            return jsonResponse({ ok: false, ...result }, 400);
          }
          logAdminAction(ip, ua, `修改客户端站点: ${body.name}`);
          return jsonResponse(result);
        } catch {
          return jsonResponse({ ok: false, error: "invalid_request" }, 400);
        }
      },

      DELETE: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        const ip = getClientIp(request);
        const ua = request.headers.get("user-agent") || "";
        const url = new URL(request.url);
        const name = url.searchParams.get("name") || "";
        if (!name) return jsonResponse({ ok: false, error: "missing_name" }, 400);

        const result = adminDeleteClient(name);
        if ("error" in result) {
          return jsonResponse({ ok: false, ...result }, 404);
        }
        logAdminAction(ip, ua, `删除客户端站点: ${name}`);
        return jsonResponse(result);
      },
    },
  },
});
