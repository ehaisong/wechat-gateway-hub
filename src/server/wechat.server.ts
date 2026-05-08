// 微信登录支持两种 flow:
//   - "web": 网站应用,scope=snsapi_login,PC 浏览器扫码二维码
//     https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
//   - "mp" : 公众号网页授权,scope=snsapi_userinfo,微信内置浏览器静默/弹窗授权
//     https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_webpage_authorization.html
//
// 两套 flow 使用不同的 AppID / AppSecret,但 token/userinfo 接口完全相同。

export type WechatFlow = "web" | "mp";

export interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export interface WechatUserInfo {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

const TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";
const USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo";

// 微信 API 超时(ms)。token 必须等到; userinfo 失败可降级为 openid-only。
const TOKEN_TIMEOUT_MS = 4000;
const USERINFO_TIMEOUT_MS = 2500;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { method: "GET", signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

function getCreds(flow: WechatFlow): { appid: string; secret: string } {
  if (flow === "mp") {
    return {
      appid: requireEnv("WECHAT_MP_APPID"),
      secret: requireEnv("WECHAT_MP_APPSECRET"),
    };
  }
  return {
    appid: requireEnv("WECHAT_APPID"),
    secret: requireEnv("WECHAT_APPSECRET"),
  };
}

// --- UA 判断 ----------------------------------------------------------------

export function isWeChatBrowser(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /MicroMessenger/i.test(ua);
}

// --- 构造授权跳转 URL --------------------------------------------------------

/** PC 端: 网站应用扫码登录 */
export function buildQrConnectUrl(state: string, callbackUrl: string): string {
  const { appid } = getCreds("web");
  const params = new URLSearchParams({
    appid,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

/** 微信内: 公众号网页授权 (snsapi_userinfo,带头像昵称) */
export function buildMpAuthorizeUrl(state: string, callbackUrl: string): string {
  const { appid } = getCreds("mp");
  const params = new URLSearchParams({
    appid,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "snsapi_userinfo",
    state,
  });
  return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`;
}

// --- code -> token / userinfo ------------------------------------------------

export async function exchangeCodeForToken(
  code: string,
  flow: WechatFlow,
): Promise<WechatTokenResponse> {
  const { appid, secret } = getCreds(flow);
  const url = `${TOKEN_URL}?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetchWithTimeout(url, TOKEN_TIMEOUT_MS);
  if (!res.ok) throw new Error(`WeChat token endpoint HTTP ${res.status}`);
  const json = (await res.json()) as WechatTokenResponse;
  if (json.errcode) {
    throw new Error(`WeChat token error ${json.errcode}: ${json.errmsg ?? "unknown"}`);
  }
  return json;
}

export async function fetchUserInfo(
  accessToken: string,
  openid: string,
): Promise<WechatUserInfo> {
  const url = `${USERINFO_URL}?access_token=${encodeURIComponent(accessToken)}&openid=${encodeURIComponent(openid)}&lang=zh_CN`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`WeChat userinfo endpoint HTTP ${res.status}`);
  const json = (await res.json()) as WechatUserInfo;
  if (json.errcode) {
    throw new Error(`WeChat userinfo error ${json.errcode}: ${json.errmsg ?? "unknown"}`);
  }
  return json;
}
