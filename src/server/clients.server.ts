// Whitelist of business sites that may use this relay.
// Configure via env var CLIENTS_JSON (a JSON object).
//
// Example:
//   CLIENTS_JSON='{"a":{"origin":"https://a.com","done_path":"/login/wechat-done","client_secret":"long-random-string"}}'
//
// In dev/preview we accept a "demo" client pointing back to the relay's own /demo-done page
// so the loop can be exercised end-to-end without configuring real domains.

import { sha256Hex, timingSafeEqual } from "./crypto.server";

export interface ClientConfig {
  origin: string; // e.g. "https://a.com" — no trailing slash
  done_path: string; // e.g. "/login/wechat-done" — must start with "/"
  client_secret: string; // shared secret; only the business backend should hold this
}

let _cache: Record<string, ClientConfig> | null = null;

export function getClients(): Record<string, ClientConfig> {
  if (_cache) return _cache;
  const raw = process.env.CLIENTS_JSON;
  let parsed: Record<string, ClientConfig> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[clients] CLIENTS_JSON is not valid JSON:", e);
      parsed = {};
    }
  }
  // Validate / normalize
  const out: Record<string, ClientConfig> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!v || typeof v !== "object") continue;
    const origin = String(v.origin || "").replace(/\/$/, "");
    const done_path = String(v.done_path || "");
    const client_secret = String(v.client_secret || "");
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
      console.warn(`[clients] skipping "${k}": invalid origin`);
      continue;
    }
    if (!done_path.startsWith("/") || done_path.includes("//") || done_path.length > 200) {
      console.warn(`[clients] skipping "${k}": invalid done_path`);
      continue;
    }
    if (client_secret.length < 16) {
      console.warn(`[clients] skipping "${k}": client_secret too short (need >=16 chars)`);
      continue;
    }
    out[k] = { origin, done_path, client_secret };
  }
  _cache = out;
  return _cache;
}

export function getClient(name: string): ClientConfig | null {
  return getClients()[name] ?? null;
}

export function listClientNames(): string[] {
  return Object.keys(getClients());
}

export async function verifyClientSecret(client: ClientConfig, presented: string): Promise<boolean> {
  // Compare hashes of equal length to keep timing constant regardless of input length.
  const a = await sha256Hex(client.client_secret);
  const b = await sha256Hex(presented);
  return timingSafeEqual(a, b);
}

// Return path validation: must be relative, safe to append to origin.
export function sanitizeReturnPath(input: string | null | undefined): string {
  if (!input) return "/";
  if (typeof input !== "string") return "/";
  if (input.length > 200) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/"; // protocol-relative attack
  if (/[\r\n\t\\]/.test(input)) return "/";
  return input;
}
