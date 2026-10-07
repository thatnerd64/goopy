import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import styled from "@emotion/styled";
import { PlayArrow, VideoFile } from "@mui/icons-material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Box,
  Chip,
  Link,
  Paper,
  Stack,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import Card from "@mui/material/Card";
import { TIDAL_VIDEO_URL } from "src/contants";
import { VideoType } from "src/types";

import { DownloadButton } from "../Buttons/DownloadButton";
import { DialogHandler } from "../Dialog";

import ImageLazy from "./common/ImageLazy";

export default function VideoCard({ video }: { video: VideoType }) {
  const [showModal, setShowModal] = useState<boolean>(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <>
      <Card
        sx={{
          position: "relative",
          "&:hover": {
            borderColor: "rgba(255,255,255,.2)",
            transform: "translateY(-2px)",
          },
        }}
      >
        <PlayButton
          onClick={() => setShowModal(true)}
          aria-label={`Play ${video.title}`}
        >
          <ImageLazy
            height="100%"
            width="100%"
            src={`https://resources.tidal.com/images/${video.imageId?.replace(
              /-/g,
              "/",
            )}/750x750.jpg`}
            alt={`${video.title} thumbnail`}
            style={{
              objectFit: "cover",
              width: "100%",
              height: "190px",
            }}
          />
          <PlayBadge aria-hidden="true">
            <PlayArrow sx={{ fontSize: "2rem" }} />
          </PlayBadge>
        </PlayButton>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, p: 1.5 }}>
          <Box>
            <Link
              href={`https://tidal.com/browse/video/${video.id}`}
              target="_blank"
              rel="noreferrer"
              underline="none"
              sx={{
                color: "text.primary",
                fontSize: "0.95rem",
                fontWeight: 700,
                lineHeight: 1.25,
                "&:hover": { color: "primary.light" },
              }}
            >
              {video.title}
              <OpenInNewIcon
                sx={{
                  fontSize: 14,
                  ml: 0.75,
                  opacity: 0.5,
                  verticalAlign: "middle",
                }}
              />
            </Link>
            <Box>
              <Link
                component={RouterLink}
                to={`/artist/${video.artists[0].id}`}
                underline="hover"
                sx={{
                  color: "text.secondary",
                  fontSize: "0.85rem",
                  "&:hover": { color: "text.primary" },
                }}
              >
                {video.artists?.[0]?.name}
              </Link>
            </Box>
          </Box>

          <Stack
            direction="row"
            sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}
          >
            <Chip
              label={`${Math.round(video.duration / 60)} min.`}
              size="small"
              variant="outlined"
              sx={{ flex: "0 0 auto" }}
            />
            <Box sx={{ flex: "1 1 0" }} />
            <DownloadButton
              item={{
                ...video,
                url: `${TIDAL_VIDEO_URL}/${video.id}`,
              }}
              id={video.id}
              type="video"
              label="Get video"
            />
          </Stack>
        </Box>
      </Card>
      <DialogHandler
        title={video.title}
        open={showModal}
        icon={<VideoFile />}
        onClose={() => setShowModal(false)}
      >
        <Paper sx={{ lineHeight: 0 }}>
          <iframe
            src={`https://embed.tidal.com/videos/${video.id}`}
            width={window.innerWidth * (isMobile ? 0.8 : 0.6)}
            height={window.innerWidth * (isMobile ? 0.8 : 0.6) * 0.56}
            allow="encrypted-media"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            title="TIDAL Embed Player"
          />
        </Paper>
      </DialogHandler>
    </>
  );
}

const PlayButton = styled.button`
  background-color: #000;
  border: 0;
  cursor: pointer;
  display: block;
  padding: 0;
  position: relative;
  width: 100%;

  img {
    transition:
      opacity 300ms ease,
      transform 400ms ease;
  }

  &:hover img {
    opacity: 0.7;
    transform: scale(1.03);
  }
`;

const PlayBadge = styled.span`
  align-items: center;
  backdrop-filter: blur(6px);
  background: rgba(10, 12, 16, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 50%;
  color: #fff;
  display: flex;
  height: 3.5rem;
  justify-content: center;
  left: 50%;
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 3.5rem;
`;
