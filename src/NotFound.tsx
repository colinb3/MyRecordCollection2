import {
  Box,
  Typography,
  Button,
  Stack,
  ThemeProvider,
  CssBaseline,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { trackEvent } from "./analytics";
import { darkTheme } from "./theme";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="h3" gutterBottom>
          Page not found
        </Typography>
        <Typography color="text" sx={{ mb: 3 }}>
          The page you requested doesn't exist or has been moved.
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button
            variant="contained"
            onClick={() => {
              trackEvent("404_click_home");
              navigate("/");
            }}
          >
            Go Home
          </Button>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
