// Canonical: /api/public/oauth/exchange (微信 + 手机号 共用)
import { createFileRoute } from "@tanstack/react-router";
import { handleExchange, handleExchangeGet, optionsResponse } from "@/server/exchange.server";

export const Route = createFileRoute("/api/public/oauth/exchange")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => handleExchangeGet(request),
      POST: async ({ request }: { request: Request }) => handleExchange(request),
      OPTIONS: async () => optionsResponse(),
    },
  },
});
