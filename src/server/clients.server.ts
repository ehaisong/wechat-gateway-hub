// 客户端白名单（兼容层）：委托给 config-store.server.ts
// 保持原有导出接口不变，内部改为从持久化文件读取

import {
  getClient as csGetClient,
  getClients as csGetClients,
  listClientNames as csListClientNames,
} from "./config-store.server";
import { sha256Hex, timingSafeEqual } from "./crypto.server";

export interface ClientConfig {
  origin: string;
  done_path: string;
  client_secret: string;
}

export function getClients(): Record<string, ClientConfig> {
  return csGetClients();
}

export function getClient(name: string): ClientConfig | null {
  return csGetClient(name);
}

export function listClientNames(): string[] {
  return csListClientNames();
}

export async function verifyClientSecret(client: ClientConfig, presented: string): Promise<boolean> {
  const a = await sha256Hex(client.client_secret);
  const b = await sha256Hex(presented);
  return timingSafeEqual(a, b);
}

export function sanitizeReturnPath(input: string | null | undefined): string {
  if (!input) return "/";
  if (typeof input !== "string") return "/";
  if (input.length > 200) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  if (/[\r\n\t\\]/.test(input)) return "/";
  return input;
}
