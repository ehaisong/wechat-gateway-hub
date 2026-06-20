// 管理后台系统设置存储：data/admin.json
// 持久化微信参数、短信参数、基础URL、登录密码等

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data");
const SETTINGS_FILE = join(DATA_DIR, "admin.json");

export interface AdminSettings {
  // 微信网站应用
  wechatAppId: string;
  wechatAppSecret: string;
  // 微信公众号
  wechatMpAppId: string;
  wechatMpAppSecret: string;
  // 阿里云短信
  aliyunSmsAccessKeyId: string;
  aliyunSmsAccessKeySecret: string;
  aliyunSmsSignName: string;
  aliyunSmsTemplateCode: string;
  // 基础配置
  relayBaseUrl: string;
  // 管理密码
  password: string;
  // 更新时间
  updatedAt: string;
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** 从环境变量获取默认值 */
function getDefaults(): AdminSettings {
  return {
    wechatAppId: process.env.WECHAT_APPID || "",
    wechatAppSecret: process.env.WECHAT_APPSECRET || "",
    wechatMpAppId: process.env.WECHAT_MP_APPID || "",
    wechatMpAppSecret: process.env.WECHAT_MP_APPSECRET || "",
    aliyunSmsAccessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID || "",
    aliyunSmsAccessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || "",
    aliyunSmsSignName: process.env.ALIYUN_SMS_SIGN_NAME || "",
    aliyunSmsTemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || "",
    relayBaseUrl: process.env.RELAY_BASE_URL || "",
    password: "", // 密码不读取环境变量到文件，单独处理
    updatedAt: new Date().toISOString(),
  };
}

let _settingsCache: AdminSettings | null = null;

/** 加载设置（优先文件，文件不存在则用环境变量默认值初始化） */
export function loadSettings(): AdminSettings {
  if (_settingsCache) return _settingsCache;
  ensureDir();
  if (existsSync(SETTINGS_FILE)) {
    try {
      const raw = readFileSync(SETTINGS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        _settingsCache = { ...getDefaults(), ...parsed };
        return _settingsCache;
      }
    } catch (e) {
      console.error("[settings] 读取设置文件失败:", e);
    }
  }
  // 首次初始化
  _settingsCache = getDefaults();
  // 密码从环境变量读取
  _settingsCache.password = process.env.PASSWORD || "";
  saveSettings();
  return _settingsCache;
}

/** 保存设置到文件 */
export function saveSettings(settings?: Partial<AdminSettings>): void {
  if (settings) {
    _settingsCache = { ...loadSettings(), ...settings, updatedAt: new Date().toISOString() };
  }
  if (!_settingsCache) return;
  ensureDir();
  writeFileSync(SETTINGS_FILE, JSON.stringify(_settingsCache, null, 2), "utf-8");

  // 同步更新 process.env，让运行时立即生效
  if (_settingsCache.wechatAppId) process.env.WECHAT_APPID = _settingsCache.wechatAppId;
  if (_settingsCache.wechatAppSecret) process.env.WECHAT_APPSECRET = _settingsCache.wechatAppSecret;
  if (_settingsCache.wechatMpAppId) process.env.WECHAT_MP_APPID = _settingsCache.wechatMpAppId;
  if (_settingsCache.wechatMpAppSecret) process.env.WECHAT_MP_APPSECRET = _settingsCache.wechatMpAppSecret;
  if (_settingsCache.aliyunSmsAccessKeyId) process.env.ALIYUN_SMS_ACCESS_KEY_ID = _settingsCache.aliyunSmsAccessKeyId;
  if (_settingsCache.aliyunSmsAccessKeySecret) process.env.ALIYUN_SMS_ACCESS_KEY_SECRET = _settingsCache.aliyunSmsAccessKeySecret;
  if (_settingsCache.aliyunSmsSignName) process.env.ALIYUN_SMS_SIGN_NAME = _settingsCache.aliyunSmsSignName;
  if (_settingsCache.aliyunSmsTemplateCode) process.env.ALIYUN_SMS_TEMPLATE_CODE = _settingsCache.aliyunSmsTemplateCode;
  if (_settingsCache.relayBaseUrl) process.env.RELAY_BASE_URL = _settingsCache.relayBaseUrl;
  if (_settingsCache.password) process.env.PASSWORD = _settingsCache.password;
}

/** 清除缓存 */
export function reloadSettings(): AdminSettings {
  _settingsCache = null;
  return loadSettings();
}

/** 获取脱敏后的设置（隐藏密钥中间部分） */
export function getMaskedSettings(): Omit<AdminSettings, "password"> & { password: string; passwordSet: boolean } {
  const s = loadSettings();
  return {
    wechatAppId: s.wechatAppId,
    wechatAppSecret: maskSecret(s.wechatAppSecret),
    wechatMpAppId: s.wechatMpAppId,
    wechatMpAppSecret: maskSecret(s.wechatMpAppSecret),
    aliyunSmsAccessKeyId: s.aliyunSmsAccessKeyId,
    aliyunSmsAccessKeySecret: maskSecret(s.aliyunSmsAccessKeySecret),
    aliyunSmsSignName: s.aliyunSmsSignName,
    aliyunSmsTemplateCode: s.aliyunSmsTemplateCode,
    relayBaseUrl: s.relayBaseUrl,
    password: "",
    passwordSet: s.password.length > 0,
    updatedAt: s.updatedAt,
  };
}

function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "****";
  return secret.substring(0, 4) + "****" + secret.substring(secret.length - 4);
}

/** 验证密码（支持从 settings 文件读取） */
export function verifySettingsPassword(input: string): boolean {
  const s = loadSettings();
  if (!s.password || !input) return false;
  const a = Buffer.from(s.password);
  const b = Buffer.from(input);
  if (a.length !== b.length) return false;
  return a.equals(b);
}
