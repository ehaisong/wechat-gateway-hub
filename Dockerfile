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
# SSR bundle 把生产依赖标为 external,需要在运行镜像里安装
COPY package.json bun.lockb* ./
RUN apk add --no-cache --virtual .build curl unzip bash \
  && curl -fsSL https://bun.sh/install | bash \
  && /root/.bun/bin/bun install --production --frozen-lockfile || /root/.bun/bin/bun install --production \
  && apk del .build
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
