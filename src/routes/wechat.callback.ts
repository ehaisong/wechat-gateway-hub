// GET /wechat/callback?code=...&state=...
// WeChat redirects here after the user scans + authorizes. We trade `code` for
// openid/userinfo, mint a one-time `ticket`, and 302 back to the originating
// business site. The browser receives ONLY the ticket — never user PII.

import { createFileRoute } from "@tanstack/react-router";
import { getClient } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";
import { exchangeCodeForToken, fetchUserInfo } from "@/server/wechat.server";

const TICKET_TTL_SECONDS = 2 * 60;

interface StateRecord {
  client: string;
  return_path: string;
  created_at: number;
}

export interface TicketRecord {
  client: string;
  used: boolean;
  created_at: number;
  user: {
    openid: string;
    unionid?: string;
    nickname?: string;
    avatar?: string;
    sex?: number;
    province?: string;
    city?: string;
    country?: string;
  };
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

export const Route = createFileRoute("/wechat/callback")({
  // @ts-expect-error TanStack Start server route block; types not yet exposed via react-router augmentation
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!state) return errorRedirect("missing_state", "缺少 state 参数");
        // Atomic take: prevents replay of the same state.
        const stateRec = await getKV().take<StateRecord>(`state:${state}`);
        if (!stateRec) return errorRedirect("invalid_state", "state 不存在或已过期");

        if (!code) {
          // User likely cancelled the authorization on WeChat.
          return errorRedirect("user_cancelled", "用户取消了微信授权");
        }

        const client = getClient(stateRec.client);
        if (!client) return errorRedirect("unknown_client", "来源站点已下线");

        let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
        try {
          token = await exchangeCodeForToken(code);
        } catch (e) {
          console.error("[callback] code->token failed:", e);
          return errorRedirect("wechat_token_failed", "向微信换取 token 失败");
        }

        let info: Awaited<ReturnType<typeof fetchUserInfo>> | null = null;
        try {
          info = await fetchUserInfo(token.access_token, token.openid);
        } catch (e) {
          // Userinfo failure is non-fatal — we can still hand back openid/unionid.
          console.warn("[callback] userinfo failed, continuing with openid only:", e);
        }

        const ticket = randomToken(32);
        const record: TicketRecord = {
          client: stateRec.client,
          used: false,
          created_at: Date.now(),
          user: {
            openid: token.openid,
            unionid: token.unionid ?? info?.unionid,
            nickname: info?.nickname,
            avatar: info?.headimgurl,
            sex: info?.sex,
            province: info?.province,
            city: info?.city,
            country: info?.country,
          },
        };
        await getKV().set(`ticket:${ticket}`, record, TICKET_TTL_SECONDS);

        const back = new URL(client.done_path, client.origin);
        back.searchParams.set("ticket", ticket);
        if (stateRec.return_path && stateRec.return_path !== "/") {
          back.searchParams.set("return_path", stateRec.return_path);
        }

        return new Response(null, {
          status: 302,
          headers: {
            Location: back.toString(),
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
