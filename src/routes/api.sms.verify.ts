// POST /api/sms/verify  body: { sid, phone, code }
// 同源校验 -> verifyOtp -> 签发 ticket -> 返回 redirect URL

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getKV } from "@/server/kv.server";
import { verifyOtp } from "@/server/phone-otp.server";
import { randomToken } from "@/server/crypto.server";
import { getClient } from "@/server/clients.server";
import type { PhoneStateRecord } from "./oauth.phone.start";
import type { TicketRecord } from "@/server/ticket.server";

const Body = z.object({
  sid: z.string().min(20).max(200),
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(8),
});

const TICKET_TTL_SECONDS = 2 * 60;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function checkSameOrigin(req: Request): boolean {
  const base = (process.env.RELAY_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return false;
  const origin = req.headers.get("origin");
  if (origin && origin === base) return true;
  const referer = req.headers.get("referer");
  if (referer && referer.startsWith(base + "/")) return true;
  return false;
}

export const Route = createFileRoute("/api/sms/verify")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!checkSameOrigin(request)) {
          console.warn(
            `[sms-verify] cross_origin_blocked origin=${request.headers.get("origin") ?? "-"} ` +
              `referer=${request.headers.get("referer") ?? "-"}`,
          );
          return json(403, { ok: false, error: "forbidden" });
        }

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return json(400, { ok: false, error: "invalid_request" });
        }

        const state = await getKV().take<PhoneStateRecord>(`state:${parsed.sid}`);
        if (!state || state.provider !== "phone") {
          console.warn(`[sms-verify] invalid_sid sid=${parsed.sid.slice(0, 8)}…`);
          return json(410, { ok: false, error: "session_expired" });
        }
        const client = getClient(state.client);
        if (!client) {
          console.warn(`[sms-verify] unknown_client name="${state.client}"`);
          return json(410, { ok: false, error: "client_offline" });
        }

        const v = await verifyOtp(parsed.sid, parsed.phone, parsed.code);
        if (!v.ok) {
          // verify 失败时, state 已被取走 -> 需要重新发起整个流程, 返回特定 hint
          if (v.error === "bad_code") {
            // 把 state 写回, 让用户在同一页面继续输码
            await getKV().set(`state:${parsed.sid}`, state, 5 * 60);
          }
          const status = v.error === "expired" ? 410 : 400;
          return json(status, v);
        }

        const ticket = randomToken(32);
        const rec: TicketRecord = {
          provider: "phone",
          client: state.client,
          used: false,
          created_at: Date.now(),
          user: { phone: v.phone },
        };
        await getKV().set(`ticket:${ticket}`, rec, TICKET_TTL_SECONDS);

        const back = new URL(client.done_path, client.origin);
        back.searchParams.set("ticket", ticket);
        back.searchParams.set("provider", "phone");
        if (state.return_path && state.return_path !== "/") {
          back.searchParams.set("return_path", state.return_path);
        }

        console.log(
          `[sms-verify] ok client=${state.client} -> ${back.origin}${back.pathname} ` +
            `ticket=${ticket.slice(0, 8)}…`,
        );

        return json(200, { ok: true, redirect: back.toString() });
      },
    },
  },
});
