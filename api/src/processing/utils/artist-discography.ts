import { TIDAL_API_URL } from "../../../constants";
import { getAppInstance } from "../../helpers/app-instance";
import { fetchAllTidalPages } from "../../helpers/fetch-tidal";
import { ProcessingItemType, TiddlConfig } from "../../types";

import {
  describeSkipped,
  getExplicitPreference,
  resolveEditions,
} from "./explicit-filter";
import { logs } from "./logs";

type AlbumItem = {
  id: number;
  title: string;
  explicit?: boolean;
  artist?: { name?: string };
  artists?: Array<{ name?: string }>;
};

function albumArtist(album: AlbumItem, fallback = ""): string {
  return album.artists?.[0]?.name || album.artist?.name || fallback;
}

async function fetchAlbumsByFilter(
  artistId: string,
  filter: string,
  tiddlConfig: TiddlConfig,
): Promise<AlbumItem[]> {
  const country = tiddlConfig.auth.country_code;
  const baseUrl = `${TIDAL_API_URL}/v1/artists/${artistId}/albums?countryCode=${country}&filter=${filter}`;

  return fetchAllTidalPages<AlbumItem>(baseUrl, "albums");
}

async function fetchAllArtistAlbums(
  artistId: string,
  tiddlConfig: TiddlConfig,
): Promise<AlbumItem[]> {
  const singlesFilter = tiddlConfig.download?.singles_filter ?? "none";

  if (singlesFilter === "only") {
    return fetchAlbumsByFilter(artistId, "EPSANDSINGLES", tiddlConfig);
  }

  if (singlesFilter === "include") {
    const [albums, singles] = await Promise.all([
      fetchAlbumsByFilter(artistId, "ALBUMS", tiddlConfig),
      fetchAlbumsByFilter(artistId, "EPSANDSINGLES", tiddlConfig),
    ]);
    return [...albums, ...singles];
  }

  // Default: "none" → albums only
  return fetchAlbumsByFilter(artistId, "ALBUMS", tiddlConfig);
}

/**
 * Fetches all albums from an artist and adds them individually to the download queue.
 * Respects the singles_filter setting from tiddl config.toml.
 */
export async function getArtistAlbums(item: ProcessingItemType): Promise<void> {
  const app = getAppInstance();
  const tiddlConfig = app.locals.tiddlConfig;
  const artistId = item.url.split("/").pop();

  if (!artistId) {
    logs(item.id, `❌ [DISCOGRAPHY] Invalid artist URL: ${item.url}`);
    return;
  }

  try {
    logs(item.id, `🕖 [DISCOGRAPHY] Fetching albums for artist ${artistId}...`);

    const albums = await fetchAllArtistAlbums(artistId, tiddlConfig);

    logs(item.id, `📊 [DISCOGRAPHY] Found ${albums.length} albums`);

    // Tidal lists the clean and explicit editions as separate albums: keep one
    const preference = getExplicitPreference();
    const { selected, skipped } = resolveEditions(
      albums.map((album) => ({
        ...album,
        artist: albumArtist(album, item.artist),
      })),
      app.locals.processingStack.data,
      preference,
    );

    if (skipped.length > 0) {
      logs(item.id, describeSkipped(skipped, preference));
    }

    const newItems: ProcessingItemType[] = selected.map((album) => ({
      id: String(album.id),
      url: `album/${album.id}`,
      type: "album",
      status: "queue_download",
      loading: false,
      artist: album.artist,
      title: album.title,
      explicit: album.explicit,
      quality: item.quality,
      error: false,
      source: "tidarr",
    }));

    await app.locals.processingStack.actions.addItems(newItems, true);

    logs(item.id, `✅ [DISCOGRAPHY] Added ${newItems.length} albums to queue`);
  } catch (error) {
    logs(
      item.id,
      `❌ [DISCOGRAPHY] Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
