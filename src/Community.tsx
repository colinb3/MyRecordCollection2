import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  Button,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import type { CommunityFeedEntry, CommunityUserSummary } from "./types";
import {
  clearCommunityCaches,
  loadCommunityFeed,
  searchCommunityUsers,
} from "./communityUsers";
import apiUrl from "./api";
import placeholderCover from "./assets/missingImg.jpg";

const MIN_QUERY_LENGTH = 2;

const TAB_VALUES = ["feed", "search"] as const;
type CommunityView = (typeof TAB_VALUES)[number];

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
  const rawQuery = searchParams.get("q") ?? "";
  const normalizedQuery = useMemo(() => rawQuery.trim(), [rawQuery]);
  const queryView = searchParams.get("view") ?? "";
  const activeView: CommunityView = useMemo(() => {
    if (queryView && TAB_VALUES.includes(queryView as CommunityView)) {
      return queryView as CommunityView;
    }
    if (normalizedQuery) {
      return "search";
    }
    return "feed";
  }, [queryView, normalizedQuery]);
  const [submittedQuery, setSubmittedQuery] = useState(normalizedQuery);

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

  const [results, setResults] = useState<CommunityUserSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [feedEntries, setFeedEntries] = useState<CommunityFeedEntry[]>([]);
  const [feedStatus, setFeedStatus] = useState<
    "idle" | "loading" | "error" | "ready"
  >("loading");
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    setSubmittedQuery(normalizedQuery);
  }, [normalizedQuery]);

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
    if (feedStatus !== "loading") {
      return;
    }

    let cancelled = false;
    setFeedError(null);

    loadCommunityFeed()
      .then((data) => {
        if (cancelled) return;
        setFeedEntries(data);
        setFeedStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load feed";
        setFeedError(message);
        setFeedStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [feedStatus, loadCommunityFeed]);

  useEffect(() => {
    if (activeView !== "search") {
      setResults([]);
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    const query = submittedQuery;
    if (!query) {
      setResults([]);
      setStatus("idle");
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus("error");
      setError(`Enter at least ${MIN_QUERY_LENGTH} characters to search.`);
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    setError(null);

    searchCommunityUsers(query)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to search users";
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [submittedQuery, activeView]);

  const handleSearchSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        updateSearchParams({ q: null, view: "feed" });
      } else {
        updateSearchParams({ q: trimmed, view: "search" });
      }
    },
    [updateSearchParams]
  );

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, value: CommunityView) => {
      updateSearchParams({ view: value });
    },
    [updateSearchParams]
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

  const handleResultClick = useCallback(
    (targetUsername: string) => {
      navigate(`/community/${encodeURIComponent(targetUsername)}`);
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
          p: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title="Community"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
          onSearchChange={handleSearchSubmit}
          searchMode="submit"
          searchPlaceholder="Search for users"
          initialSearchValue={rawQuery}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, px: 1 }}>
          <Box maxWidth={720} mx="auto" sx={{ mt: 1 }}>
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
                <Tab label="My Feed" value="feed" />
                <Tab label="Find Users" value="search" />
              </Tabs>
              <Divider />
              {activeView === "feed" ? (
                <Box sx={{ p: { xs: 1.5, sm: 3 }, minHeight: 320 }}>
                  {feedStatus === "loading" && (
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
                        Loading feed…
                      </Typography>
                    </Box>
                  )}
                  {feedStatus === "error" && feedError && (
                    <Box>
                      <Typography color="error" sx={{ mb: 1 }}>
                        {feedError}
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setFeedStatus("loading")}
                      >
                        Retry
                      </Button>
                    </Box>
                  )}
                  {feedStatus === "ready" && feedEntries.length === 0 && (
                    <Typography color="text.secondary">
                      Your feed is empty. Follow users to see their latest
                      additions.
                    </Typography>
                  )}
                  {feedStatus === "ready" && feedEntries.length > 0 && (
                    <List disablePadding>
                      {feedEntries.map((entry) => {
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
                        const addedDate = entry.record.dateAdded
                          ? entry.record.dateAdded.slice(0, 10)
                          : "";
                        const tagsLabel =
                          entry.record.tags && entry.record.tags.length > 0
                            ? entry.record.tags.join(", ")
                            : "";
                        const coverSrc = entry.record.cover
                          ? entry.record.cover
                          : placeholderCover;
                        return (
                          <ListItemButton
                            key={`${entry.owner.username}-${entry.record.id}`}
                            onClick={() =>
                              handleResultClick(entry.owner.username)
                            }
                            sx={{
                              borderRadius: 1,
                              mb: 1,
                              alignItems: "stretch",
                              display: "flex",
                              gap: 2,
                              p: { xs: 1, sm: 2 },
                              py: { xs: 2 },
                            }}
                          >
                            <Box
                              component="img"
                              src={coverSrc}
                              alt={`${entry.record.record} cover`}
                              sx={{
                                maxWidth: { xs: 125, sm: 200 },
                                maxHeight: { xs: 125, sm: 200 },
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
                                gap: 1,
                                minWidth: 0,
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  pt: 1,
                                  gap: 0.5,
                                }}
                              >
                                <Avatar
                                  src={entry.owner.profilePicUrl ?? undefined}
                                  alt={ownerDisplay}
                                  sx={{
                                    width: 40,
                                    height: 40,
                                    bgcolor: "grey.700",
                                  }}
                                >
                                  {!entry.owner.profilePicUrl && avatarInitial}
                                </Avatar>
                                <Typography
                                  variant="subtitle1"
                                  fontWeight={700}
                                  pl={0.5}
                                >
                                  {ownerDisplay}
                                </Typography>
                              </Box>
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
                              {addedDate && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Added on {addedDate}
                                </Typography>
                              )}
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
                            </Box>
                          </ListItemButton>
                        );
                      })}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ p: { xs: 3, sm: 4 } }}>
                  {status === "idle" && (
                    <Typography color="text.secondary">
                      Search for a username or display name in the search bar
                      above.
                    </Typography>
                  )}
                  {status === "loading" && (
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
                        Searching community…
                      </Typography>
                    </Box>
                  )}
                  {status === "error" && error && (
                    <Typography color="error">{error}</Typography>
                  )}
                  {status === "ready" && results.length === 0 && (
                    <>
                      <Typography variant="h5" mb={1}>
                        Search Results
                      </Typography>
                      <Typography color="text.secondary">
                        No users matched “{submittedQuery}”.
                      </Typography>
                    </>
                  )}
                  {status === "ready" && results.length > 0 && (
                    <>
                      <Typography variant="h5" mb={1}>
                        Search Results
                      </Typography>
                      <List disablePadding>
                        {results.map((user) => {
                          const primary =
                            user.displayName || `@${user.username}`;
                          return (
                            <ListItemButton
                              key={user.username}
                              onClick={() => handleResultClick(user.username)}
                              sx={{ borderRadius: 1 }}
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
                    </>
                  )}
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
