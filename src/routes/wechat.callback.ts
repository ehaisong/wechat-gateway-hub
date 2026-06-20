// GET /wechat/callback?code=...&state=...
// WeChat redirects here after the user scans + authorizes. We trade `code` for
// openid/userinfo, mint a one-time `ticket`, and 302 back to the originating
// business site. The browser receives ONLY the ticket — never user PII.

import { createFileRoute } from "@tanstack/react-router";
import { getClient } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";
import { exchangeCodeForToken, fetchUserInfo } from "@/server/wechat.server";
import { logClientCall } from "@/server/logger.server";
import type { StateRecord } from "./oauth.wechat.start";
import type { TicketRecord } from "@/server/ticket.server";

const TICKET_TTL_SECONDS = 2 * 60;

// 兼容旧引用 (api.public.oauth.wechat.exchange.ts 仍 import 此名称)
export type { TicketRecord } from "@/server/ticket.server";

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
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const ua = request.headers.get("user-agent");

        console.log(
          `[callback] incoming code=${code ? code.slice(0, 6) + "…" : "(none)"} ` +
            `state=${state ? state.slice(0, 8) + "…" : "(none)"} ua="${ua ?? "-"}"`,
        );

        if (!state) {
          console.warn("[callback] missing_state");
          return errorRedirect("missing_state", "缺少 state 参数");
        }
        const stateRec = await getKV().take<StateRecord>(`state:${state}`);
        if (!stateRec) {
          console.warn(`[callback] invalid_state state=${state.slice(0, 8)}…`);
          return errorRedirect("invalid_state", "state 不存在或已过期");
        }
        console.log(
          `[callback] state ok client=${stateRec.client} flow=${stateRec.flow} ` +
            `return_path=${stateRec.return_path} age=${Date.now() - stateRec.created_at}ms`,
        );

        if (!code) {
          console.warn("[callback] user_cancelled (no code)");
          return errorRedirect("user_cancelled", "用户取消了微信授权");
        }

        const client = getClient(stateRec.client);
        if (!client) {
          console.warn(`[callback] unknown_client name="${stateRec.client}"`);
          return errorRedirect("unknown_client", "来源站点已下线");
        }

        let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
        try {
          token = await exchangeCodeForToken(code, stateRec.flow);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[callback] code->token failed flow=${stateRec.flow} reason="${msg}"`, e);
          return errorRedirect("wechat_token_failed", `向微信换取 token 失败: ${msg}`);
        }
        console.log(
          `[callback] token ok openid=${token.openid?.slice(0, 6)}… ` +
            `unionid=${token.unionid ? "yes" : "no"} scope=${token.scope}`,
        );

        let info: Awaited<ReturnType<typeof fetchUserInfo>> | null = null;
        try {
          info = await fetchUserInfo(token.access_token, token.openid);
          console.log(`[callback] userinfo ok nickname="${info.nickname ?? ""}"`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[callback] userinfo failed reason="${msg}" — 继续 openid-only`, e);
        }

        const ticket = randomToken(32);
        const record: TicketRecord = {
          provider: "wechat",
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
        back.searchParams.set("provider", "wechat");
        if (stateRec.return_path && stateRec.return_path !== "/") {
          back.searchParams.set("return_path", stateRec.return_path);
        }

        console.log(
          `[callback] -> back to client=${stateRec.client} ` +
            `target=${back.origin}${back.pathname} ticket=${ticket.slice(0, 8)}… ` +
            `dt=${Date.now() - t0}ms`,
        );

        // 记录业务调用日志
        logClientCall(stateRec.client, "微信回调完成", 
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
          `openid=${token.openid?.slice(0, 6)}… dt=${Date.now() - t0}ms`);

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
