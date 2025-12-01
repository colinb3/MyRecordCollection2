import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Paper,
  Avatar,
  List,
  ListItemButton,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  Button,
  ButtonBase,
  Stack,
  ListItem,
  Tooltip,
  IconButton,
} from "@mui/material";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { setUserId } from "./analytics";
import type {
  CommunityFeedEntry,
  CommunityFeedListPreviewRecord,
} from "./types";
import { loadActivityFeed } from "./communityUsers";
import apiUrl from "./api";
import { Grid } from "@mui/system";
import { formatRelativeTime } from "./dateUtils";
import { performLogout } from "./logout";

type CommunityView = "friends" | "you";
type FeedStatus = "idle" | "loading" | "error" | "ready";

interface ActivityFeedState {
  status: FeedStatus;
  entries: CommunityFeedEntry[];
  error: string | null;
}

export default function Community() {
  const navigate = useNavigate();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const activeView: CommunityView = rawView === "you" ? "you" : "friends";

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const [friendsFeed, setFriendsFeed] = useState<ActivityFeedState>({
    status: "loading",
    entries: [],
    error: null,
  });
  const [youFeed, setYouFeed] = useState<ActivityFeedState>({
    status: activeView === "you" ? "loading" : "idle",
    entries: [],
    error: null,
  });
  const [hasMoreFriends, setHasMoreFriends] = useState(true);
  const [hasMoreYou, setHasMoreYou] = useState(true);
  const [loadingMoreFriends, setLoadingMoreFriends] = useState(false);
  const [loadingMoreYou, setLoadingMoreYou] = useState(false);

  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (!info) {
        if (location.pathname !== "/login") {
          const next = encodeURIComponent(
            `${location.pathname}${location.search || ""}${location.hash || ""}`
          );
          navigate(`/login?next=${next}`);
        }
        return;
      }
      setUsername(info.username);
      setDisplayName(info.displayName ?? "");
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

  useEffect(() => {
    if (friendsFeed.status !== "loading") {
      return;
    }

    let cancelled = false;

    loadActivityFeed("friends", 10, 0)
      .then((data) => {
        if (cancelled) return;
        setFriendsFeed({ status: "ready", entries: data, error: null });
        setHasMoreFriends(data.length === 10);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load activity";
        setFriendsFeed({ status: "error", entries: [], error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [friendsFeed.status]);

  useEffect(() => {
    if (youFeed.status !== "loading") {
      return;
    }

    let cancelled = false;

    loadActivityFeed("you", 10, 0)
      .then((data) => {
        if (cancelled) return;
        setYouFeed({ status: "ready", entries: data, error: null });
        setHasMoreYou(data.length === 10);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load activity";
        setYouFeed({ status: "error", entries: [], error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [youFeed.status]);

  useEffect(() => {
    if (activeView === "you" && youFeed.status === "idle") {
      setYouFeed((prev) => ({ ...prev, status: "loading", error: null }));
    }
  }, [activeView, youFeed.status, setYouFeed]);

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, value: CommunityView) => {
      updateSearchParams({ view: value === "friends" ? null : value });
      if (value === "you") {
        setYouFeed((prev) =>
          prev.status === "idle"
            ? { ...prev, status: "loading", error: null }
            : prev
        );
      }
      try {
        requestAnimationFrame(() => {
          try {
            if (listRef && listRef.current) {
              // Use smooth scrolling so the transition feels natural.
              try {
                listRef.current.scrollTo({ top: 0, behavior: "smooth" });
              } catch {
                // Fallback if scrollTo with options isn't supported.
                listRef.current.scrollTop = 0;
              }
            }
          } catch {
            /* ignore DOM errors */
          }
        });
      } catch {
        /* ignore if requestAnimationFrame not available */
      }
    },
    [updateSearchParams, setYouFeed]
  );

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const handleOwnerClick = useCallback(
    (event: MouseEvent, ownerUsername: string) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(`/community/${encodeURIComponent(ownerUsername)}`);
    },
    [navigate]
  );

  const loadMoreFriends = useCallback(() => {
    if (
      loadingMoreFriends ||
      !hasMoreFriends ||
      friendsFeed.status !== "ready"
    ) {
      return;
    }

    setLoadingMoreFriends(true);
    const currentOffset = friendsFeed.entries.length;

    loadActivityFeed("friends", 10, currentOffset)
      .then((data) => {
        setFriendsFeed((prev) => ({
          status: "ready",
          entries: [...prev.entries, ...data],
          error: null,
        }));
        setHasMoreFriends(data.length === 10);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load more activity";
        console.error("Error loading more friends activity:", message);
      })
      .finally(() => {
        setLoadingMoreFriends(false);
      });
  }, [loadingMoreFriends, hasMoreFriends, friendsFeed]);

  const loadMoreYou = useCallback(() => {
    if (loadingMoreYou || !hasMoreYou || youFeed.status !== "ready") {
      return;
    }

    setLoadingMoreYou(true);
    const currentOffset = youFeed.entries.length;

    loadActivityFeed("you", 10, currentOffset)
      .then((data) => {
        setYouFeed((prev) => ({
          status: "ready",
          entries: [...prev.entries, ...data],
          error: null,
        }));
        setHasMoreYou(data.length === 10);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Failed to load more activity";
        console.error("Error loading more your activity:", message);
      })
      .finally(() => {
        setLoadingMoreYou(false);
      });
  }, [loadingMoreYou, hasMoreYou, youFeed]);

  const handleRecordNavigate = useCallback(
    (entry: CommunityFeedEntry) => {
      if (entry.type !== "record" || !entry.record || entry.record.id <= 0) {
        return;
      }

      const ownerUsername = entry.owner.username;
      const normalizedOwner = ownerUsername.toLowerCase();
      const normalizedViewer = (username ?? "").toLowerCase();
      const isOwnRecord =
        normalizedOwner.length > 0 && normalizedOwner === normalizedViewer;

      const targetPath = isOwnRecord
        ? `/record/${entry.record.id}`
        : `/community/${encodeURIComponent(ownerUsername)}/record/${
            entry.record.id
          }`;

      navigate(targetPath);
    },
    [navigate, username, location]
  );

  const handleListNavigate = useCallback(
    (entry: CommunityFeedEntry) => {
      if (entry.type !== "list" || !entry.list || entry.list.id <= 0) {
        return;
      }

      const targetPath = `/lists/${entry.list.id}`;

      navigate(targetPath);
    },
    [navigate, username, location]
  );

  const isFriendsView = activeView === "friends";

  const handleToggleRecordLike = useCallback(
    async (event: MouseEvent, recordId: number, currentlyLiked: boolean) => {
      event.stopPropagation();
      event.preventDefault();

      try {
        const method = currentlyLiked ? "DELETE" : "POST";
        const res = await fetch(
          apiUrl(`/api/records/${recordId}/review/like`),
          {
            method,
            credentials: "include",
          }
        );

        if (!res.ok) {
          console.error("Failed to toggle record like", res.status);
          return;
        }

        // Update the feed state
        const updateFeed = (prev: ActivityFeedState) => {
          const updatedEntries = prev.entries.map((entry) => {
            if (entry.type === "record" && entry.record.id === recordId) {
              const currentLikes = entry.record.reviewLikes ?? 0;
              return {
                ...entry,
                record: {
                  ...entry.record,
                  viewerHasLikedReview: !currentlyLiked,
                  reviewLikes: currentlyLiked
                    ? Math.max(0, currentLikes - 1)
                    : currentLikes + 1,
                },
              };
            }
            // Update liked-review entries - skip since they don't have like data
            // Only update regular record entries
            return entry;
          });
          return { ...prev, entries: updatedEntries };
        };

        if (isFriendsView) {
          setFriendsFeed(updateFeed);
        } else {
          setYouFeed(updateFeed);
        }
      } catch (error) {
        console.error("Error toggling record like", error);
      }
    },
    [isFriendsView]
  );

  const handleToggleListLike = useCallback(
    async (event: MouseEvent, listId: number, currentlyLiked: boolean) => {
      event.stopPropagation();
      event.preventDefault();

      try {
        const method = currentlyLiked ? "DELETE" : "POST";
        const res = await fetch(apiUrl(`/api/lists/${listId}/like`), {
          method,
          credentials: "include",
        });

        if (!res.ok) {
          console.error("Failed to toggle list like", res.status);
          return;
        }

        // Update the feed state
        const updateFeed = (prev: ActivityFeedState) => {
          const updatedEntries = prev.entries.map((entry) => {
            if (entry.type === "list" && entry.list.id === listId) {
              const currentLikes = entry.list.likes ?? 0;
              return {
                ...entry,
                list: {
                  ...entry.list,
                  likedByCurrentUser: !currentlyLiked,
                  likes: currentlyLiked
                    ? Math.max(0, currentLikes - 1)
                    : currentLikes + 1,
                },
              };
            }
            // Update liked-list entries - skip since they don't have like data
            // Only update regular list entries
            return entry;
          });
          return { ...prev, entries: updatedEntries };
        };

        if (isFriendsView) {
          setFriendsFeed(updateFeed);
        } else {
          setYouFeed(updateFeed);
        }
      } catch (error) {
        console.error("Error toggling list like", error);
      }
    },
    [isFriendsView]
  );
  const currentFeed = isFriendsView ? friendsFeed : youFeed;
  const currentStatus = currentFeed.status;
  const currentEntries = currentFeed.entries;
  const currentError = currentFeed.error;
  const emptyMessage = isFriendsView
    ? "Your feed is empty. Follow users to see their latest additions."
    : "You haven't added any records yet. Add to your collections to see them here.";
  const loadingLabel = isFriendsView
    ? "Loading feed…"
    : "Loading your activity…";

  const triggerReload = useCallback(() => {
    if (isFriendsView) {
      setFriendsFeed((prev) => ({ ...prev, status: "loading", error: null }));
    } else {
      setYouFeed((prev) => ({ ...prev, status: "loading", error: null }));
    }
  }, [isFriendsView, setFriendsFeed, setYouFeed]);

  const resolveImageUrl = useCallback((path?: string | null) => {
    if (typeof path !== "string") {
      return undefined;
    }
    const trimmed = path.trim();
    if (!trimmed) {
      return undefined;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    return apiUrl(trimmed);
  }, []);

  const listRef = useRef<HTMLUListElement | null>(null);

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
        <Box
          sx={{
            flex: 1,
            overflowY: "hidden",
            pb: 3,
            px: 1,
            mt: 1,
          }}
        >
          <Box maxWidth={860} mx="auto" sx={{ height: "100%" }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                /* Allow Paper to fill height on larger screens so inner list can
                   be constrained and show its own scrollbar. */
                height: "100%",
              }}
            >
              <Tabs
                value={activeView}
                onChange={handleTabChange}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
              >
                <Tab label="Friends" value="friends" />
                <Tab label="You" value="you" />
              </Tabs>
              <Divider />
              <Box
                sx={{
                  p: { xs: 1.5, sm: 2 },
                  /* Make this box grow to fill available space and allow its
                     children (the List) to use height:100% for an internal
                     scrollbar. minHeight: 0 is required for flex children to
                     correctly constrain overflowing children. */
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {currentStatus === "loading" && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      justifyContent: "center",
                      py: 4,
                    }}
                  >
                    <CircularProgress size={24} />
                    <Typography color="text.secondary">
                      {loadingLabel}
                    </Typography>
                  </Box>
                )}
                {currentStatus === "error" && currentError && (
                  <Box>
                    <Typography color="error" sx={{ mb: 1 }}>
                      {currentError}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={triggerReload}
                    >
                      {isFriendsView ? "Retry" : "Refresh"}
                    </Button>
                  </Box>
                )}
                {currentStatus === "ready" && currentEntries.length === 0 && (
                  <Typography color="text.secondary">{emptyMessage}</Typography>
                )}
                {currentStatus === "ready" && currentEntries.length > 0 && (
                  <List
                    ref={listRef}
                    disablePadding
                    sx={{
                      height: "100%",
                      overflowY: "auto",
                      pr: 1,
                    }}
                  >
                    {currentEntries.map((entry: CommunityFeedEntry) => {
                      // Handle liked-review activity
                      if (entry.type === "liked-review") {
                        const likerDisplayName =
                          typeof entry.liker.displayName === "string"
                            ? entry.liker.displayName.trim()
                            : "";
                        const likerDisplay =
                          likerDisplayName || entry.liker.username;
                        const likerInitial = likerDisplay
                          .charAt(0)
                          .toUpperCase();

                        const ownerDisplayName =
                          typeof entry.reviewOwner.displayName === "string"
                            ? entry.reviewOwner.displayName.trim()
                            : "";
                        const ownerDisplay =
                          ownerDisplayName || entry.reviewOwner.username;

                        const likedDate = entry.likedAt
                          ? formatRelativeTime(entry.likedAt) ?? entry.likedAt
                          : null;

                        return (
                          <ListItemButton
                            key={`${entry.liker.username}-liked-review-${entry.record.id}`}
                            onClick={() =>
                              navigate(
                                `/community/${encodeURIComponent(
                                  entry.reviewOwner.username
                                )}/record/${entry.record.id}`
                              )
                            }
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              px: { xs: 1, sm: 2 },
                              py: 1.5,
                              alignItems: "flex-start",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                width: "100%",
                                gap: 1,
                              }}
                            >
                              <Avatar
                                src={entry.liker.profilePicUrl ?? undefined}
                                alt={likerDisplay}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOwnerClick(event, entry.liker.username);
                                }}
                                sx={{
                                  width: 40,
                                  height: 40,
                                  bgcolor: "grey.700",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  mx: 0.5,
                                  "&:hover": {
                                    opacity: 0.8,
                                  },
                                }}
                              >
                                {!entry.liker.profilePicUrl && likerInitial}
                              </Avatar>
                              <Box
                                sx={{
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <Typography
                                  component="div"
                                  sx={{
                                    wordBreak: "break-word",
                                    overflowWrap: "break-word",
                                    pt: 1,
                                  }}
                                >
                                  <Box
                                    component="span"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOwnerClick(
                                        event,
                                        entry.liker.username
                                      );
                                    }}
                                    sx={{
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      borderRadius: 1,
                                      pl: 4,
                                      pr: 0.5,
                                      py: 1.25,
                                      ml: -4,
                                      mr: -0.5,
                                      "&:hover": {
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    {likerDisplay}
                                  </Box>{" "}
                                  liked{" "}
                                  <Box
                                    component="span"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOwnerClick(
                                        event,
                                        entry.reviewOwner.username
                                      );
                                    }}
                                    sx={{
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      borderRadius: 1,
                                      px: 0.5,
                                      py: 1.25,
                                      mx: -0.5,
                                      "&:hover": {
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    {ownerDisplay}'s
                                  </Box>{" "}
                                  review of{" "}
                                  <b>
                                    {entry.record.name} -{" "}
                                    {entry.record.artist || "Unknown Artist"}
                                  </b>
                                </Typography>
                              </Box>
                              {likedDate && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                    pt: 1.25,
                                  }}
                                >
                                  {likedDate}
                                </Typography>
                              )}
                            </Box>
                          </ListItemButton>
                        );
                      }

                      // Handle liked-list activity
                      if (entry.type === "liked-list") {
                        const likerDisplayName =
                          typeof entry.liker.displayName === "string"
                            ? entry.liker.displayName.trim()
                            : "";
                        const likerDisplay =
                          likerDisplayName || entry.liker.username;
                        const likerInitial = likerDisplay
                          .charAt(0)
                          .toUpperCase();

                        const ownerDisplayName =
                          typeof entry.listOwner.displayName === "string"
                            ? entry.listOwner.displayName.trim()
                            : "";
                        const ownerDisplay =
                          ownerDisplayName || entry.listOwner.username;

                        const likedDate = entry.likedAt
                          ? formatRelativeTime(entry.likedAt) ?? entry.likedAt
                          : null;

                        return (
                          <ListItemButton
                            key={`${entry.liker.username}-liked-list-${entry.list.id}`}
                            onClick={() => navigate(`/lists/${entry.list.id}`)}
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              px: { xs: 1, sm: 2 },
                              py: 1.5,
                              alignItems: "flex-start",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                width: "100%",
                                gap: 1,
                              }}
                            >
                              <Avatar
                                src={entry.liker.profilePicUrl ?? undefined}
                                alt={likerDisplay}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOwnerClick(event, entry.liker.username);
                                }}
                                sx={{
                                  width: 40,
                                  height: 40,
                                  bgcolor: "grey.700",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  mx: 0.5,
                                  "&:hover": {
                                    opacity: 0.8,
                                  },
                                }}
                              >
                                {!entry.liker.profilePicUrl && likerInitial}
                              </Avatar>
                              <Box
                                sx={{
                                  flex: 1,
                                  minWidth: 0,
                                  pt: 1,
                                }}
                              >
                                <Typography
                                  component="div"
                                  sx={{
                                    wordBreak: "break-word",
                                    overflowWrap: "break-word",
                                  }}
                                >
                                  <Box
                                    component="span"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOwnerClick(
                                        event,
                                        entry.liker.username
                                      );
                                    }}
                                    sx={{
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      borderRadius: 1,
                                      pl: 4,
                                      pr: 0.5,
                                      py: 1.25,
                                      ml: -4,
                                      mr: -0.5,
                                      "&:hover": {
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    {likerDisplay}
                                  </Box>{" "}
                                  liked{" "}
                                  <Box
                                    component="span"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOwnerClick(
                                        event,
                                        entry.listOwner.username
                                      );
                                    }}
                                    sx={{
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      borderRadius: 1,
                                      px: 0.5,
                                      py: 1.25,
                                      mx: -0.5,
                                      "&:hover": {
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    {ownerDisplay}'s
                                  </Box>{" "}
                                  list:{" "}
                                  <Box
                                    component="span"
                                    sx={{ fontWeight: 700 }}
                                  >
                                    {entry.list.name}
                                  </Box>
                                </Typography>
                              </Box>
                              {likedDate && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                    pt: 1.25,
                                  }}
                                >
                                  {likedDate}
                                </Typography>
                              )}
                            </Box>
                          </ListItemButton>
                        );
                      }

                      // Handle listening-to activity
                      if (entry.type === "listening-to") {
                        const listenerDisplayName =
                          typeof entry.listener.displayName === "string"
                            ? entry.listener.displayName.trim()
                            : "";
                        const listenerDisplay =
                          listenerDisplayName || entry.listener.username;
                        const listenerInitial = listenerDisplay
                          .charAt(0)
                          .toUpperCase();

                        const listeningDate = entry.listeningAt
                          ? formatRelativeTime(entry.listeningAt) ??
                            entry.listeningAt
                          : null;

                        return (
                          <ListItemButton
                            key={`${entry.listener.username}-listening-to-${entry.record.masterId}`}
                            onClick={() =>
                              navigate(`/master/${entry.record.masterId}`)
                            }
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              px: { xs: 1, sm: 2 },
                              py: 1.5,
                              alignItems: "flex-start",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                width: "100%",
                                gap: 1,
                              }}
                            >
                              <Avatar
                                src={entry.listener.profilePicUrl ?? undefined}
                                alt={listenerDisplay}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOwnerClick(
                                    event,
                                    entry.listener.username
                                  );
                                }}
                                sx={{
                                  width: 40,
                                  height: 40,
                                  bgcolor: "grey.700",
                                  cursor: "pointer",
                                  flexShrink: 0,
                                  mx: 0.5,
                                  "&:hover": {
                                    opacity: 0.8,
                                  },
                                }}
                              >
                                {!entry.listener.profilePicUrl &&
                                  listenerInitial}
                              </Avatar>
                              <Box
                                sx={{
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <Typography
                                  component="div"
                                  sx={{
                                    wordBreak: "break-word",
                                    overflowWrap: "break-word",
                                    pt: 1,
                                  }}
                                >
                                  <Box
                                    component="span"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOwnerClick(
                                        event,
                                        entry.listener.username
                                      );
                                    }}
                                    sx={{
                                      fontWeight: 700,
                                      cursor: "pointer",
                                      borderRadius: 1,
                                      pl: 4,
                                      pr: 0.5,
                                      py: 1.25,
                                      ml: -4,
                                      mr: -0.5,
                                      "&:hover": {
                                        bgcolor: "action.hover",
                                      },
                                    }}
                                  >
                                    {listenerDisplay}
                                  </Box>{" "}
                                  is currently listening to:{" "}
                                  <b>
                                    {entry.record.name} -{" "}
                                    {entry.record.artist || "Unknown Artist"}
                                  </b>
                                </Typography>
                              </Box>
                              {listeningDate && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    flexShrink: 0,
                                    whiteSpace: "nowrap",
                                    pt: 1.25,
                                  }}
                                >
                                  {listeningDate}
                                </Typography>
                              )}
                            </Box>
                          </ListItemButton>
                        );
                      }

                      const rawDisplayName =
                        typeof entry.owner.displayName === "string"
                          ? entry.owner.displayName.trim()
                          : "";
                      const ownerDisplay =
                        rawDisplayName || entry.owner.username;
                      const avatarSource =
                        rawDisplayName || entry.owner.username;
                      const avatarInitial = avatarSource
                        .charAt(0)
                        .toUpperCase();

                      // Check if this is the viewer's own content
                      const normalizedOwner =
                        entry.owner.username.toLowerCase();
                      const normalizedViewer = (username ?? "").toLowerCase();
                      const isOwnContent =
                        normalizedOwner.length > 0 &&
                        normalizedOwner === normalizedViewer;

                      // Type-specific rendering
                      if (entry.type === "record") {
                        const addedDate = entry.record.added
                          ? formatRelativeTime(entry.record.added) ??
                            entry.record.added
                          : null;
                        const tagsLabel =
                          entry.record.tags && entry.record.tags.length > 0
                            ? entry.record.tags.join(", ")
                            : "";
                        const recordCoverSrc = resolveImageUrl(
                          entry.record.cover
                        );
                        const tableName = (() => {
                          const raw =
                            typeof entry.record.tableName === "string"
                              ? entry.record.tableName.trim()
                              : "";
                          if (!raw) {
                            return isFriendsView
                              ? "their collection"
                              : "your collection";
                          }
                          const normalized = raw.toLowerCase();
                          if (normalized === "my collection") {
                            return "collected";
                          }
                          if (normalized === "wishlist") {
                            return "wishlisted";
                          }
                          if (normalized === "listened") {
                            return "listened to";
                          }
                          return raw;
                        })();
                        const canNavigateToRecord =
                          Number.isInteger(entry.record.id) &&
                          Number(entry.record.id) > 0;

                        return (
                          <ListItemButton
                            key={`${entry.owner.username}-record-${entry.record.id}`}
                            onClick={() => {
                              if (canNavigateToRecord) {
                                handleRecordNavigate(entry);
                              }
                            }}
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              alignItems: "stretch",
                              display: "flex",
                              gap: 2,
                              px: { xs: 1, sm: 2 },
                              pt: 1.5,
                              pb: 2,
                              cursor: canNavigateToRecord
                                ? "pointer"
                                : "default",
                              opacity: canNavigateToRecord ? 1 : 0.85,
                            }}
                          >
                            <Grid container spacing={1} width={"100%"}>
                              <Grid
                                size={12}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                }}
                              >
                                <ButtonBase
                                  onClick={(event) =>
                                    handleOwnerClick(
                                      event,
                                      entry.owner.username
                                    )
                                  }
                                  sx={{
                                    alignSelf: "flex-start",
                                    borderRadius: 1,
                                    px: 0.5,
                                    py: 0.5,
                                    textAlign: "left",
                                    transition: "background-color 0.2s ease",
                                    "&:hover": {
                                      bgcolor: "action.hover",
                                    },
                                    minWidth: 0,
                                  }}
                                >
                                  <Stack
                                    direction="row"
                                    spacing={1.5}
                                    alignItems="center"
                                    sx={{ minWidth: 0 }}
                                  >
                                    <Avatar
                                      src={
                                        entry.owner.profilePicUrl ?? undefined
                                      }
                                      alt={ownerDisplay}
                                      sx={{
                                        width: 40,
                                        height: 40,
                                        bgcolor: "grey.700",
                                        flex: "0 0 auto",
                                      }}
                                    >
                                      {!entry.owner.profilePicUrl &&
                                        avatarInitial}
                                    </Avatar>

                                    <Typography
                                      fontWeight={700}
                                      noWrap
                                      sx={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        minWidth: 0,
                                      }}
                                    >
                                      {ownerDisplay}
                                    </Typography>
                                  </Stack>
                                </ButtonBase>
                                <Typography
                                  component="span"
                                  sx={{ ml: -0.5 }}
                                  noWrap
                                  overflow={"visible"}
                                >
                                  {tableName}:
                                </Typography>
                                {addedDate && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    ml={"auto"}
                                    textAlign={"right"}
                                    noWrap
                                    overflow={"visible"}
                                    pl={1}
                                  >
                                    {addedDate}
                                  </Typography>
                                )}
                              </Grid>
                              {recordCoverSrc ? (
                                <Avatar
                                  src={recordCoverSrc}
                                  alt={`${entry.record.record} cover`}
                                  variant="rounded"
                                  sx={{
                                    width: { xs: 100, sm: 125, md: 150 },
                                    height: { xs: 100, sm: 125, md: 150 },
                                    borderRadius: 1,
                                    flexShrink: 0,
                                    boxShadow: 1,
                                  }}
                                />
                              ) : (
                                <Avatar
                                  variant="rounded"
                                  sx={{
                                    width: { xs: 100, sm: 125, md: 150 },
                                    height: { xs: 100, sm: 125, md: 150 },
                                    borderRadius: 1,
                                    bgcolor: "grey.800",
                                    flexShrink: 0,
                                  }}
                                >
                                  <ImageNotSupportedIcon
                                    sx={{
                                      fontSize: { xs: 40, sm: 60, md: 70 },
                                    }}
                                  />
                                </Avatar>
                              )}
                              <Box
                                sx={{
                                  flex: 1,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.6,
                                  pl: 1,
                                  minWidth: 0,
                                }}
                              >
                                <Typography
                                  variant="h6"
                                  component="div"
                                  sx={{
                                    fontWeight: 600,
                                    lineHeight: 1.2,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {entry.record.record}
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  by {entry.record.artist || "Unknown Artist"}
                                </Typography>
                                {entry.record.rating > 0 && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Rating: {entry.record.rating}/10
                                  </Typography>
                                )}
                                {tagsLabel && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                  >
                                    Tags: {tagsLabel}
                                  </Typography>
                                )}
                                {entry.record.review && (
                                  <>
                                    <Divider sx={{ my: 0.5 }} />
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="body1"
                                        sx={{ flex: 1 }}
                                      >
                                        {entry.record.review}
                                      </Typography>
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.1,
                                        }}
                                      >
                                        <IconButton
                                          size="small"
                                          disabled={isOwnContent}
                                          onClick={(e) =>
                                            handleToggleRecordLike(
                                              e,
                                              entry.record.id,
                                              entry.record
                                                .viewerHasLikedReview ?? false
                                            )
                                          }
                                          sx={{
                                            color: entry.record
                                              .viewerHasLikedReview
                                              ? "error.main"
                                              : "text.secondary",
                                          }}
                                        >
                                          {entry.record.viewerHasLikedReview ? (
                                            <FavoriteIcon fontSize="small" />
                                          ) : (
                                            <FavoriteBorderIcon fontSize="small" />
                                          )}
                                        </IconButton>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          sx={{ pt: 0.5 }}
                                        >
                                          {entry.record.reviewLikes ?? 0}
                                        </Typography>
                                      </Box>
                                    </Box>
                                  </>
                                )}
                              </Box>
                            </Grid>
                          </ListItemButton>
                        );
                      }

                      // List entry rendering
                      if (entry.type === "list") {
                        const createdDate = entry.list.created
                          ? formatRelativeTime(entry.list.created) ??
                            entry.list.created
                          : null;
                        const listPictureSrc = resolveImageUrl(
                          entry.list.picture
                        );
                        const canNavigateToList =
                          Number.isInteger(entry.list.id) &&
                          Number(entry.list.id) > 0;
                        const previewRecords: CommunityFeedListPreviewRecord[] =
                          Array.isArray(entry.previewRecords)
                            ? entry.previewRecords
                            : [];

                        return (
                          <ListItemButton
                            key={`${entry.owner.username}-list-${entry.list.id}`}
                            onClick={() => {
                              if (canNavigateToList) {
                                handleListNavigate(entry);
                              }
                            }}
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              alignItems: "stretch",
                              display: "flex",
                              gap: 2,
                              px: { xs: 1, sm: 2 },
                              pt: 1.5,
                              pb: 2,
                              cursor: canNavigateToList ? "pointer" : "default",
                              opacity: canNavigateToList ? 1 : 0.85,
                            }}
                          >
                            <Grid container spacing={1} width={"100%"}>
                              <Grid
                                size={12}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                }}
                              >
                                <ButtonBase
                                  onClick={(event) =>
                                    handleOwnerClick(
                                      event,
                                      entry.owner.username
                                    )
                                  }
                                  sx={{
                                    alignSelf: "flex-start",
                                    borderRadius: 1,
                                    px: 0.5,
                                    py: 0.5,
                                    textAlign: "left",
                                    transition: "background-color 0.2s ease",
                                    "&:hover": {
                                      bgcolor: "action.hover",
                                    },
                                    minWidth: 0,
                                  }}
                                >
                                  <Stack
                                    direction="row"
                                    spacing={1.5}
                                    alignItems="center"
                                    sx={{ minWidth: 0 }}
                                  >
                                    <Avatar
                                      src={
                                        entry.owner.profilePicUrl ?? undefined
                                      }
                                      alt={ownerDisplay}
                                      sx={{
                                        width: 40,
                                        height: 40,
                                        bgcolor: "grey.700",
                                        flex: "0 0 auto",
                                      }}
                                    >
                                      {!entry.owner.profilePicUrl &&
                                        avatarInitial}
                                    </Avatar>

                                    <Typography
                                      fontWeight={700}
                                      noWrap
                                      sx={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        minWidth: 0,
                                      }}
                                    >
                                      {ownerDisplay}
                                    </Typography>
                                  </Stack>
                                </ButtonBase>
                                <Typography
                                  component="span"
                                  sx={{ ml: -0.5 }}
                                  noWrap
                                  overflow={"visible"}
                                >
                                  created a list:
                                </Typography>
                                {createdDate && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    ml={"auto"}
                                    textAlign={"right"}
                                    noWrap
                                    overflow={"visible"}
                                    pl={1}
                                  >
                                    {createdDate}
                                  </Typography>
                                )}
                              </Grid>
                              {listPictureSrc ? (
                                <Avatar
                                  src={listPictureSrc}
                                  alt={`${entry.list.name} cover`}
                                  variant="rounded"
                                  sx={{
                                    width: { xs: 100, sm: 125, md: 150 },
                                    height: { xs: 100, sm: 125, md: 150 },
                                    borderRadius: 1,
                                    flexShrink: 0,
                                    boxShadow: 1,
                                  }}
                                />
                              ) : (
                                <Avatar
                                  variant="rounded"
                                  sx={{
                                    width: { xs: 100, sm: 150, md: 175 },
                                    height: { xs: 100, sm: 150, md: 175 },
                                    borderRadius: 1,
                                    bgcolor: "grey.800",
                                    flexShrink: 0,
                                  }}
                                >
                                  <ImageNotSupportedIcon
                                    sx={{
                                      fontSize: { xs: 40, sm: 60, md: 70 },
                                    }}
                                  />
                                </Avatar>
                              )}
                              <Box
                                sx={{
                                  flex: 1,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 0.6,
                                  pl: 1,
                                  minWidth: 0,
                                }}
                              >
                                <Stack
                                  direction={"row"}
                                  justifyContent={"space-between"}
                                >
                                  <Typography
                                    variant="h6"
                                    component="div"
                                    sx={{
                                      fontWeight: 600,
                                      lineHeight: 1.2,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                    }}
                                  >
                                    {entry.list.name}
                                  </Typography>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.1,
                                    }}
                                  >
                                    <IconButton
                                      size="small"
                                      disabled={isOwnContent}
                                      onClick={(e) =>
                                        handleToggleListLike(
                                          e,
                                          entry.list.id,
                                          entry.list.likedByCurrentUser ?? false
                                        )
                                      }
                                      sx={{
                                        color: entry.list.likedByCurrentUser
                                          ? "error.main"
                                          : "text.secondary",
                                      }}
                                    >
                                      {entry.list.likedByCurrentUser ? (
                                        <FavoriteIcon fontSize="small" />
                                      ) : (
                                        <FavoriteBorderIcon fontSize="small" />
                                      )}
                                    </IconButton>
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ pt: 0.5 }}
                                    >
                                      {entry.list.likes ?? 0}
                                    </Typography>
                                  </Box>
                                </Stack>
                                {entry.list.description && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                    }}
                                  >
                                    {entry.list.description}
                                  </Typography>
                                )}
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {entry.list.recordCount}{" "}
                                  {entry.list.recordCount === 1
                                    ? "record"
                                    : "records"}
                                </Typography>
                                {previewRecords.length > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ mt: 1 }}
                                  >
                                    {previewRecords.map((preview, index) => {
                                      const previewSrc = resolveImageUrl(
                                        preview.cover
                                      );
                                      const previewKey =
                                        preview.id > 0
                                          ? `${entry.list.id}-${preview.id}`
                                          : `${entry.list.id}-preview-${index}`;
                                      return (
                                        <Tooltip
                                          title={
                                            preview.name && preview.artist
                                              ? `${preview.name} - ${preview.artist}`
                                              : preview.name ||
                                                preview.artist ||
                                                "N/A"
                                          }
                                          key={previewKey}
                                        >
                                          <Avatar
                                            key={previewKey}
                                            variant="rounded"
                                            src={previewSrc}
                                            alt={preview.name || "List record"}
                                            sx={{
                                              width: { xs: 45, sm: 55, md: 70 },
                                              height: {
                                                xs: 45,
                                                sm: 55,
                                                md: 70,
                                              },
                                              borderRadius: 1,
                                              bgcolor: previewSrc
                                                ? "transparent"
                                                : "grey.800",
                                              boxShadow: previewSrc ? 1 : 0,
                                            }}
                                          >
                                            {!previewSrc && (
                                              <ImageNotSupportedIcon
                                                sx={{ fontSize: 24 }}
                                              />
                                            )}
                                          </Avatar>
                                        </Tooltip>
                                      );
                                    })}
                                    {entry.list.recordCount > 3 && (
                                      <Tooltip
                                        title={
                                          entry.list.recordCount === 4
                                            ? `${
                                                entry.list.recordCount - 3
                                              } more record`
                                            : `${
                                                entry.list.recordCount - 3
                                              } more records`
                                        }
                                      >
                                        <Avatar
                                          variant="rounded"
                                          sx={{
                                            width: { xs: 45, sm: 55, md: 70 },
                                            height: {
                                              xs: 45,
                                              sm: 55,
                                              md: 70,
                                            },
                                            bgcolor: "grey.800",
                                          }}
                                          src={undefined}
                                        >
                                          <b>+{entry.list.recordCount - 3}</b>
                                        </Avatar>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                )}
                              </Box>
                            </Grid>
                          </ListItemButton>
                        );
                      }

                      return null;
                    })}
                    {/* Load more button */}
                    {currentEntries.length > 0 && (
                      <ListItem
                        sx={{
                          justifyContent: "center",
                          display: "flex",
                          py: 2,
                        }}
                      >
                        <Button
                          variant="outlined"
                          onClick={
                            isFriendsView ? loadMoreFriends : loadMoreYou
                          }
                          disabled={
                            isFriendsView
                              ? !hasMoreFriends || loadingMoreFriends
                              : !hasMoreYou || loadingMoreYou
                          }
                          sx={{ minWidth: 200 }}
                        >
                          {isFriendsView
                            ? loadingMoreFriends
                              ? "Loading..."
                              : hasMoreFriends
                              ? "Load More"
                              : "No More Activity"
                            : loadingMoreYou
                            ? "Loading..."
                            : hasMoreYou
                            ? "Load More"
                            : "No More Activity"}
                        </Button>
                      </ListItem>
                    )}
                  </List>
                )}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
