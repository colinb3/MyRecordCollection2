import {
  useCallback,
  useEffect,
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
import { clearCommunityCaches, loadCommunityFeed } from "./communityUsers";
import apiUrl from "./api";
import placeholderCover from "./assets/missingImg.jpg";
import { Grid } from "@mui/system";

type CommunityView = "feed" | "search";

// Format an ISO date (YYYY-MM-DD) to a human friendly form like "Jan 2, 2025".
function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-").map((p) => Number(p));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    // fallback to the original string if parsing fails
    return isoDate;
  }
  const [year, month, day] = parts;
  // Use UTC to avoid local timezone shifting when creating Date from YYYY-MM-DD
  const d = new Date(Date.UTC(year, month - 1, day));
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${
    monthNames[d.getUTCMonth()]
  } ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export default function Community() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const activeView: CommunityView = rawView === "search" ? "search" : "feed";

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

  const [feedEntries, setFeedEntries] = useState<CommunityFeedEntry[]>([]);
  const [feedStatus, setFeedStatus] = useState<
    "idle" | "loading" | "error" | "ready"
  >("loading");
  const [feedError, setFeedError] = useState<string | null>(null);

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

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, value: CommunityView) => {
      updateSearchParams({ view: value === "feed" ? null : value });
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
      const masterId = Number(entry.record.masterId);
      if (!Number.isInteger(masterId) || masterId <= 0) {
        return;
      }

      const albumPayload = {
        id: `community-${entry.record.id}`,
        record: entry.record.record,
        artist: entry.record.artist,
        cover: entry.record.cover || "",
      };

      const originPath = `${location.pathname}${location.search}${location.hash}`;

      navigate(`/record?q=${masterId}`, {
        state: {
          album: albumPayload,
          masterId,
          fromCollection: {
            path: originPath,
            title: "Community Feed",
          },
        },
      });
    },
    [location.hash, location.pathname, location.search, navigate]
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
                        const addedDate = entry.record.added
                          ? formatDateDisplay(entry.record.added.slice(0, 10))
                          : "";
                        const tagsLabel =
                          entry.record.tags && entry.record.tags.length > 0
                            ? entry.record.tags.join(", ")
                            : "";
                        const coverSrc = entry.record.cover
                          ? entry.record.cover
                          : placeholderCover;
                        const canNavigateToRecord =
                          Number.isInteger(entry.record.masterId) &&
                          Number(entry.record.masterId) > 0;

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
                              cursor: canNavigateToRecord
                                ? "pointer"
                                : "default",
                              opacity: canNavigateToRecord ? 1 : 0.85,
                            }}
                          >
                            <Grid container spacing={2} width={"100%"}>
                              <Grid
                                size={12}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
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
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={(event) =>
                                    handleOwnerClick(
                                      event,
                                      entry.owner.username
                                    )
                                  }
                                  sx={{
                                    textTransform: "none",
                                    fontWeight: 700,
                                    fontSize: "1rem",
                                    pl: 0.75,
                                    minWidth: 0,
                                    color: "text.primary",
                                    ":hover": {
                                      backgroundColor: "action.hover",
                                    },
                                  }}
                                >
                                  {ownerDisplay}
                                </Button>
                                {addedDate && (
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    ml={"auto"}
                                    textAlign={"right"}
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
                                  maxWidth: { xs: 100, sm: 150, md: 200 },
                                  maxHeight: { xs: 100, sm: 150, md: 200 },
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
              ) : (
                <Box
                  sx={{
                    p: { xs: 1.5, sm: 3 },
                    minHeight: 320,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    alignItems: { xs: "stretch", sm: "flex-start" },
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="h5" fontWeight={600}>
                    User Search Moved
                  </Typography>
                  <Typography color="text.secondary">
                    Community user search now lives on the dedicated Search
                    page.
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={() => navigate("/search?tab=users")}
                    sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
                  >
                    Go to Search
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
