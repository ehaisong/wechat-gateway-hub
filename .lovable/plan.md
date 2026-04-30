## 失败原因（确认）

Zeabur 构建日志显示两件事：

1. `vite build` 实际产物在 `dist/client/` 和 `dist/server/`（看日志里 `dist/server/index.js`、`dist/server/worker-entry-*.js`、`dist/server/wrangler.json`）。
2. Dockerfile 却去 `COPY --from=build /app/.output ./.output` —— `.output` 目录根本不存在，于是 `failed to calculate checksum of ref ... "/app/.output": not found`，整个镜像构建终止。

但**只改 Dockerfile 路径还不够**。当前项目用的是 `@lovable.dev/vite-tanstack-config`，它内置 `@cloudflare/vite-plugin`，把 TanStack Start 编译成了 **Cloudflare Worker** 格式（入口 `dist/server/worker-entry-*.js`，配套 `wrangler.json`）。这种产物：

- 入口是 `export default { fetch(request, env, ctx) }`，不是 `listen(port)`。
- 依赖 Workers 运行时全局对象，直接 `node dist/server/index.js` 起不来。
- 你的目标是部署到**国内云服务器**，必须是标准 Node HTTP 服务，跟 Workers 模式根本性不兼容。

所以根因是：**构建管线确实默认是 Cloudflare Workers**，需要切到 Node 服务端模式，而且 Dockerfile 也要跟着改。

## 修复方案

### 1. 切换构建目标为 Node 服务端

替换 `vite.config.ts`，不再用 `@lovable.dev/vite-tanstack-config` 默认导出（它强绑 cloudflare 插件），改成直接组合 TanStack Start + React + Tailwind + tsconfig-paths，**不引入 `@cloudflare/vite-plugin`**：

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      target: "node-server",      // 关键：产出标准 Node 服务
      customViteReactPlugin: true,
    }),
    viteReact(),
  ],
  server: { port: 3000, host: true },
});
```

`target: "node-server"` 是 TanStack Start 提供的 nitro preset，构建后会产出 **`.output/server/index.mjs`** —— 一个标准 Node HTTP 服务器，可以直接 `node` 启动，不依赖任何 Workers 运行时。

### 2. 删除 Cloudflare 相关文件 / 依赖

- 删除 `wrangler.jsonc`（指向 worker-entry，国内服务器用不上，留着会让人误解）。
- 从 `package.json` 移除 `@cloudflare/vite-plugin` 依赖。
- 中转站本身不依赖任何 Workers 特性（KV、crypto.subtle、fetch 都是 Node 18+ 原生的），切到 Node 没有副作用。

### 3. 修复 Dockerfile（与新构建产物对齐）

```dockerfile
# build stage
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install
COPY . .
RUN bun run build

# runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
# node-server preset 产物在 .output/
COPY --from=build /app/.output ./.output
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

如果切换后实测构建产物路径不同（少数版本会落在 `.output/server/index.js`），README 里也注明备用 CMD。

### 4. 验证清单（部署前自检）

- 本地 `bun run build` 后确认 `.output/server/index.mjs` 存在。
- `node .output/server/index.mjs` 在本机能起服务，`curl localhost:3000/healthz` 返回 200。
- 镜像内不出现 `dist/server/worker-entry-*.js` 或 `wrangler.json`。

### 5. Zeabur 端配置提醒（写进 README）

- Zeabur 项目设置里把环境变量补齐：`WECHAT_APPID`、`WECHAT_APPSECRET`、`RELAY_BASE_URL`、`CLIENTS_JSON`。
- Zeabur 自动识别仓库根 `Dockerfile`，不需要额外的 `zeabur.json`。
- 国内云服务器复用同一个镜像即可，前面挂 Nginx + HTTPS。

## 不做的事

- 不保留 Cloudflare Workers 双轨（你明确要国内部署，留着只会再次踩坑）。
- 不改业务代码（路由、KV、微信调用全部不动，它们都是运行时无关的）。
- 不引入新的 npm 包，只删 `@cloudflare/vite-plugin`。

## 交付物

- 修改 `vite.config.ts`（切到 `node-server` preset，移除 cloudflare 插件链）
- 修改 `Dockerfile`（路径对齐 `.output/server/index.mjs`）
- 删除 `wrangler.jsonc`
- 修改 `package.json`（移除 `@cloudflare/vite-plugin`）
- 更新 `README.md` 部署章节（Zeabur 重新部署步骤、环境变量清单、本地验证命令）
