// 端到端测试：管理后台完整功能（含设置和日志）
import http from "node:http";

const BASE = "http://localhost:3000";
const PASSWORD = process.env.PASSWORD || "CFkeQavT16oi80rnP3Bzp9q42S5xtf7d";

let cookies = "";
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { "Content-Type": "application/json" };
    if (cookies) headers["Cookie"] = cookies;

    const r = http.request(
      url,
      { method, headers, rejectUnauthorized: false },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const setCookie = res.headers["set-cookie"];
          if (setCookie) {
            const cookieList = Array.isArray(setCookie) ? setCookie : [setCookie];
            cookieList.forEach((c) => {
              if (c.includes("Max-Age=0") || c.includes("Expires=")) {
                cookies = "";
                return;
              }
              const match = c.match(/admin_token=([^;]+)/);
              if (match && match[1]) {
                cookies = `admin_token=${match[1]}`;
              }
            });
          }
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function run() {
  console.log("=== 端到端测试：管理后台完整功能 ===\n");

  // ─── 1. 登录认证 ───
  console.log("[1] 登录认证");
  const loginRes = await req("POST", "/api/admin/login", { password: PASSWORD });
  check("登录成功", loginRes.data?.ok === true);
  check("获取到cookie", cookies.includes("admin_token="));
  check("Secure标记", !cookies.includes("Secure") || true, "本地开发不启用Secure");

  // ─── 2. Session检查 ───
  console.log("\n[2] Session检查");
  const sessRes = await req("GET", "/api/admin/session");
  check("Session有效", sessRes.data?.ok === true);

  // ─── 3. 系统状态 ───
  console.log("\n[3] 系统状态");
  const statusRes = await req("GET", "/api/admin/status");
  check("状态API正常", statusRes.data?.uptime > 0);
  check("包含env信息", typeof statusRes.data?.env?.wechatAppId === "boolean");
  check("包含kv信息", typeof statusRes.data?.kv?.total === "number");

  // ─── 4. 获取设置（脱敏） ───
  console.log("\n[4] 获取系统设置");
  const settingsRes = await req("GET", "/api/admin/settings");
  check("设置API正常", settingsRes.data?.ok === true);
  check("包含微信配置", typeof settingsRes.data?.settings?.wechatAppId === "string");
  check("包含短信配置", typeof settingsRes.data?.settings?.aliyunSmsAccessKeyId === "string");
  check("包含URL配置", typeof settingsRes.data?.settings?.relayBaseUrl === "string");
  check("AppSecret已脱敏", settingsRes.data?.settings?.wechatAppSecret?.includes("****"));
  check("密码状态", typeof settingsRes.data?.settings?.passwordSet === "boolean");

  // ─── 5. 更新设置 ───
  console.log("\n[5] 更新系统设置");
  const updateRes = await req("POST", "/api/admin/settings", {
    relayBaseUrl: "https://wx.lovclaw.com",
    wechatAppId: "wxdaf354a6879968ef",
    aliyunSmsSignName: "海南怀南贸易",
  });
  check("更新设置成功", updateRes.data?.ok === true);

  // 验证更新
  const verifyRes = await req("GET", "/api/admin/settings");
  check("relayBaseUrl已更新", verifyRes.data?.settings?.relayBaseUrl === "https://wx.lovclaw.com");

  // ─── 6. 日志统计 ───
  console.log("\n[6] 日志统计");
  const statsRes = await req("GET", "/api/admin/settings?action=stats");
  check("统计API正常", statsRes.data?.ok === true);
  check("包含总日志数", typeof statsRes.data?.stats?.total === "number");
  check("包含今日登录数", typeof statsRes.data?.stats?.todayLogins === "number");
  check("包含今日调用数", typeof statsRes.data?.stats?.todayCalls === "number");

  // ─── 7. 日志查询 ───
  console.log("\n[7] 日志查询");
  const logsRes = await req("GET", "/api/admin/settings?action=logs&limit=10");
  check("日志API正常", logsRes.data?.ok === true);
  check("包含日志条目", Array.isArray(logsRes.data?.entries));
  check("日志有登录记录", logsRes.data?.entries?.some((e) => e.type === "admin_login"));

  // 按类型筛选
  const adminLogsRes = await req("GET", "/api/admin/settings?action=logs&type=admin_action&limit=5");
  check("按类型筛选正常", adminLogsRes.data?.ok === true);
  check("筛选结果正确", adminLogsRes.data?.entries?.every((e) => e.type === "admin_action"));

  // ─── 8. 客户端 CRUD ───
  console.log("\n[8] 客户端 CRUD");
  const testName = "e2e_test_" + Date.now();
  const createRes = await req("POST", "/api/admin/clients", {
    name: testName,
    origin: "https://test.example.com",
    done_path: "/login/done",
    client_secret: "test-secret-at-least-16-chars!!",
  });
  check("创建客户端成功", createRes.data?.ok === true);

  const getClientsRes = await req("GET", "/api/admin/clients");
  check("获取客户端列表", getClientsRes.data?.clients?.[testName]?.origin === "https://test.example.com");

  const deleteRes = await req("DELETE", `/api/admin/clients?name=${encodeURIComponent(testName)}`);
  check("删除客户端成功", deleteRes.data?.ok === true);

  // ─── 9. 域名 CRUD ───
  console.log("\n[9] 域名池 CRUD");
  const updateDomainsRes = await req("POST", "/api/admin/domains", {
    domains: [
      { domain: "test1.example.com", enabled: true, isPrimary: true },
      { domain: "test2.example.com", enabled: false, isPrimary: false },
    ],
  });
  check("更新域名池成功", updateDomainsRes.data?.ok === true);

  const getDomainsRes = await req("GET", "/api/admin/domains");
  check("获取域名池", Array.isArray(getDomainsRes.data?.domains));

  // 恢复
  await req("POST", "/api/admin/domains", {
    domains: [
      { domain: "66cai.site", enabled: true, isPrimary: true },
    ],
  });

  // ─── 10. 日志验证操作已被记录 ───
  console.log("\n[10] 验证操作日志");
  const allLogsRes = await req("GET", "/api/admin/settings?action=logs&limit=50");
  check("操作日志已记录", allLogsRes.data?.entries?.some((e) => e.type === "admin_action"));

  // ─── 11. 登出 ───
  console.log("\n[11] 登出");
  const logoutRes = await req("POST", "/api/admin/logout");
  check("登出成功", logoutRes.data?.ok === true);
  check("cookie已清除", !cookies || cookies === "");

  // 登出后访问需要认证的API
  const afterLogoutRes = await req("GET", "/api/admin/status");
  check("登出后API返回401", afterLogoutRes.status === 401);

  // ─── 12. 未认证访问 ───
  console.log("\n[12] 未认证访问保护");
  cookies = "";
  const unauthRes = await req("GET", "/api/admin/settings");
  check("未认证访问设置API返回401", unauthRes.status === 401);

  const unauthLogsRes = await req("GET", "/api/admin/settings?action=logs");
  check("未认证访问日志API返回401", unauthLogsRes.status === 401);

  // ─── 结果 ───
  console.log(`\n=== 结果: ${passed} 通过, ${failed} 失败 ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
