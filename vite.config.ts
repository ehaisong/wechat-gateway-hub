// 国内服务器部署专用配置:
// 关闭 @lovable.dev/vite-tanstack-config 自带的 Cloudflare 插件,产出纯 SSR 包,
// 由 server.mjs (Node 适配器) 在运行时启动 HTTP 服务。
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
});
