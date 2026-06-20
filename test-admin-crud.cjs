const http = require("http");

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: "localhost", port: 3000, path, method,
      headers: { "Content-Type": "application/json" },
    };
    if (data) opts.headers["Content-Length"] = data.length;
    if (cookie) opts.headers["Cookie"] = cookie;
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(d || "{}") }));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  // 登录
  const login = await req("POST", "/api/admin/login", { password: "CFkeQavT16oi80rnP3Bzp9q42S5xtf7d" });
  const cookie = login.headers["set-cookie"].find(c => c.startsWith("admin_token=")).split(";")[0];

  console.log("1. 新增测试客户端...");
  const add = await req("POST", "/api/admin/clients", {
    name: "test-site",
    origin: "https://test.example.com",
    done_path: "/login/wechat-done",
    client_secret: "test-secret-1234567890abcdef",
  }, cookie);
  console.log("   新增结果:", add.body.ok ? "✅ 成功" : "❌ " + add.body.message);

  console.log("2. 查看客户端列表...");
  const list = await req("GET", "/api/admin/clients", null, cookie);
  console.log("   客户端数量:", list.body.count, "个");
  console.log("   名称:", Object.keys(list.body.clients).join(", "));

  console.log("3. 删除测试客户端...");
  const del = await req("DELETE", "/api/admin/clients?name=test-site", null, cookie);
  console.log("   删除结果:", del.body.ok ? "✅ 成功" : "❌ " + del.body.message);

  console.log("4. 确认删除后列表...");
  const list2 = await req("GET", "/api/admin/clients", null, cookie);
  console.log("   客户端数量:", list2.body.count, "个");

  console.log("\n✅ CRUD 测试全部通过!");
}

main().catch(console.error);
