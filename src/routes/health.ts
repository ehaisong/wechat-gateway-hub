import { createFileRoute } from "@tanstack/react-router";
import { getShareDomainsConfig } from "../server/share-domains.server";

export const Route = createFileRoute("/health")({
  // @ts-expect-error server option provided by TanStack Start plugin
  server: {
    handlers: {
      GET: async () => {
        const { active, domains } = getShareDomainsConfig();
        return new Response(
          JSON.stringify({
            ok: true,
            active,
            domains,
            ts: Date.now(),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
