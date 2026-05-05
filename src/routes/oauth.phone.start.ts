// GET /oauth/phone/start?client=a&return_path=/dashboard
// 创建 state 并 302 到 /login/phone?sid=<state>

import { createFileRoute } from "@tanstack/react-router";
import { getClient, sanitizeReturnPath } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";

const STATE_TTL_SECONDS = 10 * 60;

export interface PhoneStateRecord {
  client: string;
  return_path: string;
  provider: "phone";
  created_at: number;
}

function errorRedirect(code: string, msg: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/error?code=${encodeURIComponent(code)}&msg=${encodeURIComponent(msg)}`,
      "Cache-Control": "no-store",
    },
  });
}

export const Route = createFileRoute("/oauth/phone/start")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const clientName = url.searchParams.get("client") ?? "";
        const returnPath = sanitizeReturnPath(url.searchParams.get("return_path"));

        console.log(
          `[phone-start] incoming client=${clientName} return_path=${returnPath} ` +
            `ua="${request.headers.get("user-agent") ?? "-"}"`,
        );

        const client = getClient(clientName);
        if (!client) {
          console.warn(`[phone-start] unknown_client name="${clientName}"`);
          return errorRedirect("unknown_client", `Unknown or unconfigured client: ${clientName}`);
        }

        const sid = randomToken(32);
        const record: PhoneStateRecord = {
          client: clientName,
          return_path: returnPath,
          provider: "phone",
          created_at: Date.now(),
        };
        await getKV().set(`state:${sid}`, record, STATE_TTL_SECONDS);

        console.log(`[phone-start] -> /login/phone sid=${sid.slice(0, 8)}…`);
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/login/phone?sid=${encodeURIComponent(sid)}`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
