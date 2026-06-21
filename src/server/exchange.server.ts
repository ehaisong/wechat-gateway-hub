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
import { logClientCall } from "@/server/logger.server";

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

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
}

export async function handleExchange(request: Request): Promise<Response> {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return json(400, { error: "invalid_request" });
  }
  return exchangeCore(parsed, request);
}

/** GET 版本：从 URL query 参数读取（兼容前端直接 GET 调用） */
export async function handleExchangeGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = Body.safeParse({
    ticket: url.searchParams.get("ticket") ?? "",
    client: url.searchParams.get("client") ?? "",
    client_secret: url.searchParams.get("client_secret") ?? "",
  });
  if (!parsed.success) {
    return json(400, { error: "invalid_request", details: parsed.error.flatten().fieldErrors });
  }
  return exchangeCore(parsed.data, request);
}

async function exchangeCore(parsed: z.infer<typeof Body>, request: Request): Promise<Response> {

  const client = getClient(parsed.client);
  if (!client) {
    logClientCall(parsed.client, "ticket兑换", getClientIp(request), "unknown_client", false);
    return json(401, { error: "unknown_client" });
  }

  const ok = await verifyClientSecret(client, parsed.client_secret);
  if (!ok) {
    logClientCall(parsed.client, "ticket兑换", getClientIp(request), "bad_credentials", false);
    return json(401, { error: "bad_credentials" });
  }

  const rec = await getKV().take<TicketRecord>(`ticket:${parsed.ticket}`);
  if (!rec) {
    logClientCall(parsed.client, "ticket兑换", getClientIp(request), "ticket_not_found_or_expired", false);
    return json(410, { error: "ticket_not_found_or_expired" });
  }
  if (rec.used) {
    logClientCall(parsed.client, "ticket兑换", getClientIp(request), "ticket_already_used", false);
    return json(410, { error: "ticket_already_used" });
  }
  if (rec.client !== parsed.client) {
    logClientCall(parsed.client, "ticket兑换", getClientIp(request), "ticket_client_mismatch", false);
    return json(403, { error: "ticket_client_mismatch" });
  }

  const issued_at = Math.floor(rec.created_at / 1000);

  if (rec.provider === "phone") {
    logClientCall(parsed.client, "ticket兑换(手机)", getClientIp(request), "ok");
    return json(200, {
      provider: "phone",
      phone: rec.user.phone,
      issued_at,
    });
  }

  // wechat (default + back-compat: 旧调用方拿到的字段位置不变)
  logClientCall(parsed.client, "ticket兑换(微信)", getClientIp(request), "ok");
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
