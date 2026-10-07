import { ReactNode } from "react";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Box, Link, useMediaQuery, useTheme } from "@mui/material";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

import ImageLazy from "../Cards/common/ImageLazy";

const TitleWithLink = ({ url, title }: { url: string; title: string }) => {
  return (
    <Link
      href={url}
      target="_blank"
      rel="noreferrer"
      underline="none"
      sx={{
        color: "text.primary",
        display: "inline-block",
        "&:hover": { color: "primary.light" },
        "&:hover svg": { opacity: 1 },
      }}
    >
      <Typography
        component="h1"
        sx={{
          fontSize: { xs: 24, md: 34 },
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.15,
          my: 0.5,
          overflowWrap: "anywhere",
        }}
      >
        {title}
        <OpenInNewIcon
          sx={{
            fontSize: "0.6em",
            ml: 1,
            opacity: 0.45,
            transition: "opacity .2s ease",
            verticalAlign: "middle",
          }}
        />
      </Typography>
    </Link>
  );
};

export default function PageHeader({
  title,
  image,
  url,
  isDisabled,
  beforeTitle,
  afterTitle,
  subtitle,
}: {
  title: string;
  image: string;
  url: string;
  isDisabled?: boolean;
  beforeTitle?: ReactNode;
  afterTitle?: ReactNode;
  subtitle?: string;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const coverSize = isMobile ? 112 : 200;

  return (
    <Card
      sx={{
        mt: 3,
        opacity: !isDisabled ? 1 : 0.2,
        pointerEvents: !isDisabled ? "inherit" : "none",
        position: "relative",
        "&:hover": { transform: "none" },
      }}
    >
      {/* Blurred cover used as an ambient backdrop */}
      <Box
        aria-hidden="true"
        sx={{
          backgroundImage: `url(${image})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
          filter: "blur(48px) saturate(150%)",
          inset: -40,
          opacity: 0.4,
          position: "absolute",
        }}
      />
      <Box
        aria-hidden="true"
        sx={{
          background:
            "linear-gradient(90deg, rgba(10,12,16,.55) 0%, rgba(10,12,16,.82) 100%)",
          inset: 0,
          position: "absolute",
        }}
      />

      <Box
        sx={{
          alignItems: { xs: "flex-start", md: "center" },
          display: "flex",
          gap: { xs: 2, md: 3.5 },
          p: { xs: 2, md: 3 },
          position: "relative",
        }}
      >
        <Box
          sx={{
            borderRadius: 3,
            boxShadow: "0 24px 48px -16px rgba(0,0,0,.85)",
            flex: "0 0 auto",
            lineHeight: 0,
            overflow: "hidden",
            width: coverSize,
          }}
        >
          <ImageLazy
            height={coverSize}
            width={coverSize}
            src={image}
            alt={`${title} cover`}
            style={{ display: "block", objectFit: "cover" }}
          />
        </Box>

        <Box
          sx={{
            display: "flex",
            flex: "1 1 0",
            flexDirection: "column",
            gap: 1,
            minWidth: 0,
          }}
        >
          {subtitle && (
            <Typography
              variant="overline"
              component="h2"
              sx={{ color: "primary.light", lineHeight: 1.2 }}
            >
              {subtitle}
            </Typography>
          )}
          <TitleWithLink title={title} url={url} />
          {beforeTitle}
          {afterTitle}
        </Box>
      </Box>
    </Card>
  );
}
