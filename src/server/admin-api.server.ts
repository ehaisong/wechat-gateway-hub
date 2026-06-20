// 管理后台 API 业务逻辑
// 各 API 路由共用此模块

import {
  getFullConfig,
  upsertClient,
  deleteClient as csDeleteClient,
  updateShareDomains,
  StoredClient,
  StoredShareDomain,
} from "./config-store.server";
import { invalidateCache as invalidateShareDomainsCache } from "./share-domains.server";
import { getKV } from "./kv.server";

// ─── 客户端管理 ───

export function adminGetClients() {
  const config = getFullConfig();
  return {
    clients: config.clients,
    count: Object.keys(config.clients).length,
    updatedAt: config.updatedAt,
  };
}

export function adminUpsertClient(name: string, data: { origin: string; done_path: string; client_secret: string }) {
  if (!name || typeof name !== "string" || name.length < 1 || name.length > 50) {
    return { error: "invalid_name", message: "客户端名称不合法（1-50字符）" };
  }
  if (!/^[a-z0-9_-]+$/.test(name)) {
    return { error: "invalid_name", message: "客户端名称只能包含小写字母、数字、-、_" };
  }
  if (!data.origin || !/^https?:\/\/[^/]+$/.test(data.origin)) {
    return { error: "invalid_origin", message: "origin 格式不正确，示例：https://example.com" };
  }
  if (!data.done_path || !data.done_path.startsWith("/") || data.done_path.includes("//")) {
    return { error: "invalid_done_path", message: "done_path 必须以 / 开头" };
  }
  if (!data.client_secret || data.client_secret.length < 16) {
    return { error: "invalid_secret", message: "client_secret 至少 16 个字符" };
  }

  const client: StoredClient = {
    origin: data.origin.replace(/\/$/, ""),
    done_path: data.done_path,
    client_secret: data.client_secret,
  };
  upsertClient(name, client);
  return { ok: true };
}

export function adminDeleteClient(name: string) {
  const deleted = csDeleteClient(name);
  if (!deleted) {
    return { error: "not_found", message: "客户端不存在" };
  }
  return { ok: true };
}

// ─── 域名池管理 ───

export function adminGetDomains() {
  const config = getFullConfig();
  return {
    domains: config.shareDomains,
    active: (config.shareDomains.find((d) => d.enabled && d.isPrimary) || config.shareDomains.find((d) => d.enabled))?.domain ?? null,
    count: config.shareDomains.length,
  };
}

export function adminUpdateDomains(domains: StoredShareDomain[]) {
  if (!Array.isArray(domains)) {
    return { error: "invalid_input", message: "domains 必须是数组" };
  }
  for (const d of domains) {
    if (!d.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d.domain)) {
      return { error: "invalid_domain", message: `域名 "${d.domain}" 格式不合法` };
    }
  }
  updateShareDomains(domains);
  invalidateShareDomainsCache();
  return { ok: true };
}

// ─── 系统状态 ───

export function adminGetStatus() {
  const config = getFullConfig();
  const mem = process.memoryUsage();

  return {
    uptime: process.uptime(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + " MB",
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + " MB",
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + " MB",
    },
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    config: {
      clients: Object.keys(config.clients).length,
      shareDomains: config.shareDomains.length,
      activeDomain: config.shareDomains.find((d) => d.enabled && d.isPrimary)?.domain ?? null,
      lastUpdate: config.updatedAt,
    },
    env: {
      wechatAppId: !!process.env.WECHAT_APPID,
      wechatMpAppId: !!process.env.WECHAT_MP_APPID,
      aliyunSms: !!process.env.ALIYUN_SMS_ACCESS_KEY_ID,
    },
  };
}

// ─── KV 状态 ───

export async function adminGetKVStatus() {
  const kv = getKV();
  // MemoryKV 内部 store 是 private，通过添加一个 status 接口
  try {
    // @ts-expect-error accessing internal store for admin monitoring
    const store = kv.store;
    if (store instanceof Map) {
      const entries: { key: string; ttl?: number }[] = [];
      const now = Date.now();
      let activeCount = 0;
      let expiredCount = 0;
      for (const [k, v] of store.entries()) {
        if (v.exp <= now) {
          expiredCount++;
          continue;
        }
        activeCount++;
        entries.push({
          key: k.replace(/^ticket:|^state:|^phone-otp:/, "").substring(0, 20),
          ttl: Math.round((v.exp - now) / 1000),
        });
      }
      return {
        total: store.size,
        active: activeCount,
        expired: expiredCount,
        recentEntries: entries.slice(0, 20),
      };
    }
  } catch { /* ignore */ }
  return { total: -1, active: -1, expired: -1, recentEntries: [] };
}
