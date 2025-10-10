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
  Snackbar,
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
import Grid from "@mui/material/Grid";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { setUserId } from "./analytics";
import { wikiGenres } from "./wiki";
import placeholderCover from "./assets/missingImg.jpg";
import FindRecordSidebar, {
  type AlbumListItem,
} from "./components/FindRecordSidebar";
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

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";
const MIN_USER_QUERY_LENGTH = 2;
const SEARCH_TAB_VALUES = ["records", "users"] as const;
type SearchTab = (typeof SEARCH_TAB_VALUES)[number];
const RECORD_PANEL_HEIGHT = 280; // Height (px) for stacked layout below md breakpoints

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
      const [info, tags] = await Promise.all([
        loadUserInfo(),
        (async () => {
          try {
            const res = await fetch(apiUrl("/api/tags"), {
              credentials: "include",
            });
            if (!res.ok) {
              return null;
            }
            return (await res.json()) as string[];
          } catch {
            return null;
          }
        })(),
      ]);

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
      if (Array.isArray(tags)) {
        setAvailableTags(tags);
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
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>();
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [wikiTags, setWikiTags] = useState<string[]>([]);
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rating, setRating] = useState<number>(0);
  const [releaseYear, setReleaseYear] = useState<number>(
    new Date().getFullYear()
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  const handleRecordsSearchSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setRecordResults([]);
      setRecordError(null);
      setSelectedAlbumId(undefined);
      setWikiTags([]);
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

  useEffect(() => {
    if (selectedAlbumId) {
      setRating(0);
      setReleaseYear(new Date().getFullYear());
      setSelectedTags([]);
      setAddError(null);
    }
  }, [selectedAlbumId]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleAddNewTag = useCallback((tag: string) => {
    setAvailableTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  const rows = useMemo(() => {
    return recordResults.map((a, idx) => {
      const nonEmpty = (a.image || []).filter((im) => im["#text"]);
      const largePref =
        nonEmpty.find((im) => im.size === "extralarge") ||
        nonEmpty.find((im) => im.size === "mega") ||
        nonEmpty[nonEmpty.length - 1] ||
        nonEmpty[0];
      const cover = largePref?.["#text"] || "";
      return {
        id: `${a.name}-${a.artist}-${idx}`,
        cover,
        record: a.name,
        artist: a.artist,
      } as AlbumListItem & { record: string };
    });
  }, [recordResults]);

  const submitRecord = useCallback(
    async (tableName: string, redirectPath: string, successMessage: string) => {
      if (!selectedAlbumId) return;
      const selectedRow = rows.find((r) => r.id === selectedAlbumId);
      if (!selectedRow) return;
      setAdding(true);
      setAddError(null);
      try {
        const payload = {
          id: -1,
          cover: selectedRow.cover,
          record: selectedRow.record,
          artist: selectedRow.artist,
          rating,
          tags: selectedTags,
          release: releaseYear,
          added: new Date().toISOString().slice(0, 10),
          tableName,
        };
        const res = await fetch(apiUrl("/api/records/create"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await res.json().catch(() => null);
          navigate(redirectPath, { state: { message: successMessage } });
        } else {
          const problem = await res.json().catch(() => ({}));
          const msg = problem.error || `Failed to add record (${res.status})`;
          setAddError(msg);
          setSnackbar({ open: true, message: msg, severity: "error" });
        }
      } catch (error) {
        console.error(error);
        setAddError("Network error adding record");
        setSnackbar({
          open: true,
          message: "Network error adding record",
          severity: "error",
        });
      } finally {
        setAdding(false);
      }
    },
    [navigate, releaseYear, rows, selectedAlbumId, selectedTags]
  );

  const handleAddRecord = useCallback(
    () =>
      submitRecord(DEFAULT_COLLECTION_NAME, "/mycollection", "Record added"),
    [submitRecord]
  );

  const handleAddWishlistRecord = useCallback(
    () =>
      submitRecord(WISHLIST_COLLECTION_NAME, "/wishlist", "Added to wishlist"),
    [submitRecord]
  );

  const handleRecordsClear = useCallback(
    (updateUrl = true) => {
      setRecordSearchInput("");
      setRecordResults([]);
      setRecordError(null);
      setRecordLoading(false);
      setSelectedAlbumId(undefined);
      setWikiTags([]);
      setWikiLoading(false);
      setAddError(null);
      if (updateUrl) {
        updateSearchParams("records", "");
      }
    },
    [updateSearchParams]
  );

  const recordColumns: GridColDef[] = [
    {
      field: "cover",
      headerName: "",
      width: 110,
      sortable: false,
      renderCell: (params) => {
        const src = params.value || placeholderCover;
        const title = params.row.record ?? "cover";
        return (
          <img
            src={src}
            alt={title}
            style={{
              maxWidth: 100,
              maxHeight: 100,
              objectFit: "cover",
              borderRadius: 4,
            }}
          />
        );
      },
    },
    {
      field: "record",
      headerName: "Album",
      flex: 1.5,
      minWidth: 100,
      cellClassName: "wrapCell",
      renderCell: (params) => (
        <div className="wrapText" style={{ width: "100%" }}>
          {params.value}
        </div>
      ),
    },
    {
      field: "artist",
      headerName: "Artist",
      flex: 1,
      minWidth: 100,
      cellClassName: "wrapCell",
      renderCell: (params) => (
        <div className="wrapText" style={{ width: "100%" }}>
          {params.value}
        </div>
      ),
    },
  ];

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
          }}
        >
          <Box maxWidth={1200} mx="auto" sx={{ mt: 1, height: { md: "100%" } }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                minHeight: { xs: 420, md: 560 },
                height: { md: "100%" },
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
                    p: { xs: 1.5, md: 2 },
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {recordError && (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      {recordError}
                    </Alert>
                  )}
                  <Grid
                    container
                    spacing={2}
                    sx={{
                      flex: 1,
                      minHeight: 0,
                      overflow: "hidden",
                      height: { xs: RECORD_PANEL_HEIGHT, md: "100%" },
                    }}
                  >
                    <Grid
                      size={{ xs: 12, md: 8 }}
                      borderRadius={2}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 0,
                        height: { xs: RECORD_PANEL_HEIGHT, md: "100%" },
                        maxHeight: {
                          xs: RECORD_PANEL_HEIGHT,
                          md: "100%",
                        },
                        overflow: "hidden",
                        pb: { xs: 2, md: 0 },
                      }}
                    >
                      <Box
                        sx={{
                          flex: 1,
                          minHeight: 0,
                          position: "relative",
                          height: "100%",
                          maxHeight: "100%",
                          overflow: "hidden",
                        }}
                      >
                        <DataGrid
                          rows={rows}
                          columns={recordColumns}
                          density="comfortable"
                          hideFooter
                          rowHeight={90}
                          onRowClick={async (params) => {
                            const id = params.id as string;
                            setWikiTags([]);
                            setSelectedAlbumId(id);
                            setWikiLoading(true);
                            try {
                              const selectedRow = rows.find((r) => r.id === id);
                              if (!selectedRow) return;
                              const genres = await wikiGenres(
                                selectedRow.record,
                                selectedRow.artist,
                                true
                              );
                              if (genres && genres.length > 0) {
                                const first = genres[0];
                                const yearNum =
                                  first && /^\d{4}$/.test(first)
                                    ? Number(first)
                                    : null;
                                if (
                                  yearNum &&
                                  yearNum >= 1800 &&
                                  yearNum <= 2100
                                ) {
                                  setReleaseYear(yearNum);
                                  setWikiTags(
                                    genres.slice(1).filter((tag) => !!tag)
                                  );
                                } else {
                                  setWikiTags(genres.filter((tag) => !!tag));
                                }
                              } else {
                                setWikiTags([]);
                              }
                            } catch (error) {
                              console.error(error);
                              setWikiTags([]);
                            } finally {
                              setWikiLoading(false);
                            }
                          }}
                          getRowClassName={(params) =>
                            params.id === selectedAlbumId ? "selected-row" : ""
                          }
                          sx={{
                            border: "none",
                            height: "100%",
                            "& .MuiDataGrid-cell": {
                              display: "flex",
                              alignItems: "center",
                              py: 1,
                              minWidth: 0,
                            },
                            "& .wrapCell .MuiDataGrid-cellContent": {
                              whiteSpace: "normal",
                              overflow: "hidden",
                              textOverflow: "clip",
                              overflowWrap: "anywhere",
                              lineHeight: 1.2,
                              display: "block",
                            },
                            "& .wrapCell": {
                              whiteSpace: "normal !important",
                            },
                            "& .wrapCell .wrapText": {
                              whiteSpace: "normal",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                              lineHeight: 1.2,
                              alignSelf: "center",
                            },
                            "& .selected-row": {
                              bgcolor: (theme) =>
                                `${theme.palette.action.selected} !important`,
                            },
                          }}
                        />
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
                    </Grid>
                    <Grid
                      size={{ xs: 12, md: 4 }}
                      sx={{
                        height: { xs: 600, md: "100%" },
                        minHeight: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        pb: { xs: 2, md: 0 },
                      }}
                    >
                      <Box sx={{ flex: 1, minHeight: 0 }}>
                        <FindRecordSidebar
                          availableTags={availableTags}
                          selectedTags={selectedTags}
                          onToggleTag={handleToggleTag}
                          onAddNewTag={handleAddNewTag}
                          wikiTags={wikiTags}
                          wikiLoading={wikiLoading}
                          rating={rating}
                          onRatingChange={setRating}
                          releaseYear={releaseYear}
                          onReleaseYearChange={setReleaseYear}
                          canAdd={!!selectedAlbumId && !adding}
                          onAddRecord={handleAddRecord}
                          onWishlistRecord={handleAddWishlistRecord}
                        />
                      </Box>
                      {addError && <Alert severity="error">{addError}</Alert>}
                    </Grid>
                  </Grid>
                </Box>
              ) : (
                <Box
                  sx={{
                    p: { xs: 1.5, md: 2 },
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    flex: 1,
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {userStatus === "idle" && (
                    <Typography color="text.secondary" mt={1}>
                      Use the search bar above to search for a username or
                      display name.
                    </Typography>
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
                    <>
                      <Typography variant="h6" fontWeight={600}>
                        Search Results
                      </Typography>
                      <Typography color="text.secondary">
                        No users matched “{userSubmittedQuery}”.
                      </Typography>
                    </>
                  )}
                  {userStatus === "ready" && userResults.length > 0 && (
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      <Typography variant="h6" fontWeight={600} mb={1}>
                        Search Results
                      </Typography>
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
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={(_, reason) => {
            if (reason !== "clickaway")
              setSnackbar((prev) => ({ ...prev, open: false }));
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={snackbar.severity}
            variant="filled"
            onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
