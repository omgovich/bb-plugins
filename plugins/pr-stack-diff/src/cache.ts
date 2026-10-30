/**
 * Keeps the last good value per key: fresh values are served without
 * reloading, and a failed reload falls back to the stale value with its error.
 */
export class StaleCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  async get(key: string, load: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
    const entry = this.entries.get(key);
    if (entry && this.now() - entry.at < this.ttlMs) return { value: entry.value, error: null };
    try {
      const value = await load();
      this.entries.set(key, { value, at: this.now() });
      return { value, error: null };
    } catch (error) {
      return { value: entry?.value ?? null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  clear(key: string): void {
    this.entries.delete(key);
  }
}

/** The most recently used `limit` values; reading a key makes it the newest. */
export class LruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly limit: number) {}

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }
}
