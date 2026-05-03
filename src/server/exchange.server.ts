// POST /api/public/oauth/wechat/exchange   (legacy alias)
// POST /api/public/oauth/exchange          (canonical, supports both providers)
//
// 业务后端调用:
//   { ticket, client, client_secret }
// 响应按 provider 分支:
//   wechat: { provider:"wechat", openid, unionid, nickname, avatar, ... }
//   phone : { provider:"phone",  phone, issued_at }

import { z } from "zod";
import { getClient, verifyClientSecret } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import type { TicketRecord } from "@/server/ticket.server";

const Body = z.object({
  ticket: z.string().min(20).max(200),
  client: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  client_secret: z.string().min(16).max(512),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleExchange(request: Request): Promise<Response> {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return json(400, { error: "invalid_request" });
  }

  const client = getClient(parsed.client);
  if (!client) return json(401, { error: "unknown_client" });

  const ok = await verifyClientSecret(client, parsed.client_secret);
  if (!ok) return json(401, { error: "bad_credentials" });

  const rec = await getKV().take<TicketRecord>(`ticket:${parsed.ticket}`);
  if (!rec) return json(410, { error: "ticket_not_found_or_expired" });
  if (rec.used) return json(410, { error: "ticket_already_used" });
  if (rec.client !== parsed.client) return json(403, { error: "ticket_client_mismatch" });

  const issued_at = Math.floor(rec.created_at / 1000);

  if (rec.provider === "phone") {
    return json(200, {
      provider: "phone",
      phone: rec.user.phone,
      issued_at,
    });
  }

  // wechat (default + back-compat: 旧调用方拿到的字段位置不变)
  return json(200, {
    provider: "wechat",
    openid: rec.user.openid,
    unionid: rec.user.unionid ?? null,
    nickname: rec.user.nickname ?? null,
    avatar: rec.user.avatar ?? null,
    sex: rec.user.sex ?? null,
    province: rec.user.province ?? null,
    city: rec.user.city ?? null,
    country: rec.user.country ?? null,
    issued_at,
  });
}

export function optionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}
