/**
 * @author Colin Brown
 * @description Error boundary component for handling code splitting chunk loading failures gracefully
 * @fileformat React Component
 */

import React, { Component, type ReactNode } from "react";
import {
  Box,
  Typography,
  Button,
  ThemeProvider,
  CssBaseline,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import { darkTheme } from "../theme";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isChunkError: boolean;
}

// Session storage key to track reload attempts
const RELOAD_KEY = "chunk_error_reload";
const MAX_AUTO_RELOADS = 1;

/**
 * Error boundary that catches chunk loading failures (common after deployments)
 * and automatically reloads once, or prompts the user to reload.
 */
export default class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if this is a chunk loading error
    const isChunkError =
      error.name === "ChunkLoadError" ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Loading CSS chunk") ||
      error.message?.includes("Unable to preload CSS") ||
      error.message?.includes("error loading dynamically imported module");

    return { hasError: true, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    console.error("ChunkErrorBoundary caught an error:", error, errorInfo);

    // For chunk errors, try auto-reloading once
    if (this.state.isChunkError) {
      const reloadCount = parseInt(
        sessionStorage.getItem(RELOAD_KEY) || "0",
        10,
      );
      if (reloadCount < MAX_AUTO_RELOADS) {
        sessionStorage.setItem(RELOAD_KEY, String(reloadCount + 1));
        // Clear the cached page and reload
        window.location.reload();
        return;
      }
      // If we've already reloaded, clear the counter so future errors can auto-reload again
      sessionStorage.removeItem(RELOAD_KEY);
    }
  }

  handleReload = () => {
    // Force a hard reload to get the latest chunks
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ThemeProvider theme={darkTheme}>
          <CssBaseline />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "100vh",
              p: 4,
              textAlign: "center",
            }}
          >
            {this.state.isChunkError ? (
              <>
                <Typography variant="h5" gutterBottom>
                  A new version is available
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ mb: 3, maxWidth: 400 }}
                >
                  The app has been updated. Please reload to get the latest
                  version. If the problem persists, try clearing your browser
                  cache.
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="h5" gutterBottom>
                  Something went wrong
                </Typography>
                <Typography
                  color="text.secondary"
                  sx={{ mb: 3, maxWidth: 400 }}
                >
                  An unexpected error occurred. Please try reloading the page.
                </Typography>
              </>
            )}
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={this.handleReload}
            >
              Reload Page
            </Button>
          </Box>
        </ThemeProvider>
      );
    }

    return this.props.children;
  }
}
