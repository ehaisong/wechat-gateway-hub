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
# 关键: 直接复用 build 阶段的 node_modules (bun 按 lockfile 装),
# 避免运行时再跑 `npm install` 把 ^x.y.z 解析成更新的、与 SSR bundle 不匹配的版本
# (例: @tanstack/react-start 1.167.16 vs 1.167.62 会导致 SSR dehydrate 时
# `Cannot read properties of undefined (reading 'state')` -> 全部 React 路由 500)。
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
