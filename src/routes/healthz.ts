import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          JSON.stringify({ ok: true, service: "wechat-login-relay", time: Date.now() }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
