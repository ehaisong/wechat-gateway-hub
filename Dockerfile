# --- build stage ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

# --- runtime stage ---
# 用 Node 跑 SSR(完全脱离 Cloudflare Workers 运行时)
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server.mjs"]
