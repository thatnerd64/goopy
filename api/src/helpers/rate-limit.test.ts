import { describe, expect, it } from "vitest";

import { FailureLimiter } from "./rate-limit";

describe("FailureLimiter", () => {
  const setup = (max = 3, windowMs = 1000) => {
    let now = 0;
    return {
      limiter: new FailureLimiter(max, windowMs, () => now),
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it("does not block below the limit", () => {
    const { limiter } = setup();
    limiter.recordFailure("a");
    limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("blocks at the limit and reports the wait", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("a")).toBe(1);
    advance(400);
    expect(limiter.retryAfterSeconds("a")).toBe(1);
  });

  it("unblocks once the window has passed", () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    advance(1001);
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("keeps keys independent", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("b")).toBe(0);
  });

  it("reset clears a key", () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) limiter.recordFailure("a");
    limiter.reset("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });

  it("prune drops expired entries", () => {
    const { limiter, advance } = setup();
    limiter.recordFailure("a");
    advance(2000);
    limiter.prune();
    // Internal map is private: a fresh failure must start from a clean slate
    for (let i = 0; i < 2; i++) limiter.recordFailure("a");
    expect(limiter.retryAfterSeconds("a")).toBe(0);
  });
});
