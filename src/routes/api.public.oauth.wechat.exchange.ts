// Legacy alias: /api/public/oauth/wechat/exchange
import { createFileRoute } from "@tanstack/react-router";
import { handleExchange, optionsResponse } from "@/server/exchange.server";

export const Route = createFileRoute("/api/public/oauth/wechat/exchange")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handleExchange(request),
      OPTIONS: async () => optionsResponse(),
    },
  },
});
