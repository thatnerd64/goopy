import { ReactNode } from "react";
import {
  Box,
  Breakpoint,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

export const DialogHandler = ({
  children,
  title,
  open,
  icon,
  maxWidth = "xl",
  buttons,
  onClose,
}: {
  children: ReactNode;
  title: ReactNode;
  icon: ReactNode;
  open: boolean;
  maxWidth?: Breakpoint;
  buttons?: ReactNode;
  onClose?: () => void;
}) => {
  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-description"
      maxWidth={maxWidth}
    >
      <DialogTitle
        id="alert-dialog-title"
        sx={{
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          fontWeight: 700,
          pb: 1.5,
        }}
      >
        {icon && (
          <Box
            sx={{
              display: "flex",
              mr: 1,
            }}
          >
            {icon}
          </Box>
        )}
        {title}
      </DialogTitle>
      <DialogContent sx={{ pb: 0, pt: "20px !important" }}>
        <DialogContentText id="alert-dialog-description" component="div">
          {children}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ display: "flex", px: 3, py: 2 }}>
        <Box
          sx={{
            flex: "1 1 0",
          }}
        >
          {buttons}
        </Box>
        <Box
          sx={{
            flex: "0 0 auto",
          }}
        >
          <Button variant="outlined" onClick={handleClose}>
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};
