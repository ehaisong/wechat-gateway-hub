// POST /api/public/sms/start
// Body: { client, client_secret, return_path? }
// Resp: { ok:true, sid, expires_in }
//
// 创建一个 phone state (与 /oauth/phone/start 同样的 PhoneStateRecord),
// 然后业务后端把 sid 透传给前端用于 send/verify。

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";
import {
  STATE_TTL_SECONDS,
  authenticate,
  corsHeaders,
  getParsedBody,
  jsonResponse,
  preflightResponse,
  sanitizeReturnPath,
} from "@/server/public-sms.server";
import type { PhoneStateRecord } from "@/routes/oauth.phone.start";

const BodyExtra = z.object({
  return_path: z.string().max(200).optional(),
});

export const Route = createFileRoute("/api/public/sms/start")({
  server: {
    handlers: {
      OPTIONS: async ({ request }: { request: Request }) => preflightResponse(request),
      POST: async ({ request }: { request: Request }) => {
        const auth = await authenticate(request);
        if (!auth.ok) return auth.response;
        const reqOrigin = request.headers.get("origin");
        const cors = corsHeaders(reqOrigin === auth.client.origin ? auth.client.origin : reqOrigin);

        const extra = BodyExtra.safeParse(getParsedBody(request));
        const returnPath = sanitizeReturnPath(extra.success ? extra.data.return_path : undefined);

        const sid = randomToken(32);
        const record: PhoneStateRecord = {
          client: auth.clientName,
          return_path: returnPath,
          provider: "phone",
          created_at: Date.now(),
        };
        await getKV().set(`state:${sid}`, record, STATE_TTL_SECONDS);

        console.log(`[public-sms-start] client=${auth.clientName} sid=${sid.slice(0, 8)}…`);

        return jsonResponse(200, { ok: true, sid, expires_in: STATE_TTL_SECONDS }, cors);
      },
    },
  },
});
