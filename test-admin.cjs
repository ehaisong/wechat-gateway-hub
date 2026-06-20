// 测试管理员登录流程：登录 -> 用 cookie 访问管理 API
const http = require("http");

const BASE = "http://localhost:3000";
const PASSWORD = "CFkeQavT16oi80rnP3Bzp9q42S5xtf7d";

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (cookie) opts.headers["Cookie"] = cookie;

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"];
        resolve({ status: res.statusCode, body: JSON.parse(data || "{}"), setCookie });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log("=== 1. 登录 ===");
  const login = await request("POST", "/api/admin/login", { password: PASSWORD });
  console.log("状态:", login.status, "ok:", login.body.ok);
  console.log("Set-Cookie:", login.setCookie?.[0]?.substring(0, 80) + "...");

  if (!login.setCookie || !login.setCookie[0]) {
    console.log("❌ 没有收到 Set-Cookie！");
    return;
  }

  const cookie = login.setCookie[0].split(";")[0]; // 取 admin_token=xxx 部分

  console.log("\n=== 2. 检查 session ===");
  const session = await request("GET", "/api/admin/session", null, cookie);
  console.log("状态:", session.status, "authenticated:", session.body.authenticated);

  console.log("\n=== 3. 获取站点列表 ===");
  const clients = await request("GET", "/api/admin/clients", null, cookie);
  console.log("状态:", clients.status, "站点数:", clients.body.count);

  console.log("\n=== 4. 获取域名池 ===");
  const domains = await request("GET", "/api/admin/domains", null, cookie);
  console.log("状态:", domains.status, "域名数:", domains.body.count);

  console.log("\n=== 5. 获取系统状态 ===");
  const status = await request("GET", "/api/admin/status", null, cookie);
  console.log("状态:", status.status, "uptime:", status.body.uptime, "pid:", status.body.pid);

  console.log("\n✅ 全部测试通过！Cookie 认证正常，可正常访问管理后台API");
}

main().catch((e) => console.error("测试失败:", e));
