import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        // 只返回布尔值，绝不泄露 secret 内容
        const env = {
          WECHAT_APPID: !!process.env.WECHAT_APPID,
          WECHAT_APPSECRET: !!process.env.WECHAT_APPSECRET,
          WECHAT_MP_APPID: !!process.env.WECHAT_MP_APPID,
          WECHAT_MP_APPSECRET: !!process.env.WECHAT_MP_APPSECRET,
          RELAY_BASE_URL: process.env.RELAY_BASE_URL ?? null,
          CLIENTS_JSON: !!process.env.CLIENTS_JSON,
        };
        return new Response(
          JSON.stringify({
            ok: true,
            service: "wechat-login-relay",
            time: Date.now(),
            env,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
