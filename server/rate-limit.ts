export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();
  private nextCleanup = 0;

  constructor(privateLimit: number, windowMs = 60000, maxBuckets = 10000) {
    this.limit = privateLimit;
    this.windowMs = windowMs;
    this.maxBuckets = maxBuckets;
  }

  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxBuckets: number;

  consume(key: string, now = Date.now()): number {
    if (now >= this.nextCleanup) {
      for (const [key, bucket] of this.buckets) if (bucket.expiresAt <= now) this.buckets.delete(key);
      this.nextCleanup = now + 1000;
    }
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      // Refuse new keys if full rather than letting an attacker evict active limits.
      if (!bucket && this.buckets.size >= this.maxBuckets) return 60;
      bucket = { count: 0, expiresAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count > this.limit ? Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)) : 0;
  }
}
