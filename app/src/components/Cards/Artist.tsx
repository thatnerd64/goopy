import { Link as RouterLink, useNavigate } from "react-router-dom";
import AlbumIcon from "@mui/icons-material/Album";
import { Box, Button, Chip, Link } from "@mui/material";
import Card from "@mui/material/Card";
import { useConfigProvider } from "src/provider/ConfigProvider";
import { ArtistType } from "src/types";

import SyncButton from "../Buttons/SyncButton";

import { ArtistAvatar } from "./common/ArtistAvatar";
import { ChipAI } from "./common/ChipAI";
import CoverLink from "./common/CoverLink";

export default function Artist({ artist }: { artist: ArtistType }) {
  const navigate = useNavigate();
  const { display } = useConfigProvider();
  const isRow = display === "small";

  return (
    <Card
      sx={{
        alignItems: isRow ? "center" : "center",
        display: "flex",
        flexDirection: isRow ? "row" : "column",
        gap: 2,
        p: 2,
        textAlign: isRow ? "left" : "center",
        "&:hover": {
          borderColor: "rgba(255,255,255,.2)",
          transform: "translateY(-2px)",
        },
      }}
    >
      <Box sx={{ flex: "0 0 auto" }}>
        <CoverLink
          url={`/artist/${artist.id}`}
          style={{ borderRadius: "50%", display: "block", overflow: "hidden" }}
        >
          <ArtistAvatar
            alt={artist.name}
            sx={{ width: 96, height: 96 }}
            src={`https://resources.tidal.com/images/${artist?.picture?.replace(
              /-/g,
              "/",
            )}/750x750.jpg`}
          />
        </CoverLink>
      </Box>
      <Box
        sx={{
          alignItems: isRow ? "flex-start" : "center",
          display: "flex",
          flex: "1 1 0",
          flexDirection: "column",
          gap: 1,
          minWidth: 0,
        }}
      >
        <Link
          component={RouterLink}
          to={`/artist/${artist.id}`}
          underline="none"
          sx={{
            color: "text.primary",
            fontSize: "1.05rem",
            fontWeight: 700,
            lineHeight: 1.2,
            "&:hover": { color: "primary.light" },
          }}
        >
          {artist.name}
        </Link>

        {(artist.popularity || artist.ai) && (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {artist.popularity ? (
              <Chip
                label={`Popularity: ${artist.popularity}`}
                variant="outlined"
                size="small"
                color={
                  artist.popularity > 75
                    ? "success"
                    : artist.popularity > 33
                      ? "warning"
                      : "error"
                }
              />
            ) : null}
            <ChipAI isAI={artist?.ai} />
          </Box>
        )}

        <Box sx={{ display: "flex", gap: 1 }}>
          <SyncButton item={artist} type="artist" />
          <Button
            variant="outlined"
            endIcon={<AlbumIcon />}
            onClick={() => {
              navigate(`/artist/${artist.id}`);
            }}
            size="small"
          >
            Discography
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
