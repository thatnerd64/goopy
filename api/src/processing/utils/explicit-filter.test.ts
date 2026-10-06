import { describe, expect, it, vi } from "vitest";

import { ProcessingItemType } from "../../types";

import {
  editionKey,
  excludeQueuedEditions,
  getExplicitPreference,
  resolveEditions,
  selectEditions,
} from "./explicit-filter";

const album = (
  id: number,
  title: string,
  explicit: boolean | undefined,
  artist = "Kendrick Lamar",
) => ({ id, title, explicit, artist });

const queued = (
  id: string,
  title: string,
  artist = "Kendrick Lamar",
): ProcessingItemType =>
  ({ id, title, artist, type: "album" }) as ProcessingItemType;

describe("getExplicitPreference", () => {
  it("defaults to explicit", () => {
    expect(getExplicitPreference("")).toBe("explicit");
    expect(getExplicitPreference(undefined)).toBe("explicit");
  });

  it.each([
    ["clean", "clean"],
    [" CLEAN ", "clean"],
    ['"both"', "both"],
    ["'explicit'", "explicit"],
  ])("parses %j", (raw, expected) => {
    expect(getExplicitPreference(raw)).toBe(expected);
  });

  it("falls back to the default on an invalid value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getExplicitPreference("nope")).toBe("explicit");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("editionKey", () => {
  it("ignores edition markers, case and spacing", () => {
    const key = editionKey("Kendrick Lamar", "DAMN.");
    expect(editionKey("kendrick  lamar", "DAMN. (Explicit)")).toBe(key);
    expect(editionKey("Kendrick Lamar", "DAMN. [Clean Version]")).toBe(key);
    expect(editionKey("Kendrick Lamar", "damn. (Edited)")).toBe(key);
    expect(editionKey("Kendrick Lamar", "DAMN. (Censored Edition)")).toBe(key);
  });

  it("keeps genuinely different releases apart", () => {
    const key = editionKey("Kendrick Lamar", "DAMN.");
    expect(editionKey("Kendrick Lamar", "DAMN. (Deluxe)")).not.toBe(key);
    expect(editionKey("Kendrick Lamar", "DAMN. (Remastered)")).not.toBe(key);
    expect(editionKey("Someone Else", "DAMN.")).not.toBe(key);
  });
});

describe("selectEditions", () => {
  const clean = album(1, "DAMN.", false);
  const explicit = album(2, "DAMN.", true);

  it("prefers the explicit edition whatever Tidal lists first", () => {
    expect(selectEditions([clean, explicit], "explicit").selected).toEqual([
      explicit,
    ]);
    expect(selectEditions([explicit, clean], "explicit").selected).toEqual([
      explicit,
    ]);
  });

  it("prefers the clean edition when asked to", () => {
    expect(selectEditions([explicit, clean], "clean").selected).toEqual([
      clean,
    ]);
    expect(selectEditions([clean, explicit], "clean").selected).toEqual([
      clean,
    ]);
  });

  it("reports what it skipped", () => {
    const { selected, skipped } = selectEditions([clean, explicit], "explicit");
    expect(selected).toEqual([explicit]);
    expect(skipped).toEqual([clean]);
  });

  it("falls back to the only edition that exists", () => {
    const onlyClean = album(3, "Good Kid", false);
    const onlyExplicit = album(4, "To Pimp a Butterfly", true);

    expect(
      selectEditions([onlyClean, onlyExplicit], "explicit").selected,
    ).toEqual([onlyClean, onlyExplicit]);
    expect(selectEditions([onlyClean, onlyExplicit], "clean").selected).toEqual(
      [onlyClean, onlyExplicit],
    );
  });

  it("matches editions whose titles carry an edition marker", () => {
    const marked = album(5, "DAMN. (Explicit)", true);
    expect(selectEditions([clean, marked], "explicit").selected).toEqual([
      marked,
    ]);
  });

  it("treats an unknown flag as a clean edition", () => {
    const unknown = album(6, "DAMN.", undefined);
    expect(selectEditions([unknown, explicit], "explicit").selected).toEqual([
      explicit,
    ]);
    expect(selectEditions([explicit, unknown], "clean").selected).toEqual([
      unknown,
    ]);
  });

  it("keeps same-title albums by different artists", () => {
    const a = album(7, "Greatest Hits", false, "Artist A");
    const b = album(8, "Greatest Hits", false, "Artist B");
    expect(selectEditions([a, b], "explicit").selected).toEqual([a, b]);
  });

  it("keeps deluxe and standard releases as separate albums", () => {
    const deluxe = album(9, "DAMN. (Deluxe)", true);
    expect(selectEditions([explicit, deluxe], "explicit").selected).toEqual([
      explicit,
      deluxe,
    ]);
  });

  it("preserves the first-seen order of albums", () => {
    const a = album(10, "A", false);
    const b = album(11, "B", true);
    const bClean = album(12, "B", false);
    const c = album(13, "C", false);
    expect(selectEditions([a, bClean, b, c], "explicit").selected).toEqual([
      a,
      b,
      c,
    ]);
  });

  it('keeps every edition with "both", only collapsing duplicate ids', () => {
    expect(selectEditions([clean, explicit, clean], "both").selected).toEqual([
      clean,
      explicit,
    ]);
  });
});

describe("excludeQueuedEditions", () => {
  it("drops an album whose other edition is already queued", () => {
    const explicit = album(2, "DAMN.", true);
    const { selected, skipped } = excludeQueuedEditions(
      [explicit],
      [queued("1", "DAMN.")],
      "explicit",
    );
    expect(selected).toEqual([]);
    expect(skipped).toEqual([explicit]);
  });

  it("keeps an album that is already queued under the same id", () => {
    const explicit = album(2, "DAMN.", true);
    expect(
      excludeQueuedEditions([explicit], [queued("2", "DAMN.")], "explicit")
        .selected,
    ).toEqual([explicit]);
  });

  it("ignores queued items that are not albums", () => {
    const explicit = album(2, "DAMN.", true);
    const playlist = {
      ...queued("9", "DAMN."),
      type: "playlist",
    } as ProcessingItemType;
    expect(
      excludeQueuedEditions([explicit], [playlist], "explicit").selected,
    ).toEqual([explicit]);
  });

  it('does nothing with "both"', () => {
    const explicit = album(2, "DAMN.", true);
    expect(
      excludeQueuedEditions([explicit], [queued("1", "DAMN.")], "both")
        .selected,
    ).toEqual([explicit]);
  });
});

describe("resolveEditions", () => {
  it("combines edition selection and the queue check", () => {
    const damnClean = album(1, "DAMN.", false);
    const damnExplicit = album(2, "DAMN.", true);
    const gkmc = album(3, "good kid, m.A.A.d city", true);
    const gkmcClean = album(4, "good kid, m.A.A.d city", false);

    const { selected, skipped } = resolveEditions(
      [damnClean, damnExplicit, gkmcClean, gkmc],
      [queued("4", "good kid, m.A.A.d city")],
      "explicit",
    );

    // gkmc: the clean edition is already queued, so nothing new is added for it
    expect(selected).toEqual([damnExplicit]);
    expect(skipped).toEqual([damnClean, gkmcClean, gkmc]);
  });
});
