import path from "path";

import { describe, expect, it } from "vitest";

import { assertSafeId, isSafeId, resolveInside } from "./safe-id";

describe("isSafeId", () => {
  it.each([
    "123456",
    123456,
    "0a1b2c3d-1234-5678-90ab-cdef01234567",
    "favorite_albums",
    "abc123",
  ])("accepts %j", (id) => {
    expect(isSafeId(id)).toBe(true);
  });

  it.each([
    "",
    " ",
    "../etc",
    "a/b",
    "a\\b",
    "x; rm -rf /",
    "$(touch pwned)",
    "`id`",
    "a b",
    "a'b",
    'a"b',
    ".hidden",
    "-rf",
    "a".repeat(129),
    -1,
    1.5,
    NaN,
    null,
    undefined,
    {},
    [],
  ])("rejects %j", (id) => {
    expect(isSafeId(id)).toBe(false);
  });
});

describe("assertSafeId", () => {
  it("returns the id as a string", () => {
    expect(assertSafeId(42)).toBe("42");
  });

  it("throws on an unsafe id", () => {
    expect(() => assertSafeId("../x")).toThrow(/Invalid id/);
  });
});

describe("resolveInside", () => {
  const base = path.resolve("/shared/.processing");

  it("resolves a child path", () => {
    expect(resolveInside(base, "123")).toBe(path.join(base, "123"));
  });

  it.each(["../x", "../../etc/passwd", "/etc/passwd", "a/../../b"])(
    "refuses %j",
    (child) => {
      expect(() => resolveInside(base, child)).toThrow(/escapes/);
    },
  );
});
