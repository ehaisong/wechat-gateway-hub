// 日志记录模块：管理员操作日志 + 业务站点调用日志
// 存储到 data/activity.json（环形缓冲区，保留最近5000条）

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const LOG_FILE = join(DATA_DIR, "activity.json");
const MAX_ENTRIES = 5000;

export interface LogEntry {
  id: string;
  timestamp: string;
  type: "admin_login" | "admin_logout" | "admin_action" | "client_call";
  ip?: string;
  userAgent?: string;
  action: string;
  detail?: string;
  success: boolean;
}

let _logs: LogEntry[] | null = null;

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadLogs(): LogEntry[] {
  if (_logs) return _logs;
  ensureDir();
  if (existsSync(LOG_FILE)) {
    try {
      const raw = readFileSync(LOG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _logs = parsed;
        return _logs;
      }
    } catch { /* ignore */ }
  }
  _logs = [];
  return _logs;
}

function saveLogs(): void {
  ensureDir();
  writeFileSync(LOG_FILE, JSON.stringify(_logs, null, 2), "utf-8");
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function addEntry(entry: Omit<LogEntry, "id" | "timestamp">): LogEntry {
  const logs = loadLogs();
  const full: LogEntry = {
    id: genId(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logs.push(full);
  // 环形缓冲区：超出上限时删除旧记录
  while (logs.length > MAX_ENTRIES) {
    logs.shift();
  }
  saveLogs();
  return full;
}

// ─── 管理员操作日志 ───

export function logAdminLogin(ip: string, ua: string, success: boolean, detail?: string): LogEntry {
  return addEntry({
    type: "admin_login",
    ip,
    userAgent: ua?.substring(0, 200),
    action: "管理员登录",
    detail: detail || (success ? "登录成功" : "登录失败"),
    success,
  });
}

export function logAdminLogout(ip: string, ua: string): LogEntry {
  return addEntry({
    type: "admin_logout",
    ip,
    userAgent: ua?.substring(0, 200),
    action: "管理员登出",
    success: true,
  });
}

export function logAdminAction(ip: string, ua: string, action: string, detail?: string): LogEntry {
  return addEntry({
    type: "admin_action",
    ip,
    userAgent: ua?.substring(0, 200),
    action,
    detail,
    success: true,
  });
}

// ─── 业务站点调用日志 ───

export function logClientCall(clientName: string, action: string, ip: string, detail?: string, success = true): LogEntry {
  return addEntry({
    type: "client_call",
    ip,
    action: `[${clientName}] ${action}`,
    detail,
    success,
  });
}

// ─── 查询日志 ───

export interface LogQuery {
  type?: LogEntry["type"];
  limit?: number;
  offset?: number;
  search?: string;
  success?: boolean;
}

export function queryLogs(query: LogQuery = {}): { total: number; entries: LogEntry[] } {
  const logs = loadLogs();
  let filtered = logs;

  if (query.type) {
    filtered = filtered.filter((e) => e.type === query.type);
  }
  if (query.success !== undefined) {
    filtered = filtered.filter((e) => e.success === query.success);
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.action.toLowerCase().includes(s) ||
        (e.detail && e.detail.toLowerCase().includes(s)) ||
        (e.ip && e.ip.toLowerCase().includes(s))
    );
  }

  // 最新的在前
  filtered = [...filtered].reverse();

  const total = filtered.length;
  const offset = query.offset || 0;
  const limit = query.limit || 100;
  const entries = filtered.slice(offset, offset + limit);

  return { total, entries };
}

// ─── 统计 ───

export interface LogStats {
  total: number;
  byType: Record<string, number>;
  todayLogins: number;
  todayCalls: number;
  lastActivity: string | null;
}

export function getLogStats(): LogStats {
  const logs = loadLogs();
  const byType: Record<string, number> = {};
  let todayLogins = 0;
  let todayCalls = 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime();

  for (const entry of logs) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    const entryTs = new Date(entry.timestamp).getTime();
    if (entryTs >= todayTs) {
      if (entry.type === "admin_login") todayLogins++;
      if (entry.type === "client_call") todayCalls++;
    }
  }

  return {
    total: logs.length,
    byType,
    todayLogins,
    todayCalls,
    lastActivity: logs.length > 0 ? logs[logs.length - 1].timestamp : null,
  };
}

/** 获取最近的客户端调用日志 */
export function getRecentClientCalls(limit = 50): LogEntry[] {
  const logs = loadLogs();
  return logs
    .filter((e) => e.type === "client_call")
    .slice(-limit)
    .reverse();
}
