import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  type SyntheticEvent,
} from "react";
import apiUrl from "./api";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Divider,
  Typography,
  Paper,
  List,
  ListItemButton,
  ListItemAvatar,
  Avatar,
  ListItemText,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { setUserId } from "./analytics";
import placeholderCover from "./assets/missingImg.jpg";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCommunityCaches, searchCommunityUsers } from "./communityUsers";
import type { CommunityUserSummary } from "./types";

interface AlbumResult {
  name: string;
  artist: string;
  url: string;
  listeners?: string;
  image?: { ["#text"]: string; size: string }[];
}

interface RecordListItem {
  id: string;
  record: string;
  artist: string;
  cover: string;
}

const MIN_USER_QUERY_LENGTH = 2;
const SEARCH_TAB_VALUES = ["records", "users"] as const;
type SearchTab = (typeof SEARCH_TAB_VALUES)[number];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const paramQuery = searchParams.get("q") ?? "";
  const initialTab: SearchTab = paramTab === "users" ? "users" : "records";

  const navigate = useNavigate();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);

  useEffect(() => {
    const nextTab: SearchTab = paramTab === "users" ? "users" : "records";
    setActiveTab(nextTab);
  }, [paramTab]);

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

  const updateSearchParams = useCallback(
    (tab: SearchTab, query: string) => {
      const next = new URLSearchParams();
      next.set("tab", tab);
      if (query) {
        next.set("q", query);
      }
      setSearchParams(next, { replace: true });
    },
    [setSearchParams]
  );

  const handleLogout = useCallback(async () => {
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
      /* ignore analytics cleanup */
    }
    navigate("/login");
  }, [navigate]);

  const [recordResults, setRecordResults] = useState<AlbumResult[]>([]);
  const [recordSearchInput, setRecordSearchInput] = useState(paramQuery);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const handleRecordsSearchSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setRecordResults([]);
      setRecordError(null);
      return;
    }
    setRecordLoading(true);
    setRecordError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/lastfm/album.search?q=${encodeURIComponent(trimmed)}`),
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const albums = data?.results?.albummatches?.album || [];
        setRecordResults(albums);
      } else {
        const problem = await res.json().catch(() => ({}));
        setRecordError(problem.error || `Search failed (${res.status})`);
      }
    } catch (error) {
      console.error(error);
      setRecordError("Network error searching albums");
    } finally {
      setRecordLoading(false);
    }
  }, []);

  const handleRecordsClear = useCallback(
    (updateUrl = true) => {
      setRecordSearchInput("");
      setRecordResults([]);
      setRecordError(null);
      setRecordLoading(false);
      if (updateUrl) {
        updateSearchParams("records", "");
      }
    },
    [updateSearchParams]
  );

  const recordItems = useMemo<RecordListItem[]>(() => {
    return recordResults.map((album, index) => {
      const images = (album.image || []).filter((img) => img["#text"]);
      const preferredImage =
        images.find((img) => img.size === "extralarge") ||
        images.find((img) => img.size === "mega") ||
        images[images.length - 1] ||
        images[0];
      return {
        id: `${album.name}-${album.artist}-${index}`,
        record: album.name,
        artist: album.artist,
        cover: preferredImage?.["#text"] || "",
      };
    });
  }, [recordResults]);

  const handleRecordSelect = useCallback(
    (item: RecordListItem) => {
      // Pass the submitted query (from URL param) so the record page can
      // restore it when navigating back to Search.
      const submitted = (searchParams.get("q") ?? "").trim();
      navigate("/record", { state: { album: item, query: submitted } });
    },
    [navigate, searchParams]
  );

  const [userResults, setUserResults] = useState<CommunityUserSummary[]>([]);
  const [userStatus, setUserStatus] = useState<
    "idle" | "loading" | "error" | "ready"
  >("idle");
  const [userError, setUserError] = useState<string | null>(null);
  const [userSearchInput, setUserSearchInput] = useState(paramQuery);
  const [userSubmittedQuery, setUserSubmittedQuery] = useState(paramQuery);

  const runUserSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    setUserSubmittedQuery(trimmed);
    if (!trimmed) {
      setUserResults([]);
      setUserStatus("idle");
      setUserError(null);
      return;
    }
    if (trimmed.length < MIN_USER_QUERY_LENGTH) {
      setUserResults([]);
      setUserStatus("error");
      setUserError(
        `Enter at least ${MIN_USER_QUERY_LENGTH} characters to search.`
      );
      return;
    }
    setUserStatus("loading");
    setUserError(null);
    try {
      const data = await searchCommunityUsers(trimmed);
      setUserResults(data);
      setUserStatus("ready");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Failed to search users";
      setUserError(message);
      setUserStatus("error");
    }
  }, []);

  const handleUserClick = useCallback(
    (targetUsername: string) => {
      navigate(`/community/${encodeURIComponent(targetUsername)}`);
    },
    [navigate]
  );

  const handleUsersClear = useCallback(
    (updateUrl = true) => {
      setUserSearchInput("");
      setUserResults([]);
      setUserStatus("idle");
      setUserError(null);
      setUserSubmittedQuery("");
      if (updateUrl) {
        updateSearchParams("users", "");
      }
    },
    [updateSearchParams]
  );

  const handleTabChange = useCallback(
    (_event: SyntheticEvent, value: SearchTab) => {
      const currentInput =
        activeTab === "records" ? recordSearchInput : userSearchInput;
      if (value === "records") {
        setRecordSearchInput(currentInput);
      } else {
        setUserSearchInput(currentInput);
      }
      setActiveTab(value);
      updateSearchParams(value, currentInput.trim());
    },
    [activeTab, recordSearchInput, updateSearchParams, userSearchInput]
  );

  const handleTopBarSearchChange = useCallback(
    (value: string) => {
      if (activeTab === "records") {
        setRecordSearchInput(value);
      } else {
        setUserSearchInput(value);
      }
    },
    [activeTab]
  );

  const handleTopBarSearchSubmit = useCallback(
    (value: string) => {
      if (activeTab === "records") {
        setRecordSearchInput(value);
        const trimmed = value.trim();
        if (!trimmed) {
          handleRecordsClear();
          return;
        }
        updateSearchParams("records", trimmed);
      } else {
        setUserSearchInput(value);
        const trimmed = value.trim();
        if (!trimmed) {
          handleUsersClear();
          return;
        }
        updateSearchParams("users", trimmed);
      }
    },
    [activeTab, handleRecordsClear, handleUsersClear, updateSearchParams]
  );

  useEffect(() => {
    setRecordSearchInput(paramQuery);
    setUserSearchInput(paramQuery);
    const trimmed = paramQuery.trim();
    if (!trimmed) {
      handleRecordsClear(false);
      handleUsersClear(false);
      return;
    }
    if (activeTab === "records") {
      void handleRecordsSearchSubmit(trimmed);
    } else {
      void runUserSearch(trimmed);
    }
  }, [
    activeTab,
    handleRecordsClear,
    handleRecordsSearchSubmit,
    handleUsersClear,
    paramQuery,
    runUserSearch,
  ]);

  // Use the submitted query from the URL (not the live input) to decide
  // whether to show the "No records matched" empty-state message.
  const submittedRecordQuery = paramQuery.trim();

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar
          title="Search"
          onLogout={handleLogout}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          searchPlaceholder={
            activeTab === "records"
              ? "Search albums by title"
              : "Search for users"
          }
          searchValue={
            activeTab === "records" ? recordSearchInput : userSearchInput
          }
          onSearchChange={handleTopBarSearchChange}
          onSearchSubmit={handleTopBarSearchSubmit}
        />
        <Box
          sx={{
            flex: 1,
            overflowY: { xs: "auto", md: "hidden" },
            pb: 3,
            px: 1,
            mt: 1,
          }}
        >
          <Box maxWidth={800} mx="auto" sx={{ height: { md: "100%" } }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <Tabs
                value={activeTab}
                onChange={handleTabChange}
                variant="fullWidth"
                textColor="primary"
                indicatorColor="primary"
              >
                <Tab label="Records" value="records" />
                <Tab label="Users" value="users" />
              </Tabs>
              <Divider />
              {activeTab === "records" ? (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    px: { xs: 1.5, md: 2 },
                    py: 1,
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {recordError && (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      {recordError}
                    </Alert>
                  )}
                  <Box
                    sx={{
                      flex: 1,
                      // Ensure there's space for the absolute spinner when loading
                      // and there are no items yet (otherwise height could collapse to 0)
                      minHeight:
                        recordLoading && recordItems.length === 0 ? 240 : 0,
                      position: "relative",
                    }}
                  >
                    {!recordLoading && recordItems.length === 0 ? (
                      <Box
                        sx={{
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          px: 2,
                          py: 4,
                        }}
                      >
                        <Typography variant="h6" gutterBottom>
                          {submittedRecordQuery
                            ? `No records matched “${submittedRecordQuery}”.`
                            : "Search for a record to get started."}
                        </Typography>
                        {!submittedRecordQuery && (
                          <Typography color="text.secondary">
                            Use the search box above to search for records.
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <List
                        disablePadding
                        sx={{
                          height: "100%",
                          overflowY: "auto",
                          pr: 1,
                        }}
                      >
                        {recordItems.map((item) => (
                          <ListItemButton
                            key={item.id}
                            onClick={() => handleRecordSelect(item)}
                            divider
                            sx={{ alignItems: "flex-start", gap: 2 }}
                          >
                            <ListItemAvatar>
                              <Avatar
                                variant="square"
                                src={item.cover || placeholderCover}
                                alt={item.record}
                                sx={{
                                  width: { xs: 90, md: 120 },
                                  height: { xs: 90, md: 120 },
                                  borderRadius: 1,
                                  bgcolor: "grey.900",
                                }}
                              />
                            </ListItemAvatar>
                            <ListItemText
                              sx={{ alignSelf: "center" }}
                              primary={
                                <Typography
                                  variant="subtitle1"
                                  fontWeight={700}
                                >
                                  {item.record}
                                </Typography>
                              }
                              secondary={
                                <Typography color="text.secondary">
                                  {item.artist}
                                </Typography>
                              }
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                    {recordLoading && (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          bgcolor: "rgba(0,0,0,0.35)",
                        }}
                      >
                        <CircularProgress />
                      </Box>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    px: { xs: 1.5, md: 2 },
                    py: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {userStatus === "idle" && (
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        px: 2,
                        py: 4,
                      }}
                    >
                      <Typography variant="h6" gutterBottom>
                        Search for a user to get started.
                      </Typography>
                      <Typography color="text.secondary">
                        Use the search box above to search for users.
                      </Typography>
                    </Box>
                  )}
                  {userStatus === "loading" && (
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
                  {userStatus === "error" && userError && (
                    <Alert severity="error">{userError}</Alert>
                  )}
                  {userStatus === "ready" && userResults.length === 0 && (
                    <Box
                      sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        textAlign: "center",
                        px: 2,
                        py: 4,
                      }}
                    >
                      <Typography variant="h6" gutterBottom>
                        No users matched “{userSubmittedQuery}”.
                      </Typography>
                    </Box>
                  )}
                  {userStatus === "ready" && userResults.length > 0 && (
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      <List disablePadding>
                        {userResults.map((user) => {
                          const primary =
                            user.displayName || `@${user.username}`;
                          return (
                            <ListItemButton
                              key={user.username}
                              onClick={() => handleUserClick(user.username)}
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
                                primary={
                                  <span style={{ fontWeight: 700 }}>
                                    {primary}
                                  </span>
                                }
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
                              />
                            </ListItemButton>
                          );
                        })}
                      </List>
                    </Box>
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
