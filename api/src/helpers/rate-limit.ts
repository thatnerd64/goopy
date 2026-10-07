/**
 * Counts failed attempts per key (typically the client IP) in a sliding window
 * and blocks the key once the limit is reached. In memory only: it resets when
 * the server restarts, which is fine for brute-force protection of a login form.
 */
export class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string): number[] {
    const threshold = this.now() - this.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((t) => t > threshold);
    if (recent.length > 0) this.failures.set(key, recent);
    else this.failures.delete(key);
    return recent;
  }

  /** Seconds to wait before the next attempt, or 0 when the key is not blocked. */
  retryAfterSeconds(key: string): number {
    const recent = this.recent(key);
    if (recent.length < this.maxFailures) return 0;
    return Math.max(
      1,
      Math.ceil((recent[0] + this.windowMs - this.now()) / 1000),
    );
  }

  recordFailure(key: string): void {
    const recent = this.recent(key);
    recent.push(this.now());
    this.failures.set(key, recent);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  /** Drops expired entries so the map cannot grow without bound. */
  prune(): void {
    // Deleting the current key while iterating a Map is safe
    for (const key of this.failures.keys()) this.recent(key);
  }
}
