import { useState, useEffect, useCallback } from "react";
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
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { performLogout } from "./logout";
import TopBar from "./components/TopBar";

export default function NotFound() {
  const navigate = useNavigate();
  const cachedUserInfo = getCachedUserInfo();

  const [username, setUsername] = useState<string>(
    cachedUserInfo?.username ?? ""
  );
  const [displayName, setDisplayName] = useState<string>(
    cachedUserInfo?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUserInfo?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cachedUserInfo);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      setUserLoading(false);
      if (info) {
        setUsername(info.username);
        setDisplayName(info.displayName ?? "");
        setProfilePicUrl(info.profilePicUrl ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await performLogout(navigate);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
        }}
      >
        <TopBar
          onLogout={handleLogout}
          title=""
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          loading={userLoading}
        />
        <Box sx={{ textAlign: "center", mt: 4 }}>
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
      </Box>
    </ThemeProvider>
  );
}
