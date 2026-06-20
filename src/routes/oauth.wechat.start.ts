// GET /oauth/wechat/start?client=a&return_path=/dashboard
//
// 根据 User-Agent 自动选择登录方式:
//   - 微信内置浏览器 -> 公众号网页授权 (snsapi_userinfo)
//   - 其他浏览器     -> 网站应用扫码    (snsapi_login)
//
// 业务方可通过 ?flow=web|mp 强制指定(可选)。

import { createFileRoute } from "@tanstack/react-router";
import { getClient, sanitizeReturnPath } from "@/server/clients.server";
import { getKV } from "@/server/kv.server";
import { randomToken } from "@/server/crypto.server";
import {
  buildQrConnectUrl,
  buildMpAuthorizeUrl,
  isWeChatBrowser,
  type WechatFlow,
} from "@/server/wechat.server";
import { logClientCall } from "@/server/logger.server";

const STATE_TTL_SECONDS = 5 * 60;

export interface StateRecord {
  client: string;
  return_path: string;
  flow: WechatFlow;
  created_at: number;
}

function errorRedirect(code: string, msg: string): Response {
  const u = new URL(
    `/error?code=${encodeURIComponent(code)}&msg=${encodeURIComponent(msg)}`,
    "http://placeholder",
  );
  return new Response(null, {
    status: 302,
    headers: { Location: u.pathname + u.search },
  });
}

export const Route = createFileRoute("/oauth/wechat/start")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const clientName = url.searchParams.get("client") ?? "";
        const returnPath = sanitizeReturnPath(url.searchParams.get("return_path"));
        const ua = request.headers.get("user-agent");
        const referer = request.headers.get("referer");

        const forced = url.searchParams.get("flow");
        let flow: WechatFlow;
        if (forced === "mp" || forced === "web") {
          flow = forced;
        } else {
          flow = isWeChatBrowser(ua) ? "mp" : "web";
        }

        console.log(
          `[start] incoming client=${clientName} flow=${flow} forced=${forced ?? "-"} ` +
            `return_path=${returnPath} isWeChatUA=${isWeChatBrowser(ua)} ` +
            `referer=${referer ?? "-"} ua="${ua ?? "-"}"`,
        );

        // 配置自检日志（不打印 secret 值）
        console.log(
          `[start] env check: RELAY_BASE_URL=${process.env.RELAY_BASE_URL ?? "(unset)"} ` +
            `WECHAT_APPID=${process.env.WECHAT_APPID ? "set" : "MISSING"} ` +
            `WECHAT_APPSECRET=${process.env.WECHAT_APPSECRET ? "set" : "MISSING"} ` +
            `WECHAT_MP_APPID=${process.env.WECHAT_MP_APPID ? "set" : "MISSING"} ` +
            `WECHAT_MP_APPSECRET=${process.env.WECHAT_MP_APPSECRET ? "set" : "MISSING"} ` +
            `CLIENTS_JSON=${process.env.CLIENTS_JSON ? "set" : "MISSING"}`,
        );

        const client = getClient(clientName);
        if (!client) {
          console.warn(`[start] unknown_client name="${clientName}"`);
          return errorRedirect("unknown_client", `Unknown or unconfigured client: ${clientName}`);
        }

        const baseUrl = (process.env.RELAY_BASE_URL ?? "").replace(/\/$/, "");
        if (!baseUrl) {
          console.error("[start] misconfigured: RELAY_BASE_URL is empty");
          return errorRedirect("misconfigured", "RELAY_BASE_URL is not configured on the relay");
        }

        const state = randomToken(32);
        const record: StateRecord = {
          client: clientName,
          return_path: returnPath,
          flow,
          created_at: Date.now(),
        };
        await getKV().set(`state:${state}`, record, STATE_TTL_SECONDS);

        const callbackUrl = `${baseUrl}/wechat/callback`;
        let target: string;
        try {
          target =
            flow === "mp"
              ? buildMpAuthorizeUrl(state, callbackUrl)
              : buildQrConnectUrl(state, callbackUrl);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(
            `[start] failed to build authorize URL flow=${flow} reason="${msg}"`,
            e,
          );
          return errorRedirect(
            "misconfigured",
            flow === "mp"
              ? `公众号(WECHAT_MP_*)凭据未配置: ${msg}`
              : `网站应用(WECHAT_*)凭据未配置: ${msg}`,
          );
        }

        console.log(
          `[start] -> redirect flow=${flow} state=${state.slice(0, 8)}… ` +
            `callback=${callbackUrl} target_host=${new URL(target).host} ` +
            `dt=${Date.now() - t0}ms`,
        );

        // 记录业务调用日志
        logClientCall(clientName, "微信登录发起", 
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1",
          `flow=${flow} return_path=${returnPath}`);

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
