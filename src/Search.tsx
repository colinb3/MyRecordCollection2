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
  Button,
  Stack,
} from "@mui/material";
import CoverImage from "./components/CoverImage";
import { useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { setUserId } from "./analytics";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { searchCommunityUsers } from "./communityUsers";
import type { CommunityUserSummary } from "./types";
import { formatLocalDate } from "./dateUtils";
import { performLogout } from "./logout";

interface AlbumResult {
  name: string;
  artist: string;
  image: string | null;
}

interface RecordListItem {
  id: string;
  record: string;
  artist: string;
  cover: string;
}

interface ListOwnerSummary {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
}

interface ListSearchResult {
  id: number;
  name: string;
  description: string | null;
  pictureUrl: string | null;
  recordCount: number;
  likes: number;
  created: string | null;
  owner: ListOwnerSummary | null;
}

const MIN_USER_QUERY_LENGTH = 2;
const MIN_LIST_QUERY_LENGTH = 2;
const SEARCH_TAB_VALUES = ["records", "lists", "users"] as const;
type SearchTab = (typeof SEARCH_TAB_VALUES)[number];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const paramQuery = searchParams.get("q") ?? "";
  const initialTab: SearchTab = SEARCH_TAB_VALUES.includes(
    paramTab as SearchTab
  )
    ? (paramTab as SearchTab) || "records"
    : "records";

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
    const nextTab: SearchTab = SEARCH_TAB_VALUES.includes(paramTab as SearchTab)
      ? (paramTab as SearchTab) || "records"
      : "records";
    setActiveTab(nextTab);
  }, [paramTab]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();

      if (cancelled) return;

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
    await performLogout(navigate);
  }, [navigate]);

  const [recordResults, setRecordResults] = useState<AlbumResult[]>([]);
  const [recordSearchInput, setRecordSearchInput] = useState(paramQuery);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordLoadingMore, setRecordLoadingMore] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordCurrentPage, setRecordCurrentPage] = useState(1);
  const [recordHasMore, setRecordHasMore] = useState(false);

  const handleRecordsSearchSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setRecordResults([]);
      setRecordError(null);
      setRecordHasMore(false);
      setRecordCurrentPage(1);
      return;
    }
    setRecordLoading(true);
    setRecordError(null);
    setRecordCurrentPage(1);
    try {
      const res = await fetch(
        apiUrl(
          `/api/lastfm/album.search?q=${encodeURIComponent(trimmed)}&page=1`
        ),
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const albums = data?.albums || [];
        setRecordResults(albums);
        setRecordHasMore(data?.hasMore || false);
      } else {
        const problem = await res.json().catch(() => ({}));
        setRecordError(problem.error || `Search failed (${res.status})`);
        setRecordHasMore(false);
      }
    } catch (error) {
      console.error(error);
      setRecordError("Network error searching albums");
      setRecordHasMore(false);
    } finally {
      setRecordLoading(false);
    }
  }, []);

  const handleRecordsLoadMore = useCallback(async () => {
    const trimmed = recordSearchInput.trim();
    if (!trimmed || recordLoadingMore || !recordHasMore) return;

    setRecordLoadingMore(true);
    setRecordError(null);
    const nextPage = recordCurrentPage + 1;

    try {
      const res = await fetch(
        apiUrl(
          `/api/lastfm/album.search?q=${encodeURIComponent(
            trimmed
          )}&page=${nextPage}`
        ),
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const albums = data?.albums || [];
        setRecordResults((prev) => [...prev, ...albums]);
        setRecordHasMore(data?.hasMore || false);
        setRecordCurrentPage(nextPage);
      } else {
        const problem = await res.json().catch(() => ({}));
        setRecordError(problem.error || `Search failed (${res.status})`);
      }
    } catch (error) {
      console.error(error);
      setRecordError("Network error loading more albums");
    } finally {
      setRecordLoadingMore(false);
    }
  }, [recordSearchInput, recordLoadingMore, recordHasMore, recordCurrentPage]);

  const handleRecordsClear = useCallback(
    (updateUrl = true) => {
      setRecordSearchInput("");
      setRecordResults([]);
      setRecordError(null);
      setRecordLoading(false);
      setRecordLoadingMore(false);
      setRecordHasMore(false);
      setRecordCurrentPage(1);
      if (updateUrl) {
        updateSearchParams("records", "");
      }
    },
    [updateSearchParams]
  );

  const recordItems = useMemo<RecordListItem[]>(() => {
    return recordResults.map((album, index) => {
      return {
        id: `${album.name}-${album.artist}-${index}`,
        record: album.name,
        artist: album.artist,
        cover: album.image || "",
      };
    });
  }, [recordResults]);

  const handleRecordSelect = useCallback(
    (item: RecordListItem) => {
      // Pass the submitted query (from URL param) so the record page can
      // restore it when navigating back to Search.
      const submitted = (searchParams.get("q") ?? "").trim();
      navigate("/master", { state: { album: item, query: submitted } });
    },
    [navigate, searchParams]
  );

  const [listResults, setListResults] = useState<ListSearchResult[]>([]);
  const [listStatus, setListStatus] = useState<
    "idle" | "loading" | "error" | "ready"
  >("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [listSearchInput, setListSearchInput] = useState(paramQuery);
  const [listSubmittedQuery, setListSubmittedQuery] = useState(paramQuery);

  const runListSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    setListSubmittedQuery(trimmed);
    if (!trimmed) {
      setListResults([]);
      setListStatus("idle");
      setListError(null);
      return;
    }
    if (trimmed.length < MIN_LIST_QUERY_LENGTH) {
      setListResults([]);
      setListStatus("error");
      setListError(
        `Enter at least ${MIN_LIST_QUERY_LENGTH} characters to search.`
      );
      return;
    }

    setListStatus("loading");
    setListError(null);
    try {
      const response = await fetch(
        apiUrl(
          `/api/lists/search?q=${encodeURIComponent(trimmed)}&limit=20&offset=0`
        ),
        { credentials: "include" }
      );
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || `Search failed (${response.status})`);
      }
      const data = await response.json();
      const lists: ListSearchResult[] = Array.isArray(data?.lists)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.lists.map((entry: any) => ({
            id: Number(entry?.id) || 0,
            name: typeof entry?.name === "string" ? entry.name : "",
            description:
              typeof entry?.description === "string" && entry.description.trim()
                ? entry.description.trim()
                : null,
            pictureUrl:
              typeof entry?.pictureUrl === "string" && entry.pictureUrl.trim()
                ? entry.pictureUrl.trim()
                : null,
            recordCount:
              Number.isFinite(entry?.recordCount) && entry.recordCount >= 0
                ? Math.trunc(entry.recordCount)
                : 0,
            likes:
              Number.isFinite(entry?.likes) && entry.likes >= 0
                ? Math.trunc(entry.likes)
                : 0,
            created:
              typeof entry?.created === "string" && entry.created.trim()
                ? entry.created.trim()
                : null,
            owner:
              entry?.owner && typeof entry.owner === "object"
                ? {
                    username:
                      typeof entry.owner.username === "string"
                        ? entry.owner.username
                        : "",
                    displayName:
                      typeof entry.owner.displayName === "string" &&
                      entry.owner.displayName.trim()
                        ? entry.owner.displayName.trim()
                        : null,
                    profilePicUrl:
                      typeof entry.owner.profilePicUrl === "string" &&
                      entry.owner.profilePicUrl.trim()
                        ? entry.owner.profilePicUrl.trim()
                        : null,
                  }
                : null,
          }))
        : [];
      setListResults(lists);
      setListStatus("ready");
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error ? error.message : "Failed to search lists";
      setListError(message);
      setListStatus("error");
    }
  }, []);

  const handleListClick = useCallback(
    (listId: number) => {
      navigate(`/lists/${listId}`);
    },
    [navigate]
  );

  const handleListsClear = useCallback(
    (updateUrl = true) => {
      setListSearchInput("");
      setListResults([]);
      setListStatus("idle");
      setListError(null);
      setListSubmittedQuery("");
      if (updateUrl) {
        updateSearchParams("lists", "");
      }
    },
    [updateSearchParams]
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
        activeTab === "records"
          ? recordSearchInput
          : activeTab === "lists"
          ? listSearchInput
          : userSearchInput;
      if (value === "records") {
        setRecordSearchInput(currentInput);
      } else if (value === "lists") {
        setListSearchInput(currentInput);
      } else {
        setUserSearchInput(currentInput);
      }
      setActiveTab(value);
      updateSearchParams(value, currentInput.trim());
    },
    [
      activeTab,
      listSearchInput,
      recordSearchInput,
      updateSearchParams,
      userSearchInput,
    ]
  );

  const handleTopBarSearchChange = useCallback(
    (value: string) => {
      if (activeTab === "records") {
        setRecordSearchInput(value);
      } else if (activeTab === "lists") {
        setListSearchInput(value);
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
      } else if (activeTab === "lists") {
        setListSearchInput(value);
        const trimmed = value.trim();
        if (!trimmed) {
          handleListsClear();
          return;
        }
        updateSearchParams("lists", trimmed);
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
    [
      activeTab,
      handleListsClear,
      handleRecordsClear,
      handleUsersClear,
      updateSearchParams,
    ]
  );

  useEffect(() => {
    setRecordSearchInput(paramQuery);
    setListSearchInput(paramQuery);
    setUserSearchInput(paramQuery);
    const trimmed = paramQuery.trim();
    if (!trimmed) {
      handleRecordsClear(false);
      handleListsClear(false);
      handleUsersClear(false);
      return;
    }
    if (activeTab === "records") {
      void handleRecordsSearchSubmit(trimmed);
    } else if (activeTab === "lists") {
      void runListSearch(trimmed);
    } else {
      void runUserSearch(trimmed);
    }
  }, [
    activeTab,
    handleListsClear,
    handleRecordsClear,
    handleRecordsSearchSubmit,
    handleUsersClear,
    runListSearch,
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
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
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
              : activeTab === "lists"
              ? "Search public lists"
              : "Search for users"
          }
          searchValue={
            activeTab === "records"
              ? recordSearchInput
              : activeTab === "lists"
              ? listSearchInput
              : userSearchInput
          }
          onSearchChange={handleTopBarSearchChange}
          onSearchSubmit={handleTopBarSearchSubmit}
        />

        <Box sx={{ flex: 1, overflowY: "hidden", pb: 3, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: 1, height: { xs: "100%" } }}>
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
                <Tab label="Lists" value="lists" />
                <Tab label="Users" value="users" />
              </Tabs>
              <Divider />
              {activeTab === "records" && (
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
                        {recordItems.map((item) => {
                          const coverUrl =
                            typeof item.cover === "string" && item.cover.trim()
                              ? item.cover.trim()
                              : null;
                          return (
                            <ListItemButton
                              key={item.id}
                              onClick={() => handleRecordSelect(item)}
                              divider
                              sx={{ alignItems: "flex-start", gap: 2 }}
                            >
                              <ListItemAvatar>
                                <CoverImage
                                  src={coverUrl}
                                  alt={item.record}
                                  variant="square"
                                  sx={{
                                    width: { xs: 90, md: 120 },
                                    height: { xs: 90, md: 120 },
                                    borderRadius: 1,
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
                          );
                        })}
                        {recordHasMore && !recordLoading && (
                          <Stack
                            sx={{
                              display: "flex",
                              justifySelf: "center",
                              gap: 1.5,
                              py: 2,
                            }}
                          >
                            <Box sx={{ mx: "auto" }}>
                              <Button
                                variant="outlined"
                                onClick={handleRecordsLoadMore}
                                disabled={recordLoadingMore}
                              >
                                {recordLoadingMore ? "Loading..." : "Load More"}
                              </Button>
                            </Box>
                            <Typography
                              sx={{ mx: "auto", color: "text.secondary" }}
                            >
                              Tip: Search by the album name
                            </Typography>
                          </Stack>
                        )}
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
              )}
              {activeTab === "lists" && (
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
                  {listStatus === "idle" && (
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
                        Search for a list to get started.
                      </Typography>
                      <Typography color="text.secondary">
                        Use the search box above to find public lists.
                      </Typography>
                    </Box>
                  )}
                  {listStatus === "loading" && (
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
                        Searching lists…
                      </Typography>
                    </Box>
                  )}
                  {listStatus === "error" && listError && (
                    <Alert severity="error">{listError}</Alert>
                  )}
                  {listStatus === "ready" && listResults.length === 0 && (
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
                        No lists matched “{listSubmittedQuery}”.
                      </Typography>
                    </Box>
                  )}
                  {listStatus === "ready" && listResults.length > 0 && (
                    <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                      <List disablePadding>
                        {listResults.map((list) => {
                          const coverUrl =
                            typeof list.pictureUrl === "string" &&
                            list.pictureUrl.trim()
                              ? list.pictureUrl.trim()
                              : "";
                          const createdText = list.created
                            ? formatLocalDate(list.created) ?? list.created
                            : null;
                          const recordCountText = `${list.recordCount} ${
                            list.recordCount === 1 ? "record" : "records"
                          }`;
                          const metaSegments = [recordCountText];
                          if (list.likes > 0) {
                            metaSegments.push(
                              `${list.likes} ${
                                list.likes === 1 ? "like" : "likes"
                              }`
                            );
                          }
                          if (createdText) {
                            metaSegments.push(`Created ${createdText}`);
                          }
                          const ownerUsername = list.owner?.username ?? null;
                          const ownerDisplayName =
                            list.owner?.displayName &&
                            list.owner.displayName.trim()
                              ? list.owner.displayName.trim()
                              : null;
                          const primaryOwnerLabel = ownerDisplayName
                            ? ownerDisplayName
                            : ownerUsername
                            ? `@${ownerUsername}`
                            : null;

                          return (
                            <ListItemButton
                              key={list.id}
                              onClick={() => handleListClick(list.id)}
                              sx={{ borderRadius: 1, alignItems: "flex-start" }}
                            >
                              <ListItemAvatar>
                                <CoverImage
                                  src={coverUrl ? apiUrl(coverUrl) : null}
                                  alt={list.name}
                                  variant="rounded"
                                  sx={{
                                    width: 90,
                                    height: 90,
                                  }}
                                />
                              </ListItemAvatar>
                              <ListItemText
                                sx={{ ml: 2 }}
                                primary={
                                  <Typography
                                    variant="subtitle1"
                                    fontWeight={700}
                                    sx={{ pr: 2 }}
                                  >
                                    {list.name}
                                  </Typography>
                                }
                                secondary={
                                  <>
                                    {primaryOwnerLabel && (
                                      <Typography
                                        component="span"
                                        variant="body2"
                                        color="text.secondary"
                                        sx={{ display: "block" }}
                                      >
                                        {primaryOwnerLabel}
                                      </Typography>
                                    )}
                                    <Typography
                                      component="span"
                                      variant="body2"
                                      color="text.secondary"
                                      sx={{ display: "block", mt: 0.75 }}
                                    >
                                      {metaSegments.join(" · ")}
                                    </Typography>
                                  </>
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
              {activeTab === "users" && (
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
