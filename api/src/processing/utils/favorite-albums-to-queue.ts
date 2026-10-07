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

type FavoriteAlbumItem = {
  item: {
    id: number;
    title: string;
    explicit?: boolean;
    artist?: { name?: string };
    artists?: Array<{ name?: string }>;
  };
};

async function fetchAllFavoriteAlbums(
  tiddlConfig: TiddlConfig,
): Promise<FavoriteAlbumItem[]> {
  const { user_id: userId, country_code: country } = tiddlConfig.auth;
  const baseUrl = `${TIDAL_API_URL}/v1/users/${userId}/favorites/albums?countryCode=${country}&order=DATE&orderDirection=DESC`;

  return fetchAllTidalPages<FavoriteAlbumItem>(baseUrl, "favorite albums");
}

/**
 * Fetches all favorite albums and adds them individually to the download queue,
 * instead of a single "favorite_albums" job covering the whole collection.
 */
export async function getFavoriteAlbums(
  item: ProcessingItemType,
): Promise<void> {
  const app = getAppInstance();
  const tiddlConfig = app.locals.tiddlConfig;

  try {
    logs(item.id, `🕖 [FAV] Fetching favorite albums...`);

    const favoriteAlbums = await fetchAllFavoriteAlbums(tiddlConfig);

    logs(item.id, `📊 [FAV] Found ${favoriteAlbums.length} favorite albums`);

    // Both editions of an album can be favorited: keep one, so the clean and
    // explicit tracks are not downloaded into the same folder
    const preference = getExplicitPreference();
    const { selected, skipped } = resolveEditions(
      favoriteAlbums
        .filter(({ item: album }) => !!album)
        .map(({ item: album }) => ({
          id: album.id,
          title: album.title,
          explicit: album.explicit,
          artist: album.artists?.[0]?.name || album.artist?.name || "",
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

    logs(item.id, `✅ [FAV] Added ${newItems.length} albums to queue`);
  } catch (error) {
    logs(
      item.id,
      `❌ [FAV] Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
