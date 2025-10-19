import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
} from "@mui/material";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { setUserId } from "./analytics";
import { clearProfileHighlightsCache } from "./profileHighlights";
import { clearCollectionRecordsCache } from "./collectionRecords";
import type { CommunityFeedEntry } from "./types";
import { clearCommunityCaches, loadActivityFeed } from "./communityUsers";
import apiUrl from "./api";
import placeholderCover from "./assets/missingImg.jpg";
import { Grid } from "@mui/system";
import { formatLocalDate } from "./dateUtils";

type ActivityView = "friends" | "you";
type FeedStatus = "idle" | "loading" | "error" | "ready";

interface ActivityFeedState {
  status: FeedStatus;
  entries: CommunityFeedEntry[];
  error: string | null;
}

export default function Activity() {
  const navigate = useNavigate();
  const location = useLocation();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const feedDateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("view");
  const activeView: ActivityView = rawView === "you" ? "you" : "friends";

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

    loadActivityFeed("friends")
      .then((data) => {
        if (cancelled) return;
        setFriendsFeed({ status: "ready", entries: data, error: null });
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

    loadActivityFeed("you")
      .then((data) => {
        if (cancelled) return;
        setYouFeed({ status: "ready", entries: data, error: null });
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
    (_event: SyntheticEvent, value: ActivityView) => {
      updateSearchParams({ view: value === "friends" ? null : value });
      if (value === "you") {
        setYouFeed((prev) =>
          prev.status === "idle"
            ? { ...prev, status: "loading", error: null }
            : prev
        );
      }
    },
    [updateSearchParams, setYouFeed]
  );

  const handleLogout = useCallback(async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearCollectionRecordsCache();
    clearProfileHighlightsCache();
    clearCommunityCaches();
    clearUserInfoCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore */
    }
    navigate("/login");
  }, [navigate]);

  const handleOwnerClick = useCallback(
    (event: MouseEvent, ownerUsername: string) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(`/community/${encodeURIComponent(ownerUsername)}`);
    },
    [navigate]
  );

  const handleRecordNavigate = useCallback(
    (entry: CommunityFeedEntry) => {
      if (!entry.record || entry.record.id <= 0) {
        return;
      }

      const ownerUsername = entry.owner.username;
      const normalizedOwner = ownerUsername.toLowerCase();
      const normalizedViewer = (username ?? "").toLowerCase();
      const isOwnRecord =
        normalizedOwner.length > 0 && normalizedOwner === normalizedViewer;

      const originPath = `${location.pathname}${location.search}${location.hash}`;
      const ownerDisplay =
        (entry.owner.displayName ?? "").trim() || ownerUsername;
      const rawCollectionName = (
        entry.record.collectionName ||
        entry.record.tableName ||
        ""
      ).trim();
      const collectionLabel = (() => {
        if (!rawCollectionName) return "Collection";
        const normalized = rawCollectionName.toLowerCase();
        if (normalized === "my collection") return "Collection";
        if (normalized === "wishlist") return "Wishlist";
        if (normalized === "listened") return "Listened";
        return rawCollectionName;
      })();

      const fromLabel = `${ownerDisplay}'s ${collectionLabel}`;

      const targetPath = isOwnRecord
        ? `/record/${entry.record.id}`
        : `/community/${encodeURIComponent(ownerUsername)}/record/${
            entry.record.id
          }`;

      navigate(targetPath, {
        state: {
          from: {
            path: originPath,
            label: fromLabel,
          },
          record: entry.record,
          owner: isOwnRecord
            ? null
            : {
                username: ownerUsername,
                displayName: entry.owner.displayName ?? null,
                profilePicUrl: entry.owner.profilePicUrl ?? null,
              },
        },
      });
    },
    [location.hash, location.pathname, location.search, navigate, username]
  );

  const isFriendsView = activeView === "friends";
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

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          p: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title="Activity"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, px: 1 }}>
          <Box maxWidth={800} mx="auto" sx={{ mt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
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
              <Box sx={{ p: { xs: 1.5, sm: 3 }, minHeight: 320 }}>
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
                  <Typography color="text.secondary">
                    {emptyMessage}
                  </Typography>
                )}
                {currentStatus === "ready" && currentEntries.length > 0 && (
                  <List disablePadding>
                    {currentEntries.map((entry: CommunityFeedEntry) => {
                      const rawDisplayName =
                        typeof entry.owner.displayName === "string"
                          ? entry.owner.displayName.trim()
                          : "";
                      const ownerDisplay =
                        rawDisplayName || entry.owner.username;
                      const avatarSource = rawDisplayName || entry.owner.username;
                      const avatarInitial = avatarSource.charAt(0).toUpperCase();
                      const addedDate = entry.record.added
                        ? formatLocalDate(entry.record.added, feedDateFormatter) ??
                          entry.record.added
                        : null;
                      const tagsLabel =
                        entry.record.tags && entry.record.tags.length > 0
                          ? entry.record.tags.join(", ")
                          : "";
                      const coverSrc = entry.record.cover
                        ? entry.record.cover
                        : placeholderCover;
                      const tableName = (() => {
                        const raw =
                          typeof entry.record.tableName === "string"
                            ? entry.record.tableName.trim()
                            : "";
                        if (!raw) {
                          return isFriendsView ? "their collection" : "your collection";
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
                          key={`${entry.owner.username}-${entry.record.id}`}
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
                            cursor: canNavigateToRecord ? "pointer" : "default",
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
                                  handleOwnerClick(event, entry.owner.username)
                                }
                                sx={{
                                  alignSelf: "flex-start",
                                  borderRadius: 1,
                                  px: 0.5,
                                  py: 0.5,
                                  textAlign: "left",
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
                                    src={entry.owner.profilePicUrl ?? undefined}
                                    alt={ownerDisplay}
                                    sx={{
                                      width: 40,
                                      height: 40,
                                      bgcolor: "grey.700",
                                      flex: "0 0 auto",
                                    }}
                                  >
                                    {!entry.owner.profilePicUrl && avatarInitial}
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
                            <Box
                              component="img"
                              src={coverSrc}
                              alt={`${entry.record.record} cover`}
                              sx={{
                                maxWidth: { xs: 100, sm: 150, md: 175 },
                                maxHeight: { xs: 100, sm: 150, md: 175 },
                                objectFit: "cover",
                                borderRadius: 1,
                                flexShrink: 0,
                                boxShadow: 1,
                                bgcolor: "grey.900",
                              }}
                            />
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
                                  <Typography variant="body1">
                                    {entry.record.review}
                                  </Typography>
                                </>
                              )}
                            </Box>
                          </Grid>
                        </ListItemButton>
                      );
                    })}
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
