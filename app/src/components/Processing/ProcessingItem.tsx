import { ReactElement } from "react";
import { Link } from "react-router-dom";
import styled from "@emotion/styled";
import { CoffeeMaker, MoreHoriz } from "@mui/icons-material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckIcon from "@mui/icons-material/Check";
import ClearIcon from "@mui/icons-material/Clear";
import DownloadIcon from "@mui/icons-material/Download";
import WarningIcon from "@mui/icons-material/Warning";
import {
  alpha,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  TableCell,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useProcessingProvider } from "src/provider/ProcessingProvider";
import { ProcessingItemType } from "src/types";

import { DialogTerminal } from "../Dialog/DialogTerminal";

import { CircularProgressWithLabel } from "./CircularProgressWithLabel";

const STATUS_ICONS: Record<string, ReactElement> = {
  finished: <CheckIcon color="success" />,
  error: <WarningIcon color="error" />,
  queue_download: <AccessTimeIcon sx={{ color: "text.secondary" }} />,
  queue_processing: <MoreHoriz sx={{ color: "text.secondary" }} />,
  processing: <CoffeeMaker color="secondary" />,
};

// Left accent of the row, so the state is readable at a glance
const STATUS_ACCENT: Record<string, string> = {
  download: "#3dd9c3",
  processing: "#a78bfa",
  queue_processing: "#a78bfa",
  finished: "#4ade80",
  error: "#f87171",
};

export const ProcessingItem = ({ item }: { item: ProcessingItemType }) => {
  const status = item?.status;
  const { actions, isPaused, isBeingDeleted } = useProcessingProvider();

  if (!item?.status) return null;

  const url = item.type.includes("favorite_")
    ? `/#my-favorites`
    : `/${item.type}/${item.id}`;

  const renderStatusIcon = () => {
    if (status === "download" && item.progress) {
      return (
        <CircularProgressWithLabel
          current={item.progress.current}
          total={item.progress.total}
        />
      );
    }

    const icon = STATUS_ICONS[status] ?? <CircularProgress size={24} />;
    return <Tooltip title={status}>{icon}</Tooltip>;
  };

  const percentage =
    status === "download" && item.progress && item.progress.total > 0
      ? Math.round((item.progress.current / item.progress.total) * 100)
      : undefined;

  return (
    <TableRow
      hover
      sx={{
        "&:last-child td, &:last-child th": { border: 0 },
        "& td:first-of-type": {
          boxShadow: STATUS_ACCENT[status]
            ? `inset 3px 0 0 ${STATUS_ACCENT[status]}`
            : "none",
        },
        "&.MuiTableRow-hover:hover": {
          backgroundColor: alpha("#ffffff", 0.03),
        },
        opacity: isBeingDeleted === item.id ? 0.3 : 1,
      }}
      data-testid="processing-item"
    >
      <TableCell width="6rem">
        <Box sx={{ alignItems: "center", display: "flex", flex: "0 0 auto" }}>
          <RemoveButton onClick={() => actions.removeItem(item.id)}>
            <ClearIcon />
          </RemoveButton>
          {renderStatusIcon()}
          {status === "error" && (
            <>
              &nbsp;&nbsp;
              {item.errorStage === "post_processing" ? (
                <Tooltip title="Retry post processing">
                  <Button
                    variant="outlined"
                    size="small"
                    data-testid="btn-retry-post-processing"
                    onClick={() => actions.retryPostProcessing(item.id)}
                  >
                    Retry
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip title="Retry download">
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => actions.retryItem(item)}
                  >
                    Retry
                  </Button>
                </Tooltip>
              )}
            </>
          )}
          {isPaused && status === "queue_download" && (
            <>
              &nbsp;&nbsp;
              <Tooltip title="Download now">
                <IconButton
                  size="small"
                  data-testid="btn-single-download"
                  onClick={() => actions.downloadNow(item.id)}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          &nbsp;&nbsp;
          {item.status !== "queue_download" && <DialogTerminal item={item} />}
        </Box>
      </TableCell>
      <TableCell scope="row">
        <Box sx={{ alignItems: "center", display: "flex", gap: 1 }}>
          {item.id ? <TitleLink to={url}>{item.title}</TitleLink> : item.title}
          {item.explicit && (
            <Tooltip title="Explicit edition">
              <Chip
                label="E"
                size="small"
                variant="outlined"
                sx={{
                  flex: "0 0 auto",
                  fontSize: 11,
                  height: 18,
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            </Tooltip>
          )}
        </Box>
        {item.artist && (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: { xs: "block", sm: "none" },
            }}
          >
            {item.artist}
          </Typography>
        )}
        {percentage !== undefined && item.progress && (
          <Box sx={{ alignItems: "center", display: "flex", gap: 1, mt: 0.75 }}>
            <LinearProgress
              variant="determinate"
              value={percentage}
              aria-label={`Download progress ${percentage}%`}
              sx={{ flex: "1 1 0", maxWidth: 220 }}
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {item.progress.current}/{item.progress.total}
            </Typography>
          </Box>
        )}
      </TableCell>
      <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
        {item.artist}
      </TableCell>
      <TableCell scope="row" sx={{ display: { xs: "none", sm: "table-cell" } }}>
        <Chip label={item.type} size="small" variant="outlined" />
      </TableCell>
      <TableCell scope="row" sx={{ display: { xs: "none", sm: "table-cell" } }}>
        {item.type !== "video" && item.quality ? (
          <Chip label={item.quality} size="small" />
        ) : (
          ""
        )}
      </TableCell>
    </TableRow>
  );
};

const RemoveButton = styled(Button)`
  color: #9aa3b2;
  margin: 0 0.5rem 0 0;
  min-width: 0;
  padding: 0;

  &:hover {
    color: #f87171;
  }
`;

const TitleLink = styled(Link)`
  color: #eef1f6;
  font-weight: 600;
  text-decoration: none;

  &:hover {
    color: #86f0e0;
    text-decoration: underline;
  }
`;
