import { ReactElement } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Chip, Link, Stack } from "@mui/material";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { useConfigProvider } from "src/provider/ConfigProvider";
import { AlbumArtistType } from "src/types";
import { formatDate } from "src/utils/helpers";
import { surface } from "src/utils/theme";

import { ChipAI } from "./ChipAI";
import { ChipAtmos } from "./ChipAtmos";
import { ChipQuality } from "./ChipQuality";
import CoverLink from "./CoverLink";
import ImageLazy from "./ImageLazy";

const clamp = (lines: number) => ({
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical" as const,
  WebkitLineClamp: lines,
});

const CardTitle = ({
  title,
  url,
  onImage,
}: {
  title: string;
  url: string;
  onImage?: boolean;
}) => (
  <Link
    component={RouterLink}
    to={url}
    underline="none"
    sx={{
      color: "text.primary",
      fontSize: onImage ? "1.05rem" : "0.95rem",
      fontWeight: 700,
      lineHeight: 1.25,
      textShadow: onImage ? "0 1px 8px rgba(0,0,0,.6)" : "none",
      "&:hover": { color: "primary.light" },
      ...clamp(2),
    }}
  >
    {title}
  </Link>
);

const CardArtist = ({
  artist,
  onImage,
}: {
  artist?: AlbumArtistType;
  onImage?: boolean;
}) => {
  if (!artist?.id || !artist?.name) return null;

  return (
    <Link
      component={RouterLink}
      to={`/artist/${artist.id}`}
      underline="hover"
      sx={{
        color: onImage ? "rgba(255,255,255,.82)" : "text.secondary",
        fontSize: "0.85rem",
        fontWeight: 500,
        textShadow: onImage ? "0 1px 8px rgba(0,0,0,.6)" : "none",
        "&:hover": { color: "text.primary" },
        ...clamp(1),
      }}
    >
      {artist.name}
    </Link>
  );
};

type MetaProps = {
  audioQuality?: string;
  audioModes?: string[];
  numberOfTracks?: number;
  duration?: number;
  releaseDate?: string;
  explicit?: boolean;
  isAI?: boolean;
};

const MetaChips = ({
  audioQuality,
  audioModes,
  numberOfTracks,
  duration,
  releaseDate,
  explicit,
  isAI,
}: MetaProps) => {
  if (
    !(audioQuality || numberOfTracks || duration || releaseDate || explicit)
  ) {
    return null;
  }

  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {audioQuality && <ChipQuality quality={audioQuality.toLowerCase()} />}
      <ChipAtmos audioModes={audioModes} />
      {numberOfTracks && (
        <Chip label={`${numberOfTracks} tracks`} size="small" />
      )}
      {duration && (
        <Chip
          label={`${Math.round(duration / 60)} min`}
          size="small"
          variant="outlined"
        />
      )}
      {releaseDate && (
        <Chip
          label={`${new Date(releaseDate).getFullYear()}`}
          size="small"
          variant="outlined"
        />
      )}
      {explicit && <Chip label="Explicit" size="small" variant="outlined" />}
      <ChipAI isAI={isAI} />
    </Stack>
  );
};

type CardSwitchDisplayProps = {
  // Required fields
  id: string;
  title: string;
  coverUrl: string;
  linkUrl: string;
  downloadType: "album" | "playlist" | "mix";
  downloadLabel: string;

  // Optional fields for all types
  subtitle?: string;

  // Artist specific (for albums)
  artist?: AlbumArtistType;

  // Metadata chips
  audioQuality?: string;
  audioModes?: string[];
  numberOfTracks?: number;
  duration?: number;
  releaseDate?: string;
  explicit?: boolean;

  // Dates (for playlists)
  createdDate?: string;
  lastUpdatedDate?: string;
  buttons: ReactElement;
  isAI?: boolean;
};

const hoverLift = {
  "&:hover": {
    borderColor: "rgba(255,255,255,.2)",
    boxShadow: "0 18px 40px -22px rgba(0,0,0,.9)",
    transform: "translateY(-2px)",
  },
};

function SmallCard(props: CardSwitchDisplayProps) {
  const {
    title,
    coverUrl,
    linkUrl,
    subtitle,
    artist,
    createdDate,
    lastUpdatedDate,
    buttons,
  } = props;

  return (
    <Card sx={{ display: "flex", gap: 1.5, p: 1.25, ...hoverLift }}>
      <Box sx={{ flex: "0 0 auto", width: 112 }}>
        <CoverLink
          url={linkUrl}
          style={{
            borderRadius: 12,
            display: "block",
            overflow: "hidden",
            boxShadow: "0 10px 24px -14px rgba(0,0,0,.9)",
          }}
        >
          <ImageLazy
            height={112}
            width={112}
            src={coverUrl}
            alt={`${title} cover`}
            style={{ display: "block", objectFit: "cover" }}
          />
        </CoverLink>
      </Box>
      <Box
        sx={{
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          gap: 0.75,
          minWidth: 0,
        }}
      >
        <Box>
          <CardTitle title={title} url={linkUrl} />
          <CardArtist artist={artist} />
          {subtitle && (
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", lineHeight: 1.35, ...clamp(2) }}
            >
              {subtitle}
            </Typography>
          )}
          {createdDate && (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {formatDate(createdDate)}
            </Typography>
          )}
        </Box>

        <MetaChips {...props} />

        {lastUpdatedDate && (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Last update: {formatDate(lastUpdatedDate)}
          </Typography>
        )}

        <Stack direction="row" sx={{ gap: 1, mt: "auto", pt: 0.5 }}>
          {buttons}
        </Stack>
      </Box>
    </Card>
  );
}

function LargeCard(props: CardSwitchDisplayProps) {
  const {
    title,
    coverUrl,
    linkUrl,
    subtitle,
    artist,
    lastUpdatedDate,
    buttons,
  } = props;

  return (
    <Card
      sx={{
        aspectRatio: "1 / 1",
        position: "relative",
        ...hoverLift,
        // Details appear on hover, and are always visible without a hover device
        "& .card-reveal": {
          opacity: 0,
          transform: "translateY(8px)",
          transition: "opacity .25s ease, transform .25s ease",
        },
        "&:hover .card-reveal, &:focus-within .card-reveal": {
          opacity: 1,
          transform: "none",
        },
        "@media (hover: none)": {
          "& .card-reveal": { opacity: 1, transform: "none" },
        },
      }}
    >
      <CoverLink
        url={linkUrl}
        disableOverlay
        style={{ display: "block", height: "100%", width: "100%" }}
      >
        <ImageLazy
          height="100%"
          width="100%"
          src={coverUrl}
          alt={`${title} cover`}
          style={{
            display: "block",
            objectFit: "cover",
            height: "100%",
            width: "100%",
          }}
        />
      </CoverLink>
      <Box
        sx={{
          background: `linear-gradient(180deg, rgba(10,12,16,0) 30%, ${surface.background}f2 100%)`,
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transition: "background .25s ease",
          ".MuiCard-root:hover &, .MuiCard-root:focus-within &": {
            background: `linear-gradient(180deg, rgba(10,12,16,.25) 0%, ${surface.background}f7 82%)`,
          },
        }}
      />
      <Box
        sx={{
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          left: 0,
          p: 1.5,
          position: "absolute",
          right: 0,
        }}
      >
        <Box>
          <CardTitle title={title} url={linkUrl} onImage />
          <CardArtist artist={artist} onImage />
          {subtitle && (
            <Typography
              variant="body2"
              sx={{
                color: "rgba(255,255,255,.82)",
                lineHeight: 1.3,
                ...clamp(2),
              }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          className="card-reveal"
          sx={{ display: "flex", flexDirection: "column", gap: 0.75, pt: 0.5 }}
        >
          <MetaChips {...props} />
          {lastUpdatedDate && (
            <Typography
              variant="caption"
              sx={{ color: "rgba(255,255,255,.7)" }}
            >
              Last update: {formatDate(lastUpdatedDate)}
            </Typography>
          )}
          <Stack direction="row" sx={{ gap: 1 }}>
            {buttons}
          </Stack>
        </Box>
      </Box>
    </Card>
  );
}

export default function CardSwitchDisplay(props: CardSwitchDisplayProps) {
  const { display } = useConfigProvider();

  return display === "large" ? (
    <LargeCard {...props} />
  ) : (
    <SmallCard {...props} />
  );
}
