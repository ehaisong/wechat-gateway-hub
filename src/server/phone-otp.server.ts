// 手机号 OTP 业务层: 发码 / 校验, KV 存 hash, 一次性 + 尝试次数上限 + 单号冷却。
// (按平台规范, 不做基于 KV 的广义 IP/日级限流; 单号 60s 冷却作为最小防滥用。)

import { getKV } from "./kv.server";
import { sha256Hex, timingSafeEqual } from "./crypto.server";
import { sendSms } from "./aliyun-sms.server";

const OTP_TTL_SECONDS = 5 * 60;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export interface OtpRecord {
  codeHash: string;
  attempts: number;
  created_at: number;
}

const PHONE_RE = /^1[3-9]\d{9}$/;

export function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function normalizePhone(input: string): string | null {
  const s = input.trim().replace(/[\s-]/g, "");
  // 接受 +8613800001111 / 008613800001111 / 13800001111
  const cn = s.replace(/^(\+86|0086)/, "");
  if (!PHONE_RE.test(cn)) return null;
  return cn;
}

export function toE164(cn: string): string {
  return `+86${cn}`;
}

export type RequestOtpResult =
  | { ok: true; cooldown: number }
  | { ok: false; error: "invalid_phone" | "rate_limited" | "send_failed"; retry_after?: number; message?: string };

export async function requestOtp(sid: string, phoneInput: string): Promise<RequestOtpResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, error: "invalid_phone" };

  const kv = getKV();
  const cdKey = `cd:phone:${phone}`;
  const inCd = await kv.get<{ at: number }>(cdKey);
  if (inCd) {
    const elapsed = Math.floor((Date.now() - inCd.at) / 1000);
    const retry = Math.max(1, COOLDOWN_SECONDS - elapsed);
    console.log(`[otp] cooldown phone=${maskPhone(phone)} retry_after=${retry}s`);
    return { ok: false, error: "rate_limited", retry_after: retry };
  }

  // 6 位随机
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const code = (buf[0] % 1_000_000).toString().padStart(6, "0");

  // KV 只存 hash(code + sid)
  const codeHash = await sha256Hex(`${code}.${sid}`);
  const otpKey = `otp:${sid}:${phone}`;
  await kv.set(otpKey, { codeHash, attempts: 0, created_at: Date.now() }, OTP_TTL_SECONDS);
  await kv.set(cdKey, { at: Date.now() }, COOLDOWN_SECONDS);

  const signName = process.env.ALIYUN_SMS_SIGN_NAME;
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE;
  if (!signName || !templateCode) {
    console.error("[otp] missing ALIYUN_SMS_SIGN_NAME / ALIYUN_SMS_TEMPLATE_CODE");
    return { ok: false, error: "send_failed", message: "短信服务未配置" };
  }

  try {
    const r = await sendSms({
      phone,
      signName,
      templateCode,
      templateParam: { code },
    });
    if (!r.ok) {
      console.warn(`[otp] aliyun returned not-ok phone=${maskPhone(phone)} code=${r.code} msg=${r.message}`);
      // 删除冷却, 让用户能立刻重试 (因为没有真发出去)
      await kv.del(cdKey);
      await kv.del(otpKey);
      return { ok: false, error: "send_failed", message: `${r.code}: ${r.message}` };
    }
    console.log(`[otp] sent phone=${maskPhone(phone)} sid=${sid.slice(0, 8)}…`);
    return { ok: true, cooldown: COOLDOWN_SECONDS };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[otp] send threw phone=${maskPhone(phone)} reason="${msg}"`, e);
    await kv.del(cdKey);
    await kv.del(otpKey);
    return { ok: false, error: "send_failed", message: msg };
  }
}

export type VerifyOtpResult =
  | { ok: true; phone: string }
  | { ok: false; error: "invalid_phone" | "expired" | "bad_code" | "too_many_attempts" };

export async function verifyOtp(sid: string, phoneInput: string, codeInput: string): Promise<VerifyOtpResult> {
  const phone = normalizePhone(phoneInput);
  if (!phone) return { ok: false, error: "invalid_phone" };
  const code = codeInput.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "bad_code" };

  const kv = getKV();
  const otpKey = `otp:${sid}:${phone}`;
  const rec = await kv.get<OtpRecord>(otpKey);
  if (!rec) {
    console.log(`[otp] verify expired phone=${maskPhone(phone)}`);
    return { ok: false, error: "expired" };
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    await kv.del(otpKey);
    console.warn(`[otp] verify too_many_attempts phone=${maskPhone(phone)}`);
    return { ok: false, error: "too_many_attempts" };
  }

  const expected = await sha256Hex(`${code}.${sid}`);
  if (!timingSafeEqual(expected, rec.codeHash)) {
    rec.attempts += 1;
    // 续期 = 不重置 TTL 的简化做法: 重新写入会刷新 TTL, 但安全模型是 5 分钟内最多 5 次, 接受刷新
    await kv.set(otpKey, rec, OTP_TTL_SECONDS);
    console.log(`[otp] verify bad_code phone=${maskPhone(phone)} attempts=${rec.attempts}`);
    return { ok: false, error: "bad_code" };
  }

  await kv.del(otpKey);
  console.log(`[otp] verify ok phone=${maskPhone(phone)}`);
  return { ok: true, phone: toE164(phone) };
}
