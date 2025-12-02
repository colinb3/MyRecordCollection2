import { Component, type ReactNode } from "react";
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

/**
 * Error boundary that catches chunk loading failures (common after deployments)
 * and prompts the user to reload.
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

  componentDidCatch(error: Error) {
    // Log the error for debugging
    console.error("ChunkErrorBoundary caught an error:", error);
  }

  handleReload = () => {
    // Force a hard reload
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
                  version. You may need to clear your browser cache if the
                  problem persists.
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
