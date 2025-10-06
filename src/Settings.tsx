import { useEffect, useMemo, useState } from "react";
import apiUrl from "./api";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Drawer,
  Paper,
  IconButton,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { setUserId } from "./analytics";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
  setCachedUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCommunityCaches } from "./communityUsers";
import { useNavigate } from "react-router-dom";
import { darkTheme } from "./theme";
import { useMediaQuery } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";

// Import Components
import TopBar from "./components/TopBar";
import SettingsMenu, {
  type SettingsMenuOption,
} from "./components/SettingsMenu.tsx";
import CollectionSettings from "./components/settings/CollectionSettings.tsx";
import ProfileSettings from "./components/settings/ProfileSettings.tsx";

const MENU_OPTIONS: SettingsMenuOption[] = [
  { id: "profile", label: "Profile" },
  { id: "collection", label: "Collection" },
];

export default function Settings() {
  const navigate = useNavigate();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [userUuid, setUserUuid] = useState<string>(cachedUser?.userUuid ?? "");
  const [bio, setBio] = useState<string>(cachedUser?.bio ?? "");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [selectedSection, setSelectedSection] = useState<string>(
    MENU_OPTIONS[0].id
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width:900px)");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (!info) {
        navigate("/login");
        return;
      }
      setUsername(info.username);
      setDisplayName(info.displayName ?? "");
      setUserUuid(info.userUuid);
      setBio(info.bio ?? "");
      setProfilePicUrl(info.profilePicUrl ?? null);
      try {
        setUserId(info.userUuid);
      } catch {
        /* ignore analytics errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    clearCommunityCaches();
    try {
      setUserId(undefined);
    } catch {
      /* ignore */
    }
    navigate("/login");
  };

  const currentContent = useMemo(() => {
    switch (selectedSection) {
      case "profile":
        return (
          <ProfileSettings
            username={username}
            displayName={displayName}
            bio={bio}
            profilePicUrl={profilePicUrl}
            onProfileUpdated={({
              username: newUsername,
              displayName: newDisplayName,
              bio: newBio,
              profilePicUrl: newProfilePic,
            }) => {
              setUsername(newUsername);
              setDisplayName(newDisplayName);
              setBio(newBio ?? "");
              setProfilePicUrl(newProfilePic ?? null);
              const uuid = userUuid || cachedUser?.userUuid || "";
              if (uuid) {
                setCachedUserInfo({
                  username: newUsername,
                  displayName: newDisplayName,
                  bio: newBio ?? null,
                  profilePicUrl: newProfilePic ?? null,
                  userUuid: uuid,
                  followersCount: cachedUser?.followersCount ?? 0,
                  followingCount: cachedUser?.followingCount ?? 0,
                });
                setUserUuid(uuid);
              }
            }}
          />
        );
      case "collection":
      default:
        return <CollectionSettings />;
    }
  }, [
    selectedSection,
    username,
    displayName,
    bio,
    profilePicUrl,
    userUuid,
    cachedUser,
  ]);

  const menu = (
    <SettingsMenu
      options={MENU_OPTIONS}
      selectedOption={selectedSection}
      onSelect={(id: string) => {
        setSelectedSection(id);
        if (!isLargeScreen) {
          setDrawerOpen(false);
        }
      }}
    />
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <TopBar
          onLogout={handleLogout}
          title="Settings"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          searchBar={false}
        />

        {!isLargeScreen && (
          <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              color="inherit"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open settings menu"
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="body1">Menu</Typography>
          </Box>
        )}

        <Grid
          container
          spacing={2}
          sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          columns={{ xs: 12, md: 12, lg: 12 }}
        >
          {isLargeScreen && (
            <Grid
              size={{ lg: 2, md: 3 }}
              sx={{ display: "flex", minHeight: 0, height: "100%", pb: 2 }}
            >
              <Paper
                sx={{
                  p: 1,
                  width: "100%",
                  borderRadius: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  flex: 1,
                }}
              >
                <Box sx={{ flex: 1, overflowY: "auto", p: 1 }}>{menu}</Box>
              </Paper>
            </Grid>
          )}
          <Grid
            size={{ lg: 10, md: 9, xs: 12 }}
            sx={{ display: "flex", minHeight: 0, height: "100%", pb: 2 }}
          >
            <Paper
              sx={{
                p: 1,
                width: "100%",
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                flex: 1,
              }}
            >
              <Box sx={{ flex: 1, overflowY: "auto", p: 2, pb: 3 }}>
                {currentContent}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {!isLargeScreen && (
          <Drawer
            anchor="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          >
            <Box sx={{ width: 260, p: 2 }}>{menu}</Box>
          </Drawer>
        )}
      </Box>
    </ThemeProvider>
  );
}
