// POST /api/public/oauth/wechat/exchange
// Server-to-server endpoint. Business backend POSTs:
//   { "ticket": "...", "client": "a", "client_secret": "..." }
// On success, returns the WeChat user payload exactly once.
//
// Placed under /api/public so platform auth middleware does not reject the call.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getClient, verifyClientSecret } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import type { TicketRecord } from "./wechat.callback";

const BodySchema = z.object({
  ticket: z.string().min(20).max(200),
  client: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  client_secret: z.string().min(16).max(512),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/public/oauth/wechat/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          const raw = await request.json();
          parsed = BodySchema.parse(raw);
        } catch {
          return json(400, { error: "invalid_request" });
        }

        const client = getClient(parsed.client);
        if (!client) return json(401, { error: "unknown_client" });

        const ok = await verifyClientSecret(client, parsed.client_secret);
        if (!ok) return json(401, { error: "bad_credentials" });

        // Atomic take: ticket is one-shot.
        const rec = await getKV().take<TicketRecord>(`ticket:${parsed.ticket}`);
        if (!rec) return json(410, { error: "ticket_not_found_or_expired" });
        if (rec.used) return json(410, { error: "ticket_already_used" });
        if (rec.client !== parsed.client) return json(403, { error: "ticket_client_mismatch" });

        // (rec was already removed by `take`, so it cannot be reused.)
        return json(200, {
          openid: rec.user.openid,
          unionid: rec.user.unionid ?? null,
          nickname: rec.user.nickname ?? null,
          avatar: rec.user.avatar ?? null,
          sex: rec.user.sex ?? null,
          province: rec.user.province ?? null,
          city: rec.user.city ?? null,
          country: rec.user.country ?? null,
          issued_at: Math.floor(rec.created_at / 1000),
        });
      },
      OPTIONS: async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600",
          },
        });
      },
    },
  },
});
