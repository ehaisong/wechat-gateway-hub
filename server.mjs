// Node HTTP 适配器: 把 TanStack Start 的 SSR fetch handler 跑在原生 Node 上。
// 适用于国内服务器 / Zeabur Docker 部署,完全不依赖 Cloudflare Workers 运行时。
//
// 启动: node server.mjs
// 环境变量: PORT (默认 3000), HOST (默认 0.0.0.0)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const clientDir = resolve(__dirname, "dist/client");
const serverEntry = resolve(__dirname, "dist/server/server.js");

if (!existsSync(serverEntry)) {
  console.error(`[server] SSR 入口不存在: ${serverEntry}`);
  console.error(`[server] 请先运行: bun run build`);
  process.exit(1);
}

const mod = await import(serverEntry);
const handler = mod.default?.fetch ?? mod.fetch;
if (typeof handler !== "function") {
  console.error("[server] dist/server/server.js 没有导出 fetch handler");
  process.exit(1);
}

const MIME = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

async function tryServeStatic(req, res, urlPath) {
  if (urlPath === "/" || urlPath.includes("..")) return false;
  const filePath = join(clientDir, urlPath);
  if (!filePath.startsWith(clientDir)) return false;
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    const buf = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": urlPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    });
    res.end(buf);
    return true;
  } catch {
    return false;
  }
}

function nodeReqToWebRequest(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((vv) => headers.append(k, vv));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (req.method && !["GET", "HEAD"].includes(req.method.toUpperCase())) {
    init.body = new ReadableStream({
      start(controller) {
        req.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
        req.on("end", () => controller.close());
        req.on("error", (e) => controller.error(e));
      },
    });
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function writeWebResponse(res, webRes) {
  const headers = {};
  webRes.headers.forEach((v, k) => {
    headers[k] = v;
  });
  res.writeHead(webRes.status, headers);
  if (!webRes.body) {
    res.end();
    return;
  }
  const reader = webRes.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = (req.url || "/").split("?")[0];
    // 静态资源优先(/assets/* 等)
    if (urlPath !== "/" && (await tryServeStatic(req, res, urlPath))) return;

    const webReq = nodeReqToWebRequest(req);
    const webRes = await handler(webReq);
    await writeWebResponse(res, webRes);
  } catch (e) {
    console.error("[server] handler error:", e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] listening on http://${HOST}:${PORT}`);
});
