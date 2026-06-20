// 分享域名池（兼容层）：委托给 config-store.server.ts
// 保持原有导出接口不变，内部改为从持久化文件读取

import {
  getShareDomains as csGetShareDomains,
  getActiveDomain as csGetActiveDomain,
} from "./config-store.server";

export interface ShareDomain {
  domain: string;
  enabled: boolean;
  isPrimary: boolean;
}

interface ShareDomainsConfig {
  domains: ShareDomain[];
  active: string | null;
}

let _cache: ShareDomainsConfig | null = null;

function buildConfig(): ShareDomainsConfig {
  const domains = csGetShareDomains();
  const primary = domains.find((d) => d.enabled && d.isPrimary);
  const active = (primary || domains.find((d) => d.enabled))?.domain ?? null;
  return { domains, active };
}

export function getShareDomainsConfig(): ShareDomainsConfig {
  if (_cache) return _cache;
  _cache = buildConfig();
  return _cache;
}

export function getActiveShareDomain(): string | null {
  return getShareDomainsConfig().active;
}

export function invalidateCache() {
  _cache = null;
}

export function sanitizeSharePath(input: string | null | undefined): string {
  if (!input) return "/";
  if (typeof input !== "string") return "/";
  if (input.length > 200) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  if (input.includes("://")) return "/";
  if (/[\r\n\t\\]/.test(input)) return "/";
  return input;
}
