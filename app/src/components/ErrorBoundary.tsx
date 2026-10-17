import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unexpected rendering error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <Box
        role="alert"
        sx={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          px: 2,
          textAlign: "center",
        }}
      >
        <Typography variant="h5" component="h1">
          Something went wrong
        </Typography>
        <Typography color="text.secondary">
          This page could not be displayed. Reloading usually fixes it.
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Box>
    );
  }
}
