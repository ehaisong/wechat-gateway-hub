// POST /api/sms/send  body: { sid, phone }
// 同源校验 + 调用 phone-otp.requestOtp

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getKV } from "@/server/kv.server";
import { requestOtp } from "@/server/phone-otp.server";
import type { PhoneStateRecord } from "./oauth.phone.start";

const Body = z.object({
  sid: z.string().min(20).max(200),
  phone: z.string().min(6).max(20),
});

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

export const Route = createFileRoute("/api/sms/send")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (!checkSameOrigin(request)) {
          console.warn(
            `[sms-send] cross_origin_blocked origin=${request.headers.get("origin") ?? "-"} ` +
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

        const state = await getKV().get<PhoneStateRecord>(`state:${parsed.sid}`);
        if (!state || state.provider !== "phone") {
          console.warn(`[sms-send] invalid_sid sid=${parsed.sid.slice(0, 8)}…`);
          return json(410, { ok: false, error: "session_expired" });
        }

        const r = await requestOtp(parsed.sid, parsed.phone);
        if (!r.ok) {
          const status = r.error === "rate_limited" ? 429 : r.error === "invalid_phone" ? 400 : 502;
          return json(status, r);
        }
        return json(200, r);
      },
    },
  },
});
