// Shared helpers for /api/public/sms/* endpoints.
// Server-to-server only: every request must carry { client, client_secret }.
// Frontend must NOT call these directly — business backend proxies.

import { z } from "zod";
import { getClient, verifyClientSecret, sanitizeReturnPath, type ClientConfig } from "@/server/clients.server";

export const STATE_TTL_SECONDS = 10 * 60;
export const TICKET_TTL_SECONDS = 2 * 60;

export const AuthBody = z.object({
  client: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  client_secret: z.string().min(16).max(512),
});

export function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/** CORS headers reflecting the configured client.origin (or "*" if none/unknown). */
export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function preflightResponse(request: Request): Response {
  // We don't know the client here without a body, so allow any origin for preflight.
  // Actual POST will validate client+secret and reflect the right origin.
  const reqOrigin = request.headers.get("origin");
  return new Response(null, { status: 204, headers: corsHeaders(reqOrigin) });
}

export async function authenticate(
  request: Request,
): Promise<{ ok: true; client: ClientConfig; clientName: string } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: jsonResponse(400, { ok: false, error: "invalid_json" }) };
  }
  const parsed = AuthBody.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonResponse(400, { ok: false, error: "invalid_request" }) };
  }
  const client = getClient(parsed.data.client);
  if (!client) {
    return { ok: false, response: jsonResponse(401, { ok: false, error: "unknown_client" }) };
  }
  const ok = await verifyClientSecret(client, parsed.data.client_secret);
  if (!ok) {
    return { ok: false, response: jsonResponse(401, { ok: false, error: "bad_credentials" }) };
  }
  // Re-attach the parsed body to the request via a cloned helper so handlers can re-read it.
  (request as Request & { __parsedBody?: unknown }).__parsedBody = body;
  return { ok: true, client, clientName: parsed.data.client };
}

export function getParsedBody(request: Request): unknown {
  return (request as Request & { __parsedBody?: unknown }).__parsedBody;
}

export { sanitizeReturnPath };
