// GET /api/admin/session — 检查当前管理员 session
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminRequest } from "@/server/auth.server";

export const Route = createFileRoute("/api/admin/session")({
  // @ts-expect-error server option
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        return new Response(
          JSON.stringify({
            ok: true,
            authenticated: !!admin,
            expiresAt: admin?.exp ? admin.exp * 1000 : null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
