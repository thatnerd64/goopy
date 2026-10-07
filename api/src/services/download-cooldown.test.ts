import { describe, expect, it } from "vitest";

import {
  computeCooldown,
  getCooldownConfig,
  getCooldownConfigWarning,
} from "./download-cooldown";

const config30 = { everyTracks: 30, waitMs: 30_000 };

describe("getCooldownConfig", () => {
  it("is off by default", () => {
    expect(getCooldownConfig({})).toBeNull();
    expect(getCooldownConfigWarning({})).toBeNull();
  });

  it("parses 30 songs / 30 seconds", () => {
    expect(
      getCooldownConfig({
        DOWNLOAD_COOLDOWN_TRACKS: "30",
        DOWNLOAD_COOLDOWN_SECONDS: "30",
      }),
    ).toEqual(config30);
  });

  it("accepts fractional seconds", () => {
    expect(
      getCooldownConfig({
        DOWNLOAD_COOLDOWN_TRACKS: "10",
        DOWNLOAD_COOLDOWN_SECONDS: "0.5",
      }),
    ).toEqual({ everyTracks: 10, waitMs: 500 });
  });

  it.each([
    [{ DOWNLOAD_COOLDOWN_TRACKS: "30" }],
    [{ DOWNLOAD_COOLDOWN_SECONDS: "30" }],
    [{ DOWNLOAD_COOLDOWN_TRACKS: "0", DOWNLOAD_COOLDOWN_SECONDS: "30" }],
    [{ DOWNLOAD_COOLDOWN_TRACKS: "30", DOWNLOAD_COOLDOWN_SECONDS: "-5" }],
    [{ DOWNLOAD_COOLDOWN_TRACKS: "abc", DOWNLOAD_COOLDOWN_SECONDS: "30" }],
    [{ DOWNLOAD_COOLDOWN_TRACKS: "30", DOWNLOAD_COOLDOWN_SECONDS: "" }],
  ])("is disabled, with a warning, for %j", (env) => {
    expect(getCooldownConfig(env)).toBeNull();
    expect(getCooldownConfigWarning(env)).toMatch(/must both be set/);
  });
});

describe("computeCooldown", () => {
  it("does not wait before the threshold", () => {
    expect(computeCooldown(0, 12, config30)).toEqual({
      waitMs: 0,
      pendingTracks: 12,
    });
  });

  it("waits once the threshold is reached, and carries the remainder", () => {
    // 12 + 12 songs pending, then an album of 10: 34 songs => 1 wait, 4 carried
    const first = computeCooldown(0, 12, config30);
    const second = computeCooldown(first.pendingTracks, 12, config30);
    expect(second).toEqual({ waitMs: 0, pendingTracks: 24 });
    expect(computeCooldown(second.pendingTracks, 10, config30)).toEqual({
      waitMs: 30_000,
      pendingTracks: 4,
    });
  });

  it("waits exactly at the threshold", () => {
    expect(computeCooldown(0, 30, config30)).toEqual({
      waitMs: 30_000,
      pendingTracks: 0,
    });
  });

  it("earns one wait per 30 songs for a large item", () => {
    // A 100-song playlist: 3 waits of 30s, 10 songs carried over
    expect(computeCooldown(0, 100, config30)).toEqual({
      waitMs: 90_000,
      pendingTracks: 10,
    });
  });

  it("keeps the long-run rate: total wait is floor(songs / 30) * 30s", () => {
    let pending = 0;
    let waited = 0;
    for (const downloaded of [14, 9, 31, 7, 12, 22, 5]) {
      const result = computeCooldown(pending, downloaded, config30);
      pending = result.pendingTracks;
      waited += result.waitMs;
    }
    const songs = 14 + 9 + 31 + 7 + 12 + 22 + 5;
    expect(waited).toBe(Math.floor(songs / 30) * 30_000);
    expect(pending).toBe(songs % 30);
  });

  it("ignores negative numbers", () => {
    expect(computeCooldown(-5, -3, config30)).toEqual({
      waitMs: 0,
      pendingTracks: 0,
    });
  });
});
