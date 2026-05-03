// 阿里云短信服务 (Dysmsapi) - SendSms
// 使用 RPC 风格 v1 (2017-05-25) + Signature Version 1.0 (HMAC-SHA1)。
// 完全用 Web Crypto + fetch 实现, 不引入 @alicloud SDK (含 node-only 依赖)。
//
// 文档: https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms
// 签名: https://help.aliyun.com/zh/sdk/product-overview/v1-rpc-signature-mechanism

interface SendSmsArgs {
  phone: string; // 13800001111 (中国大陆, 不带 +86)
  signName: string;
  templateCode: string;
  templateParam: Record<string, string>;
}

export interface SendSmsResult {
  ok: boolean;
  code: string; // "OK" or aliyun error code
  message: string;
  requestId?: string;
  bizId?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

// percent-encode 按阿里云要求: RFC3986
function aliyunEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

async function hmacSha1Base64(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function uuid(): string {
  // 不强求标准 UUID, 阿里云只要求每次唯一
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const accessKeyId = requireEnv("ALIYUN_SMS_ACCESS_KEY_ID");
  const accessKeySecret = requireEnv("ALIYUN_SMS_ACCESS_KEY_SECRET");
  const region = process.env.ALIYUN_SMS_REGION || "cn-hangzhou";
  const endpoint = `https://dysmsapi.aliyuncs.com/`;

  const params: Record<string, string> = {
    // 公共参数
    AccessKeyId: accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    RegionId: region,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: uuid(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2017-05-25",
    // 业务参数
    PhoneNumbers: args.phone,
    SignName: args.signName,
    TemplateCode: args.templateCode,
    TemplateParam: JSON.stringify(args.templateParam),
  };

  // 1) sort + canonicalize
  const sortedKeys = Object.keys(params).sort();
  const canonical = sortedKeys
    .map((k) => `${aliyunEncode(k)}=${aliyunEncode(params[k])}`)
    .join("&");

  // 2) string to sign
  const stringToSign = `GET&${aliyunEncode("/")}&${aliyunEncode(canonical)}`;

  // 3) signature
  const signature = await hmacSha1Base64(`${accessKeySecret}&`, stringToSign);

  // 4) 拼最终 URL (GET)
  const finalUrl = `${endpoint}?Signature=${aliyunEncode(signature)}&${canonical}`;

  const t0 = Date.now();
  const res = await fetch(finalUrl, { method: "GET" });
  const dt = Date.now() - t0;
  let json: {
    Code?: string;
    Message?: string;
    RequestId?: string;
    BizId?: string;
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    console.error(`[aliyun] non-json response status=${res.status} dt=${dt}ms`);
    throw new Error(`Aliyun SMS HTTP ${res.status}`);
  }

  const code = json.Code ?? "Unknown";
  const message = json.Message ?? "(no message)";
  const ok = code === "OK";

  console.log(
    `[aliyun] SendSms phone=${args.phone.slice(0, 3)}****${args.phone.slice(-4)} ` +
      `ok=${ok} code=${code} requestId=${json.RequestId ?? "-"} ` +
      `bizId=${json.BizId ?? "-"} http=${res.status} dt=${dt}ms`,
  );

  return {
    ok,
    code,
    message,
    requestId: json.RequestId,
    bizId: json.BizId,
  };
}
