// POST /api/public/sms/verify
// Body: { client, client_secret, sid, phone, code }
// Resp: { ok:true, ticket, expires_in } | { ok:false, error }
//
// ticket 通过现有 /api/public/oauth/exchange 兑换为 { provider:"phone", phone, ... }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getKV } from "@/server/kv.server";
import { verifyOtp } from "@/server/phone-otp.server";
import { randomToken } from "@/server/crypto.server";
import {
  TICKET_TTL_SECONDS,
  authenticate,
  corsHeaders,
  getParsedBody,
  jsonResponse,
  preflightResponse,
} from "@/server/public-sms.server";
import type { PhoneStateRecord } from "@/routes/oauth.phone.start";
import type { TicketRecord } from "@/server/ticket.server";

const BodyExtra = z.object({
  sid: z.string().min(20).max(200),
  phone: z.string().min(6).max(20),
  code: z.string().min(4).max(8),
});

export const Route = createFileRoute("/api/public/sms/verify")({
  server: {
    handlers: {
      OPTIONS: async ({ request }: { request: Request }) => preflightResponse(request),
      POST: async ({ request }: { request: Request }) => {
        const auth = await authenticate(request);
        if (!auth.ok) return auth.response;
        const reqOrigin = request.headers.get("origin");
        const cors = corsHeaders(reqOrigin === auth.client.origin ? auth.client.origin : reqOrigin);

        const extra = BodyExtra.safeParse(getParsedBody(request));
        if (!extra.success) {
          return jsonResponse(400, { ok: false, error: "invalid_request" }, cors);
        }

        const state = await getKV().take<PhoneStateRecord>(`state:${extra.data.sid}`);
        if (!state || state.provider !== "phone") {
          return jsonResponse(410, { ok: false, error: "session_expired" }, cors);
        }
        if (state.client !== auth.clientName) {
          return jsonResponse(403, { ok: false, error: "sid_client_mismatch" }, cors);
        }

        const v = await verifyOtp(extra.data.sid, extra.data.phone, extra.data.code);
        if (!v.ok) {
          if (v.error === "bad_code") {
            // 写回 state 让用户继续重试输码
            await getKV().set(`state:${extra.data.sid}`, state, 5 * 60);
          }
          const status = v.error === "expired" ? 410 : 400;
          return jsonResponse(status, v, cors);
        }

        const ticket = randomToken(32);
        const rec: TicketRecord = {
          provider: "phone",
          client: auth.clientName,
          used: false,
          created_at: Date.now(),
          user: { phone: v.phone },
        };
        await getKV().set(`ticket:${ticket}`, rec, TICKET_TTL_SECONDS);

        console.log(
          `[public-sms-verify] ok client=${auth.clientName} ticket=${ticket.slice(0, 8)}…`,
        );

        return jsonResponse(200, { ok: true, ticket, expires_in: TICKET_TTL_SECONDS }, cors);
      },
    },
  },
});
