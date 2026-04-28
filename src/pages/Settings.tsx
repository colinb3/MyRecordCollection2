/**
 * @author Colin Brown
 * @description User settings page component for managing user preferences and configuration
 * @fileformat Page component
 */

import { useEffect, useMemo, useState } from "react";
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
import { setUserId } from "../analytics.ts";
import {
  getCachedUserInfo,
  loadUserInfo,
  setCachedUserInfo,
} from "../userInfo.ts";
import { useNavigate, useLocation } from "react-router-dom";
import { darkTheme } from "../theme.ts";
import { useMediaQuery } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { performLogout } from "../logout.ts";

// Import Components
import TopBar from "../components/TopBar.tsx";
import SettingsMenu, {
  type SettingsMenuOption,
} from "../components/SettingsMenu.tsx";
import CollectionSettings from "../components/settings/CollectionSettings.tsx";
import ProfileSettings from "../components/settings/ProfileSettings.tsx";
import FeedbackSettings from "../components/settings/FeedbackSettings.tsx";

const MENU_OPTIONS: SettingsMenuOption[] = [
  { id: "profile", label: "Profile" },
  { id: "collection", label: "Collection" },
  { id: "feedback", label: "Feedback" },
  { id: "tutorial", label: "Start Tutorial" },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [email, setEmail] = useState<string | null>(cachedUser?.email ?? null);
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? "",
  );
  const [userUuid, setUserUuid] = useState<string>(cachedUser?.userUuid ?? "");
  const [bio, setBio] = useState<string>(cachedUser?.bio ?? "");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null,
  );
  const [selectedSection, setSelectedSection] = useState<string>(
    MENU_OPTIONS[0].id,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width:900px)");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (!info) {
        if (location.pathname !== "/login") {
          const next = encodeURIComponent(
            `${location.pathname}${location.search || ""}${location.hash || ""}`,
          );
          navigate(`/login?next=${next}`);
        }
        return;
      }
      setUsername(info.username);
      setEmail(info.email ?? null);
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
    await performLogout(navigate);
  };

  const currentContent = useMemo(() => {
    switch (selectedSection) {
      case "profile":
        return (
          <ProfileSettings
            username={username}
            email={email}
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
                  email: email,
                  displayName: newDisplayName,
                  bio: newBio ?? null,
                  profilePicUrl: newProfilePic ?? null,
                  userUuid: uuid,
                  followersCount: cachedUser?.followersCount ?? 0,
                  followingCount: cachedUser?.followingCount ?? 0,
                  joinedDate: cachedUser?.joinedDate ?? null,
                  isAdmin: cachedUser?.isAdmin ?? false,
                  adminPermissions: cachedUser?.adminPermissions ?? {
                    canManageAdmins: false,
                    canDeleteUsers: false,
                  },
                  hasPendingReports: cachedUser?.hasPendingReports ?? false,
                });
                setUserUuid(uuid);
              }
            }}
          />
        );
      case "collection":
        return <CollectionSettings />;
      case "feedback":
        return <FeedbackSettings />;
      default:
        return <CollectionSettings />;
    }
  }, [
    selectedSection,
    username,
    email,
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
        if (id === "tutorial") {
          navigate("/mycollection", { state: { showTutorial: true } });
          return;
        }
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
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
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
        />

        <Box sx={{ flex: 1, overflowY: "auto", pb: 4, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: { xs: 0, md: 1 } }}>
            {!isLargeScreen && (
              <Box
                sx={{
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  position: "sticky",
                  top: 0,
                  bgcolor: "background.default",
                  zIndex: 10,
                  py: 0,
                  mx: -1,
                  px: 1,
                }}
              >
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

            <Grid container spacing={2} columns={{ xs: 12, md: 12, lg: 12 }}>
              {isLargeScreen && (
                <Grid size={{ md: 3 }}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      position: "sticky",
                      top: 8,
                      alignSelf: "flex-start",
                    }}
                  >
                    <Box sx={{ p: 1 }}>{menu}</Box>
                  </Paper>
                </Grid>
              )}
              <Grid size={{ md: 9, xs: 12 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 3,
                    borderRadius: 2,
                  }}
                >
                  {currentContent}
                </Paper>
              </Grid>
            </Grid>
          </Box>
        </Box>

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
