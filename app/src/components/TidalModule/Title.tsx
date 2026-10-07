import { ReactElement } from "react";
import { Box, Stack, Typography } from "@mui/material";

export function ModuleTitle({
  title,
  total,
  leftBlock,
  rightBlock,
}: {
  title: string | ReactElement;
  total?: number;
  leftBlock?: ReactElement;
  rightBlock?: ReactElement;
}) {
  if (!title) return <br />;
  return (
    <div className="module-title">
      <Stack
        direction="row"
        sx={{
          flexWrap: "wrap",
          alignItems: "center",
          pt: 3,
          pb: 1.5,
          gap: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexGrow: "1",
            alignItems: "center",
            gap: 2,
          }}
        >
          {leftBlock}
          <Typography variant="h2" sx={{ flex: "1 1 0" }}>
            {typeof title === "string" &&
            title.toLowerCase() === "featured albums"
              ? "Albums"
              : title}{" "}
            {total ? (
              <Box
                component="span"
                sx={{
                  color: "text.disabled",
                  fontSize: "0.7em",
                  fontWeight: 600,
                  ml: 0.5,
                }}
              >{`(${total})`}</Box>
            ) : (
              ""
            )}
          </Typography>
        </Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          {rightBlock}
        </Box>
      </Stack>
      <Box sx={{ height: 20 }} />
    </div>
  );
}
