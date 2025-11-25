import { useCallback, useEffect, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Paper,
  Avatar,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
} from "@mui/material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { loadUserFollows, loadPublicUserProfile } from "./communityUsers";
import type { CommunityUserSummary } from "./types";
import { setUserId } from "./analytics";
import { performLogout } from "./logout";

const TAB_VALUES = ["followers", "following"] as const;
type FollowTab = (typeof TAB_VALUES)[number];

export default function CommunityFollows() {
  const navigate = useNavigate();
  const params = useParams<{ username: string }>();
  const targetUsername = params.username ?? "";

  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [targetDisplayName, setTargetDisplayName] = useState<string>("");
  const [targetProfilePicUrl, setTargetProfilePicUrl] = useState<string | null>(
    null
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab") ?? "followers";
  const activeTab: FollowTab = TAB_VALUES.includes(queryTab as FollowTab)
    ? (queryTab as FollowTab)
    : "followers";

  const [followers, setFollowers] = useState<CommunityUserSummary[]>([]);
  const [following, setFollowing] = useState<CommunityUserSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      // Allow unauthenticated access - don't redirect to login
      if (info) {
        setUsername(info.username);
        setDisplayName(info.displayName ?? "");
        setProfilePicUrl(info.profilePicUrl ?? null);
        try {
          setUserId(info.userUuid);
        } catch {
          /* ignore analytics errors */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const uname = targetUsername.trim();
    if (!uname) {
      setFollowers([]);
      setFollowing([]);
      setTargetDisplayName("");
      setTargetProfilePicUrl(null);
      setStatus("error");
      setError("Username is required");
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    setError(null);
    setFollowers([]);
    setFollowing([]);
    setTargetDisplayName("");
    setTargetProfilePicUrl(null);

    Promise.all([loadUserFollows(uname), loadPublicUserProfile(uname)])
      .then(([followsData, profileData]) => {
        if (cancelled) return;
        setFollowers(followsData.followers);
        setFollowing(followsData.following);
        setTargetDisplayName(profileData.displayName || "");
        setTargetProfilePicUrl(profileData.profilePicUrl || null);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load follows";
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, value: FollowTab) => {
      setSearchParams({ tab: value }, { replace: true });
    },
    [setSearchParams]
  );

  const activeList = activeTab === "followers" ? followers : following;
  const emptyMessage = useMemo(() => {
    if (status === "loading") return "";
    if (activeTab === "followers") {
      return `${targetUsername} has no followers yet.`;
    }
    return `${targetUsername} is not following anyone yet.`;
  }, [activeTab, status, targetUsername]);

  const handleUserClick = useCallback(
    (selectedUsername: string) => {
      navigate(`/community/${encodeURIComponent(selectedUsername)}`);
    },
    [navigate]
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title="Community"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 4, px: 1 }}>
          <Box maxWidth={720} mx="auto" sx={{ mt: 1 }}>
            <Box display={"flex"} alignItems="center" gap={1.5} mb={1} ml={1}>
              <Avatar
                src={targetProfilePicUrl ?? undefined}
                alt={targetDisplayName || targetUsername}
                sx={{ width: 48, height: 48, bgcolor: "grey.700" }}
              >
                {!targetProfilePicUrl &&
                  (targetDisplayName || targetUsername).charAt(0).toUpperCase()}
              </Avatar>
              <Box display={"flex"} alignItems="center" gap={1}>
                <Typography variant="h5" fontWeight={500}>
                  {targetDisplayName || targetUsername}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                  (@{targetUsername})
                </Typography>
              </Box>
            </Box>
            <Paper
              variant="outlined"
              sx={{ borderRadius: 2, display: "flex", flexDirection: "column" }}
            >
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
              >
                <Tab
                  label={`Followers (${followers.length.toLocaleString()})`}
                  value="followers"
                />
                <Tab
                  label={`Following (${following.length.toLocaleString()})`}
                  value="following"
                />
              </Tabs>
              <Divider />
              {status === "loading" && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    py: 6,
                    gap: 2,
                  }}
                >
                  <CircularProgress size={24} />
                  <Typography color="text.secondary">
                    Loading {activeTab}…
                  </Typography>
                </Box>
              )}
              {status === "error" && error && (
                <Typography color="error" sx={{ px: 3, py: 4 }}>
                  {error}
                </Typography>
              )}
              {status === "ready" && activeList.length === 0 && (
                <Typography color="text.secondary" sx={{ px: 3, py: 4 }}>
                  {emptyMessage}
                </Typography>
              )}
              {activeList.length > 0 && (
                <List disablePadding>
                  {activeList.map((user) => {
                    const primary = user.displayName || `@${user.username}`;
                    return (
                      <ListItemButton
                        key={`${activeTab}-${user.username}`}
                        onClick={() => handleUserClick(user.username)}
                        sx={{ borderRadius: 0 }}
                      >
                        <ListItemAvatar>
                          <Avatar
                            src={user.profilePicUrl ?? undefined}
                            alt={primary}
                            sx={{ bgcolor: "grey.700" }}
                          >
                            {!user.profilePicUrl &&
                              (user.displayName || user.username)
                                .charAt(0)
                                .toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={primary}
                          secondary={
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.secondary"
                              sx={{ display: "block" }}
                            >
                              @{user.username}
                            </Typography>
                          }
                          primaryTypographyProps={{ fontWeight: 600 }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
