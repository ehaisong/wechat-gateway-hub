// 配置持久化存储：将 CLIENTS_JSON 和 SHARE_DOMAINS_JSON 从环境变量迁移到文件存储
// 文件路径：data/config.json
// 优先级：环境变量 CLIENTS_JSON / SHARE_DOMAINS_JSON 仅在首次初始化时使用

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

// 项目根目录由 server.mjs 的 cwd 决定（server.mjs 在项目根目录启动）
// 也支持通过 DATA_DIR 环境变量自定义
function findProjectRoot(): string {
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR, "..");
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = join(PROJECT_ROOT, "data");
const CONFIG_FILE = join(DATA_DIR, "config.json");

export interface StoredClient {
  origin: string;
  done_path: string;
  client_secret: string;
}

export interface StoredShareDomain {
  domain: string;
  enabled: boolean;
  isPrimary: boolean;
}

export interface AppConfig {
  clients: Record<string, StoredClient>;
  shareDomains: StoredShareDomain[];
  updatedAt: string;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDefaultConfig(): AppConfig {
  const clients: Record<string, StoredClient> = {};
  const rawClients = process.env.CLIENTS_JSON;
  if (rawClients) {
    try {
      const parsed = JSON.parse(rawClients);
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "object") {
          clients[k] = {
            origin: String((v as Record<string, unknown>).origin || ""),
            done_path: String((v as Record<string, unknown>).done_path || ""),
            client_secret: String((v as Record<string, unknown>).client_secret || ""),
          };
        }
      }
    } catch { /* ignore */ }
  }

  const domains: StoredShareDomain[] = [];
  const rawDomains = process.env.SHARE_DOMAINS_JSON;
  if (rawDomains) {
    try {
      const parsed = JSON.parse(rawDomains);
      const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.domains)
          ? parsed.domains
          : [];
      for (const item of arr) {
        if (item && typeof item === "object") {
          domains.push({
            domain: String(item.domain || ""),
            enabled: item.enabled !== false,
            isPrimary: item.isPrimary === true,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return {
    clients,
    shareDomains: domains,
    updatedAt: new Date().toISOString(),
  };
}

let _configCache: AppConfig | null = null;

/** 读取配置（优先从文件，文件不存在则从环境变量初始化） */
export function loadConfig(): AppConfig {
  if (_configCache) return _configCache;
  ensureDataDir();
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.clients) {
        _configCache = {
          clients: parsed.clients || {},
          shareDomains: Array.isArray(parsed.shareDomains) ? parsed.shareDomains : [],
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
        return _configCache;
      }
    } catch (e) {
      console.error("[config-store] 读取配置文件失败，将从环境变量初始化:", e);
    }
  }
  // 文件不存在或损坏，从环境变量初始化
  _configCache = getDefaultConfig();
  saveConfig();
  return _configCache;
}

/** 保存配置到文件 */
export function saveConfig(config?: AppConfig): void {
  if (config) _configCache = config;
  if (!_configCache) return;
  ensureDataDir();
  _configCache.updatedAt = new Date().toISOString();
  writeFileSync(CONFIG_FILE, JSON.stringify(_configCache, null, 2), "utf-8");
}

/** 刷新缓存（强制从文件重新加载） */
export function reloadConfig(): AppConfig {
  _configCache = null;
  return loadConfig();
}

// ─── 客户端管理 ───

export function getClients(): Record<string, StoredClient> {
  return loadConfig().clients;
}

export function getClient(name: string): StoredClient | null {
  return loadConfig().clients[name] ?? null;
}

export function listClientNames(): string[] {
  return Object.keys(loadConfig().clients);
}

export function upsertClient(name: string, client: StoredClient): void {
  const config = loadConfig();
  config.clients[name] = client;
  saveConfig();
}

export function deleteClient(name: string): boolean {
  const config = loadConfig();
  if (!config.clients[name]) return false;
  delete config.clients[name];
  saveConfig();
  return true;
}

// ─── 分享域名管理 ───

export function getShareDomains(): StoredShareDomain[] {
  return loadConfig().shareDomains;
}

export function getActiveDomain(): string | null {
  const domains = loadConfig().shareDomains;
  const primary = domains.find((d) => d.enabled && d.isPrimary);
  return (primary || domains.find((d) => d.enabled))?.domain ?? null;
}

export function updateShareDomains(domains: StoredShareDomain[]): void {
  const config = loadConfig();
  config.shareDomains = domains;
  saveConfig();
}

// ─── 导出完整配置用于管理后台 ───

export function getFullConfig(): AppConfig {
  return loadConfig();
}
