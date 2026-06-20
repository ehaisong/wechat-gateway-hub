// /api/admin/status — 系统状态
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminRequest } from "@/server/auth.server";
import { adminGetStatus, adminGetKVStatus } from "@/server/admin-api.server";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/admin/status")({
  // @ts-expect-error server option
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

        const status = adminGetStatus();
        const kvStatus = await adminGetKVStatus();
        return jsonResponse({ ...status, kv: kvStatus });
      },
    },
  },
});
