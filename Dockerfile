# --- build stage ---
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

# --- runtime stage ---
# TanStack Start emits a Node-compatible server bundle under .output/
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
# Adjust the entry path if your build output differs (e.g. .output/server/index.mjs)
CMD ["node", ".output/server/index.mjs"]
