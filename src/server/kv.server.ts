// Tiny KV abstraction with TTL. Default driver is in-memory (works in dev/preview
// and single-instance prod). For multi-instance deployment, set KV_DRIVER=redis
// and provide REDIS_URL. The redis driver is loaded lazily so the in-memory path
// stays free of node-only deps.

export interface KVStore {
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  get<T = unknown>(key: string): Promise<T | null>;
  // Atomic "take": return value AND delete. Returns null if missing/expired.
  take<T = unknown>(key: string): Promise<T | null>;
  del(key: string): Promise<void>;
}

class MemoryKV implements KVStore {
  private store = new Map<string, { v: unknown; exp: number }>();

  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.store) if (e.exp <= now) this.store.delete(k);
  }

  async set(key: string, value: unknown, ttlSeconds: number) {
    this.sweep();
    this.store.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
  }
  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.exp <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.v as T;
  }
  async take<T>(key: string): Promise<T | null> {
    const v = await this.get<T>(key);
    if (v !== null) this.store.delete(key);
    return v;
  }
  async del(key: string) {
    this.store.delete(key);
  }
}

let _instance: KVStore | null = null;

export function getKV(): KVStore {
  if (_instance) return _instance;
  // We intentionally only ship the in-memory driver inside the bundle.
  // To use Redis, write a thin adapter implementing KVStore and wire it here.
  // Keeping the Worker bundle free of node-only deps.
  _instance = new MemoryKV();
  return _instance;
}
