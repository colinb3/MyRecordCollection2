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
  Button,
  Stack,
  ButtonBase,
} from "@mui/material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { darkTheme } from "../theme";
import { getCachedUserInfo, loadUserInfo } from "../userInfo";
import {
  loadUserFollows,
  loadPublicUserProfile,
  followUser,
  unfollowUser,
  loadUserFollowsPaginated,
} from "../communityUsers";
import type { CommunityUserSummary } from "../types";
import { setUserId } from "../analytics";
import { performLogout } from "../logout";

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
  const [userLoading, setUserLoading] = useState(!cachedUser);

  const [searchParams, setSearchParams] = useSearchParams();
  const queryTab = searchParams.get("tab") ?? "followers";
  const activeTab: FollowTab = TAB_VALUES.includes(queryTab as FollowTab)
    ? (queryTab as FollowTab)
    : "followers";

  const [followers, setFollowers] = useState<CommunityUserSummary[]>([]);
  const [following, setFollowing] = useState<CommunityUserSummary[]>([]);
  const [followersHasMore, setFollowersHasMore] = useState(false);
  const [followingHasMore, setFollowingHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [followPending, setFollowPending] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const USERS_PER_PAGE = 15;

  const handleOpenOwnerProfile = useCallback(() => {
    if (!targetUsername) return;
    navigate(`/community/${encodeURIComponent(targetUsername)}`);
  }, [navigate, targetUsername]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      setUserLoading(false);
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

        // Load the current user's following list
        try {
          const myFollowsData = await loadUserFollows(info.username);
          if (!cancelled) {
            const followingSet = new Set(
              myFollowsData.following.map((u) => u.username.toLowerCase())
            );
            setMyFollowing(followingSet);
          }
        } catch {
          // Ignore errors loading follow list
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
      setFollowersHasMore(false);
      setFollowingHasMore(false);
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
    setFollowersHasMore(false);
    setFollowingHasMore(false);
    setTargetDisplayName("");
    setTargetProfilePicUrl(null);

    Promise.all([
      loadUserFollowsPaginated(uname, USERS_PER_PAGE, 0, 0),
      loadPublicUserProfile(uname),
    ])
      .then(([followsData, profileData]) => {
        if (cancelled) return;
        setFollowers(followsData.followers);
        setFollowing(followsData.following);
        setFollowersHasMore(followsData.followersHasMore);
        setFollowingHasMore(followsData.followingHasMore);
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
  const hasMore =
    activeTab === "followers" ? followersHasMore : followingHasMore;

  const emptyMessage = useMemo(() => {
    if (status === "loading") return "";
    if (activeTab === "followers") {
      return `${targetUsername} has no followers yet.`;
    }
    return `${targetUsername} is not following anyone yet.`;
  }, [activeTab, status, targetUsername]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !targetUsername) return;

    setLoadingMore(true);
    setError(null);

    try {
      const followersOffset = activeTab === "followers" ? followers.length : 0;
      const followingOffset = activeTab === "following" ? following.length : 0;

      const data = await loadUserFollowsPaginated(
        targetUsername,
        USERS_PER_PAGE,
        followersOffset,
        followingOffset
      );

      if (activeTab === "followers") {
        setFollowers((prev) => [...prev, ...data.followers]);
        setFollowersHasMore(data.followersHasMore);
      } else {
        setFollowing((prev) => [...prev, ...data.following]);
        setFollowingHasMore(data.followingHasMore);
      }
    } catch (err) {
      console.error("Failed to load more users:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load more users"
      );
    } finally {
      setLoadingMore(false);
    }
  }, [
    activeTab,
    followers.length,
    following.length,
    loadingMore,
    hasMore,
    targetUsername,
    USERS_PER_PAGE,
  ]);

  const handleUserClick = useCallback(
    (selectedUsername: string) => {
      navigate(`/community/${encodeURIComponent(selectedUsername)}`);
    },
    [navigate]
  );

  const handleFollowToggle = useCallback(
    async (targetUser: string, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent navigation when clicking button

      if (!username) {
        // Not logged in, redirect to login
        navigate("/login");
        return;
      }

      const normalizedTarget = targetUser.toLowerCase();
      if (followPending.has(normalizedTarget)) return;

      const isCurrentlyFollowing = myFollowing.has(normalizedTarget);

      setFollowPending((prev) => new Set(prev).add(normalizedTarget));

      try {
        const result = isCurrentlyFollowing
          ? await unfollowUser(targetUser)
          : await followUser(targetUser);

        setMyFollowing((prev) => {
          const next = new Set(prev);
          if (result.isFollowing) {
            next.add(normalizedTarget);
          } else {
            next.delete(normalizedTarget);
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to toggle follow:", err);
      } finally {
        setFollowPending((prev) => {
          const next = new Set(prev);
          next.delete(normalizedTarget);
          return next;
        });
      }
    },
    [username, navigate, myFollowing, followPending]
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
          loading={userLoading}
        />
        <Box sx={{ flex: 1, overflowY: "hidden", pb: 4, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ height: "100%" }}>
            <ButtonBase
              onClick={handleOpenOwnerProfile}
              sx={{
                borderRadius: 1,
                px: 1,
                py: 0.5,
                textAlign: "left",
                display: "flex",
                gap: 1,
                mb: 1,
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
              aria-label={`View ${targetDisplayName}'s profile`}
            >
              <Avatar
                src={targetProfilePicUrl ?? undefined}
                alt={targetDisplayName || targetUsername}
                sx={{ width: 48, height: 48, bgcolor: "grey.700" }}
              >
                {!targetProfilePicUrl &&
                  (targetDisplayName || targetUsername).charAt(0).toUpperCase()}
              </Avatar>
              <Stack direction="column" spacing={-0.5}>
                <Typography
                  variant="h6"
                  fontWeight={500}
                  noWrap
                  maxWidth={"calc(100vw - 95px)"}
                >
                  {targetDisplayName || targetUsername}
                </Typography>
                <Typography
                  variant="subtitle1"
                  color="text.secondary"
                  noWrap
                  maxWidth={"calc(100vw - 95px)"}
                >
                  @{targetUsername}
                </Typography>
              </Stack>
            </ButtonBase>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                maxHeight: "calc(100vh - 160px)",
              }}
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
                <>
                  <List
                    disablePadding
                    sx={{
                      height: "100%",
                      overflowY: "auto",
                    }}
                  >
                    {activeList.map((user) => {
                      const primary = user.displayName || `@${user.username}`;
                      const isCurrentUser =
                        username &&
                        user.username.toLowerCase() === username.toLowerCase();
                      const isFollowingThisUser = myFollowing.has(
                        user.username.toLowerCase()
                      );
                      const isPending = followPending.has(
                        user.username.toLowerCase()
                      );

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
                            primary={
                              <Typography
                                component="span"
                                noWrap
                                sx={{ display: "block" }}
                              >
                                {primary}
                              </Typography>
                            }
                            secondary={
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ display: "block" }}
                              >
                                @{user.username}
                              </Typography>
                            }
                            primaryTypographyProps={{ fontWeight: 600 }}
                          />
                          {!isCurrentUser && username && (
                            <Button
                              variant={
                                isFollowingThisUser ? "outlined" : "contained"
                              }
                              size="medium"
                              onClick={(e) =>
                                handleFollowToggle(user.username, e)
                              }
                              disabled={isPending}
                              sx={{ minWidth: 90 }}
                            >
                              {isPending
                                ? "..."
                                : isFollowingThisUser
                                ? "Unfollow"
                                : "Follow"}
                            </Button>
                          )}
                        </ListItemButton>
                      );
                    })}
                  </List>
                  {hasMore && (
                    <Box
                      sx={{ display: "flex", justifyContent: "center", py: 2 }}
                    >
                      <Button
                        variant="outlined"
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? "Loading..." : "Load More"}
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
