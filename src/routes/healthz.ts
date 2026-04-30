import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  // @ts-expect-error TanStack Start server route block; types not yet exposed via react-router augmentation
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
