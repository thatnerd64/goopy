import { Link as RouterLink } from "react-router-dom";
import { Chip, Link, Stack } from "@mui/material";

import { AlbumType } from "../../types";
import { DownloadButton } from "../Buttons/DownloadButton";
import { JellyfinSearchButton } from "../Buttons/JellyfinSearchButton";
import { NavidromeSearchButton } from "../Buttons/NavidromeSearchButton";
import { PlexSearchButton } from "../Buttons/PlexSearchButton";
import { ArtistAvatar } from "../Cards/common/ArtistAvatar";
import { ChipAtmos } from "../Cards/common/ChipAtmos";
import { ChipQuality } from "../Cards/common/ChipQuality";

import PageHeader from "./Header";

export default function AlbumHeader({ album }: { album: AlbumType }) {
  return (
    <PageHeader
      title={album.title}
      subtitle={album.type}
      url={album.url}
      image={`https://resources.tidal.com/images/${album.cover?.replace(
        /-/g,
        "/",
      )}/750x750.jpg`}
      beforeTitle={
        <Stack
          direction="row"
          spacing={1}
          sx={{
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <ArtistAvatar
            alt={album.artists?.[0]?.name}
            sx={{ width: 28, height: 28 }}
            src={`https://resources.tidal.com/images/${album.artists?.[0]?.picture?.replace(
              /-/g,
              "/",
            )}/750x750.jpg`}
          />
          <Link
            component={RouterLink}
            to={`/artist/${album.artists[0].id}`}
            underline="hover"
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            {album.artists?.[0]?.name}
          </Link>
        </Stack>
      }
      afterTitle={
        <>
          <Stack
            direction="row"
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
              mb: 2,
            }}
          >
            <ChipQuality quality={album?.audioQuality?.toLowerCase()} />
            <ChipAtmos audioModes={album.audioModes} />
            <Chip label={`${album.numberOfTracks} tracks`} size="small" />
            <Chip
              label={`${Math.round(album.duration / 60)} min`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${new Date(album.releaseDate).getFullYear()}`}
              size="small"
              variant="outlined"
            />
            {album.explicit && (
              <Chip label="Explicit" size="small" variant="outlined" />
            )}
          </Stack>
          <Stack
            direction="row"
            sx={{
              flexWrap: "wrap",
              alignItems: "center",
              gap: 1,
            }}
          >
            <DownloadButton
              item={album}
              id={album.id}
              type="album"
              label="Get album"
            />
            <PlexSearchButton query={album.title} pivot="albums" />
            <NavidromeSearchButton query={album.title} pivot="albums" />
            <JellyfinSearchButton
              query={album.title}
              albumQuery={album.title}
              pivot="albums"
            />
          </Stack>
        </>
      }
    />
  );
}
