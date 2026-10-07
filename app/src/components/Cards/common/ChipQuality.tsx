import { alpha, Chip, useTheme } from "@mui/material";

export function ChipQuality({ quality }: { quality: string }) {
  const theme = useTheme();

  if (quality === "lossless") return;

  return (
    <Chip
      label={quality}
      size="small"
      sx={{
        backgroundColor: alpha(theme.palette.primary.main, 0.16),
        color: theme.palette.primary.light,
        textTransform: "capitalize",
      }}
    />
  );
}
