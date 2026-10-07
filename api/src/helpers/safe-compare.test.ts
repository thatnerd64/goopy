import { describe, expect, it } from "vitest";

import { safeEqual } from "./safe-compare";

describe("safeEqual", () => {
  it("matches equal strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
  });

  it("rejects different strings, including different lengths", () => {
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret2")).toBe(false);
    expect(safeEqual("secret", "")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(safeEqual(undefined, "x")).toBe(false);
    expect(safeEqual("x", null)).toBe(false);
    expect(safeEqual(1, 1)).toBe(false);
    expect(safeEqual(["a"], "a")).toBe(false);
  });
});
