// Calls to WeChat Open Platform endpoints for `snsapi_login` (website QR login).
// Docs: https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html

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

export function getWechatAppId(): string {
  const v = process.env.WECHAT_APPID;
  if (!v) throw new Error("WECHAT_APPID is not configured");
  return v;
}

function getWechatAppSecret(): string {
  const v = process.env.WECHAT_APPSECRET;
  if (!v) throw new Error("WECHAT_APPSECRET is not configured");
  return v;
}

export function buildQrConnectUrl(state: string, callbackUrl: string): string {
  const params = new URLSearchParams({
    appid: getWechatAppId(),
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "snsapi_login",
    state,
  });
  // The fragment #wechat_redirect is required by WeChat.
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

export async function exchangeCodeForToken(code: string): Promise<WechatTokenResponse> {
  const url = `${TOKEN_URL}?appid=${encodeURIComponent(getWechatAppId())}&secret=${encodeURIComponent(getWechatAppSecret())}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`WeChat token endpoint HTTP ${res.status}`);
  const json = (await res.json()) as WechatTokenResponse;
  if (json.errcode) {
    throw new Error(`WeChat token error ${json.errcode}: ${json.errmsg ?? "unknown"}`);
  }
  return json;
}

export async function fetchUserInfo(accessToken: string, openid: string): Promise<WechatUserInfo> {
  const url = `${USERINFO_URL}?access_token=${encodeURIComponent(accessToken)}&openid=${encodeURIComponent(openid)}&lang=zh_CN`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`WeChat userinfo endpoint HTTP ${res.status}`);
  const json = (await res.json()) as WechatUserInfo;
  if (json.errcode) {
    throw new Error(`WeChat userinfo error ${json.errcode}: ${json.errmsg ?? "unknown"}`);
  }
  return json;
}
