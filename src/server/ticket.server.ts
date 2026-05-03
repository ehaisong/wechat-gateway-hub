// 统一 ticket 类型: 微信 / 手机号 共用同一个 KV 槽位 ticket:<token>
// 业务站后端通过 /api/public/oauth/exchange 一次性兑换。

export type AuthProvider = "wechat" | "phone";

export interface WechatUserPayload {
  openid: string;
  unionid?: string;
  nickname?: string;
  avatar?: string;
  sex?: number;
  province?: string;
  city?: string;
  country?: string;
}

export interface PhoneUserPayload {
  /** E.164 形式: +8613800001111 */
  phone: string;
}

export type TicketRecord =
  | {
      provider: "wechat";
      client: string;
      used: boolean;
      created_at: number;
      user: WechatUserPayload;
    }
  | {
      provider: "phone";
      client: string;
      used: boolean;
      created_at: number;
      user: PhoneUserPayload;
    };
