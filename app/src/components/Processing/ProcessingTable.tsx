import { useState } from "react";
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ProcessingItem } from "src/components/Processing/ProcessingItem";
import { ProcessingItemType } from "src/types";

const PAGE_SIZE = 50;

type Props = {
  items: ProcessingItemType[];
  ariaLabel: string;
  emptyMessage?: string;
};

export function ProcessingTable({ items, ariaLabel, emptyMessage }: Props) {
  const [extraPages, setExtraPages] = useState(0);

  const visibleCount = PAGE_SIZE + extraPages * PAGE_SIZE;

  const visibleItems = items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <Box>
      <TableContainer>
        <Table aria-label={ariaLabel} size="small">
          <TableHead>
            <TableRow>
              <TableCell>Status</TableCell>
              <TableCell>Title</TableCell>
              <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                Artist
              </TableCell>
              <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                Type
              </TableCell>
              <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                Quality
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 && emptyMessage ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      py: 2,
                    }}
                  >
                    {emptyMessage}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <ProcessingItem item={item} key={item.id} />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {remaining > 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 1 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => setExtraPages((n) => n + 1)}
          >
            Show more ({remaining} remaining)
          </Button>
        </Box>
      )}
    </Box>
  );
}
