# --- build stage (用 bun 跑构建,快) ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

# --- runtime stage (用 Node 跑 SSR,完全脱离 Cloudflare Workers 运行时) ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# SSR bundle 把生产依赖标为 external,需要在运行镜像里安装
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
