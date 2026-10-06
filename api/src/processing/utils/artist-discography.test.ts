import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessingItemType } from "../../types";

const fetchAllTidalPages = vi.fn();
const addItems = vi.fn();
const processingData: ProcessingItemType[] = [];

vi.mock("../../helpers/fetch-tidal", () => ({
  fetchAllTidalPages: (...args: unknown[]) => fetchAllTidalPages(...args),
}));

vi.mock("../../helpers/app-instance", () => ({
  getAppInstance: () => ({
    locals: {
      tiddlConfig: {
        auth: { country_code: "US" },
        download: { singles_filter: "none" },
      },
      processingStack: { data: processingData, actions: { addItems } },
    },
  }),
}));

vi.mock("./logs", () => ({ logs: vi.fn() }));

import { getArtistAlbums } from "./artist-discography";

const artistItem = {
  id: "artist-1",
  url: "artist/3995478",
  type: "artist",
  artist: "Kendrick Lamar",
  title: "All albums",
  quality: "high",
} as ProcessingItemType;

const tidalAlbum = (id: number, title: string, explicit: boolean) => ({
  id,
  title,
  explicit,
  artists: [{ name: "Kendrick Lamar" }],
});

describe("getArtistAlbums", () => {
  const originalPreference = process.env.EXPLICIT_PREFERENCE;

  beforeEach(() => {
    processingData.length = 0;
    addItems.mockReset();
    fetchAllTidalPages.mockReset();
    fetchAllTidalPages.mockResolvedValue([
      tidalAlbum(100, "DAMN.", false),
      tidalAlbum(101, "DAMN.", true),
      tidalAlbum(200, "Mr. Morale", true),
      tidalAlbum(300, "Section.80", false),
      tidalAlbum(301, "Section.80", true),
    ]);
  });

  afterEach(() => {
    if (originalPreference === undefined)
      delete process.env.EXPLICIT_PREFERENCE;
    else process.env.EXPLICIT_PREFERENCE = originalPreference;
  });

  const queuedAlbums = () =>
    (addItems.mock.calls[0][0] as ProcessingItemType[]).map((i) => ({
      id: i.id,
      explicit: i.explicit,
    }));

  it("queues the explicit edition of each album by default", async () => {
    delete process.env.EXPLICIT_PREFERENCE;
    await getArtistAlbums(artistItem);

    expect(queuedAlbums()).toEqual([
      { id: "101", explicit: true },
      { id: "200", explicit: true },
      { id: "301", explicit: true },
    ]);
  });

  it("queues the clean edition when EXPLICIT_PREFERENCE=clean", async () => {
    process.env.EXPLICIT_PREFERENCE = "clean";
    await getArtistAlbums(artistItem);

    // "Mr. Morale" only exists as explicit: it is still queued
    expect(queuedAlbums()).toEqual([
      { id: "100", explicit: false },
      { id: "200", explicit: true },
      { id: "300", explicit: false },
    ]);
  });

  it("queues every edition when EXPLICIT_PREFERENCE=both", async () => {
    process.env.EXPLICIT_PREFERENCE = "both";
    await getArtistAlbums(artistItem);

    expect(queuedAlbums().map((a) => a.id)).toEqual([
      "100",
      "101",
      "200",
      "300",
      "301",
    ]);
  });

  it("does not queue the sibling of an edition already in the queue", async () => {
    delete process.env.EXPLICIT_PREFERENCE;
    processingData.push({
      id: "100",
      title: "DAMN.",
      artist: "Kendrick Lamar",
      type: "album",
    } as ProcessingItemType);

    await getArtistAlbums(artistItem);

    expect(queuedAlbums().map((a) => a.id)).toEqual(["200", "301"]);
  });
});
