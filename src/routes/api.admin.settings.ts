// GET/POST /api/admin/settings — 系统设置读写
// GET /api/admin/settings/logs — 日志查询
import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminRequest } from "@/server/auth.server";
import {
  getMaskedSettings,
  saveSettings,
  reloadSettings,
  AdminSettings,
} from "@/server/admin-settings.server";
import {
  queryLogs,
  getLogStats,
  getRecentClientCalls,
  logAdminAction,
  LogQuery,
} from "@/server/logger.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "127.0.0.1";
}

function getUA(request: Request): string {
  return request.headers.get("user-agent") || "";
}

export const Route = createFileRoute("/api/admin/settings")({
  // @ts-expect-error server option
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return json({ ok: false, error: "unauthorized" }, 401);

        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        // 日志查询
        if (action === "logs") {
          const query: LogQuery = {};
          const type = url.searchParams.get("type");
          if (type && ["admin_login", "admin_logout", "admin_action", "client_call"].includes(type)) {
            query.type = type as LogQuery["type"];
          }
          const limit = parseInt(url.searchParams.get("limit") || "50");
          const offset = parseInt(url.searchParams.get("offset") || "0");
          query.limit = Math.min(limit, 200);
          query.offset = offset;
          const search = url.searchParams.get("search");
          if (search) query.search = search;
          const success = url.searchParams.get("success");
          if (success === "true") query.success = true;
          if (success === "false") query.success = false;

          const result = queryLogs(query);
          return json({ ok: true, ...result });
        }

        // 日志统计
        if (action === "stats") {
          const stats = getLogStats();
          const recentCalls = getRecentClientCalls(20);
          return json({ ok: true, stats, recentCalls });
        }

        // 获取设置（脱敏）
        const settings = getMaskedSettings();
        return json({ ok: true, settings });
      },

      POST: async ({ request }: { request: Request }) => {
        const admin = verifyAdminRequest(request);
        if (!admin) return json({ ok: false, error: "unauthorized" }, 401);

        try {
          const body = (await request.json()) as Partial<AdminSettings>;
          const ip = getClientIp(request);
          const ua = getUA(request);

          // 密码单独处理：如果传了 password 字段且非空，更新密码
          const updates: Partial<AdminSettings> = {};
          const allowedFields: (keyof AdminSettings)[] = [
            "wechatAppId", "wechatAppSecret",
            "wechatMpAppId", "wechatMpAppSecret",
            "aliyunSmsAccessKeyId", "aliyunSmsAccessKeySecret",
            "aliyunSmsSignName", "aliyunSmsTemplateCode",
            "relayBaseUrl", "password",
          ];

          for (const field of allowedFields) {
            if (body[field] !== undefined) {
              // 允许空字符串来清除字段
              updates[field] = body[field] as string;
            }
          }

          // 如果传了空密码，不清除
          if (updates.password === "") {
            delete updates.password;
          }

          // 验证 URL 格式
          if (updates.relayBaseUrl && !/^https?:\/\/[^\s/$.?#][^\s]*$/.test(updates.relayBaseUrl)) {
            return json({ ok: false, error: "invalid_url", message: "基础URL格式不正确" }, 400);
          }

          saveSettings(updates);

          logAdminAction(ip, ua, "修改系统设置", 
            Object.keys(updates).map(k => `${k}=${k.includes("Secret") || k === "password" ? "***" : updates[k as keyof typeof updates]}`).join(", "));

          return json({ ok: true, message: "设置已保存" });
        } catch {
          return json({ ok: false, error: "invalid_request", message: "请求格式错误" }, 400);
        }
      },
    },
  },
});
