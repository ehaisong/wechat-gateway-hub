// 管理后台认证：JWT 签发/验证 + 密码校验
// 密码优先级：环境变量 PASSWORD > data/admin.json
// JWT 密钥来自 ADMIN_JWT_SECRET

import { createHmac, timingSafeEqual } from "node:crypto";
import { loadSettings } from "./admin-settings.server";

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || "dev-secret-change-in-production-min-32-chars!!";
const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 小时
// 环境变量中的密码（作为回退）
const ENV_PASSWORD = process.env.PASSWORD || "";

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}
function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

function hmacSign(data: string): string {
  const hmac = createHmac("sha256", JWT_SECRET);
  hmac.update(data);
  return hmac.digest("base64url");
}

export interface AdminJwtPayload {
  sub: "admin";
  iat: number;
  exp: number;
}

/** 获取当前有效密码（优先环境变量，否则从 admin.json 读取） */
function getPassword(): string {
  if (ENV_PASSWORD) return ENV_PASSWORD;
  try {
    const s = loadSettings();
    return s.password || "";
  } catch {
    return "";
  }
}

/** 验证密码（常量时间比较，防时序攻击） */
export function verifyAdminPassword(input: string): boolean {
  const pwd = getPassword();
  if (!pwd || !input) return false;
  const a = Buffer.from(pwd);
  const b = Buffer.from(input);
  if (a.length !== b.length) {
    // 仍然做常量时间比较
    const dummy = Buffer.alloc(a.length, 0);
    return timingSafeEqual(a, dummy) && false; // always false
  }
  return timingSafeEqual(a, b);
}

/** 签发 JWT token */
export function signAdminToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = {
    sub: "admin",
    iat: now,
    exp: now + TOKEN_TTL / 1000,
  };
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = hmacSign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

/** 验证 JWT token，返回 payload 或 null */
export function verifyAdminToken(token: string): AdminJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sigB64] = parts;
    const expectedSig = hmacSign(`${headerB64}.${bodyB64}`);
    // 常量时间比较签名
    const sigA = Buffer.from(sigB64, "base64url");
    const sigB = Buffer.from(expectedSig, "base64url");
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
      return null;
    }
    const payload: AdminJwtPayload = JSON.parse(
      base64UrlDecode(bodyB64).toString("utf-8"),
    );
    if (payload.sub !== "admin") return null;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 从请求的 cookie 中提取并验证 admin token */
export function getAdminFromCookies(cookieHeader: string | null): AdminJwtPayload | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.split("=");
    if (name === "admin_token") {
      const value = rest.join("=");
      return verifyAdminToken(value);
    }
  }
  return null;
}

/** 从 Request 中验证管理员身份 */
export function verifyAdminRequest(request: Request): AdminJwtPayload | null {
  return getAdminFromCookies(request.headers.get("cookie"));
}

/** 是否生产环境（HTTPS），默认不开启 Secure。
 *  使用 SECURE_COOKIE 环境变量控制（避免 vite SSR 构建内联 process.env.NODE_ENV）。
 *  线上部署时设置 SECURE_COOKIE=true */
function isSecure(): boolean {
  return process.env.SECURE_COOKIE === "true";
}

/** 生成 Set-Cookie 头。Path=/ 确保 /admin/* 页面和 /api/admin/* API 都能发送此 cookie */
export function adminSetCookieHeader(token: string): string {
  const secure = isSecure() ? "; Secure" : "";
  return `admin_token=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${TOKEN_TTL / 1000}`;
}

/** 清除 Cookie 头 */
export function adminClearCookieHeader(): string {
  const secure = isSecure() ? "; Secure" : "";
  return `admin_token=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

/** 检查密码是否已配置 */
export function isAdminConfigured(): boolean {
  return getPassword().length > 0;
}
