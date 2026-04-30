// GET /oauth/wechat/start?client=a&return_path=/dashboard
// Generates a state, stores context server-side, redirects browser to WeChat qrconnect.

import { createFileRoute } from "@tanstack/react-router";
import { getClient, sanitizeReturnPath } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";
import { buildQrConnectUrl } from "@/server/wechat.server";

const STATE_TTL_SECONDS = 5 * 60;

interface StateRecord {
  client: string;
  return_path: string;
  created_at: number;
}

function errorRedirect(code: string, msg: string): Response {
  const u = new URL(`/error?code=${encodeURIComponent(code)}&msg=${encodeURIComponent(msg)}`, "http://placeholder");
  return new Response(null, {
    status: 302,
    headers: { Location: u.pathname + u.search },
  });
}

export const Route = createFileRoute("/oauth/wechat/start")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const clientName = url.searchParams.get("client") ?? "";
        const returnPath = sanitizeReturnPath(url.searchParams.get("return_path"));

        const client = getClient(clientName);
        if (!client) {
          return errorRedirect("unknown_client", `Unknown or unconfigured client: ${clientName}`);
        }

        const baseUrl = (process.env.RELAY_BASE_URL ?? "").replace(/\/$/, "");
        if (!baseUrl) {
          return errorRedirect("misconfigured", "RELAY_BASE_URL is not configured on the relay");
        }

        const state = randomToken(32);
        const record: StateRecord = {
          client: clientName,
          return_path: returnPath,
          created_at: Date.now(),
        };
        await getKV().set(`state:${state}`, record, STATE_TTL_SECONDS);

        const callbackUrl = `${baseUrl}/wechat/callback`;
        let target: string;
        try {
          target = buildQrConnectUrl(state, callbackUrl);
        } catch (e) {
          console.error("[start] failed to build qrconnect URL:", e);
          return errorRedirect("misconfigured", "WeChat app credentials missing");
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: target,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
