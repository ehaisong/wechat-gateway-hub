// POST /api/public/sms/send
// Body: { client, client_secret, sid, phone }
// Resp: { ok:true, cooldown } | { ok:false, error, retry_after? }

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getKV } from "@/server/kv.server";
import { requestOtp } from "@/server/phone-otp.server";
import {
  authenticate,
  corsHeaders,
  getParsedBody,
  jsonResponse,
  preflightResponse,
} from "@/server/public-sms.server";
import type { PhoneStateRecord } from "@/routes/oauth.phone.start";

const BodyExtra = z.object({
  sid: z.string().min(20).max(200),
  phone: z.string().min(6).max(20),
});

export const Route = createFileRoute("/api/public/sms/send")({
  // @ts-expect-error server option provided by TanStack Start plugin
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

        const state = await getKV().get<PhoneStateRecord>(`state:${extra.data.sid}`);
        if (!state || state.provider !== "phone") {
          return jsonResponse(410, { ok: false, error: "session_expired" }, cors);
        }
        if (state.client !== auth.clientName) {
          return jsonResponse(403, { ok: false, error: "sid_client_mismatch" }, cors);
        }

        const r = await requestOtp(extra.data.sid, extra.data.phone);
        if (!r.ok) {
          const status = r.error === "rate_limited" ? 429 : r.error === "invalid_phone" ? 400 : 502;
          return jsonResponse(status, r, cors);
        }
        return jsonResponse(200, r, cors);
      },
    },
  },
});
