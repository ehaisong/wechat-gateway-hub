// 分享域名池配置（中转站 /r 跳转用）
//
// 通过环境变量 SHARE_DOMAINS_JSON 配置，例：
//   SHARE_DOMAINS_JSON='{"domains":[{"domain":"66cai.site","enabled":true,"isPrimary":true},{"domain":"cai123.lovable.app","enabled":true,"isPrimary":false}]}'
//
// 也兼容直接的数组形式：
//   SHARE_DOMAINS_JSON='[{"domain":"66cai.site","enabled":true,"isPrimary":true}]'

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

export function getShareDomainsConfig(): ShareDomainsConfig {
  if (_cache) return _cache;
  const raw = process.env.SHARE_DOMAINS_JSON;
  let domains: ShareDomain[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.domains) ? parsed.domains : [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const domain = String(item.domain || "").trim().toLowerCase();
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) continue;
        domains.push({
          domain,
          enabled: item.enabled !== false,
          isPrimary: item.isPrimary === true,
        });
      }
    } catch (e) {
      console.error("[share-domains] SHARE_DOMAINS_JSON is not valid JSON:", e);
    }
  }
  // 回退默认：使用 RELAY_BASE_URL 的 host（仅作兜底，避免空配置时彻底无法跳）
  if (domains.length === 0) {
    const fallback = (process.env.SHARE_DEFAULT_DOMAIN || "").trim().toLowerCase();
    if (fallback) {
      domains.push({ domain: fallback, enabled: true, isPrimary: true });
    }
  }
  // 选 active：第一个 enabled && isPrimary，否则第一个 enabled
  const primary = domains.find((d) => d.enabled && d.isPrimary);
  const active = (primary || domains.find((d) => d.enabled))?.domain ?? null;
  _cache = { domains, active };
  return _cache;
}

export function getActiveShareDomain(): string | null {
  return getShareDomainsConfig().active;
}

// 校验 to 路径：必须以 / 开头，且不含 协议/换行/反斜杠 等开放跳转风险
export function sanitizeSharePath(input: string | null | undefined): string {
  if (!input) return "/";
  if (typeof input !== "string") return "/";
  if (input.length > 200) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/"; // protocol-relative
  if (input.includes("://")) return "/";
  if (/[\r\n\t\\]/.test(input)) return "/";
  return input;
}
