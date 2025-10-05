import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Avatar,
  CircularProgress,
  TextField,
  Drawer,
  IconButton,
  useMediaQuery,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import FilterListAltIcon from "@mui/icons-material/FilterListAlt";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import RecordTable from "./components/RecordTable";
import type { PublicUserProfile, Record as MrcRecord, Filters } from "./types";
import {
  clearCommunityCaches,
  loadPublicUserCollection,
  loadPublicUserProfile,
} from "./communityUsers";
import apiUrl from "./api";
import FilterSidebar from "./components/FilterSidebar";

const createInitialFilters = (): Filters => ({
  tags: [],
  rating: { min: 0, max: 10 },
  release: { min: 1877, max: 2100 },
});

export default function CommunityCollection() {
  const navigate = useNavigate();
  const params = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const targetUsername = params.username ?? "";

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [records, setRecords] = useState<MrcRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filters, setFilters] = useState<Filters>(() => createInitialFilters());
  const [allTags, setAllTags] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width:1200px)");

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
    if (isLargeScreen) {
      setSidebarOpen(false);
    }
  }, [isLargeScreen]);

  useEffect(() => {
    if (!targetUsername) {
      setError("Missing username");
      setProfile(null);
      setRecords([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearchTerm("");
    setFilters(createInitialFilters());
    setAllTags([]);

    Promise.all([
      loadPublicUserProfile(targetUsername),
      loadPublicUserCollection(targetUsername),
    ])
      .then(([profileData, collectionData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setRecords(collectionData);
        const uniqueTags = new Set<string>();
        for (const record of collectionData) {
          if (Array.isArray(record.tags)) {
            for (const tag of record.tags) uniqueTags.add(tag);
          }
        }
        setAllTags(Array.from(uniqueTags).sort((a, b) => a.localeCompare(b)));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load collection";
        setError(message);
        setProfile(null);
        setRecords([]);
        setAllTags([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

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

  const handleCommunitySearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        navigate("/community");
      } else {
        navigate(`/community?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [navigate]
  );

  const handleFilterChange = useCallback((updated: Partial<Filters>) => {
    setFilters((prev) => ({
      tags: updated.tags ?? prev.tags,
      rating: updated.rating ?? prev.rating,
      release: updated.release ?? prev.release,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createInitialFilters());
  }, []);

  const filteredRecords = useMemo(() => {
    let next = records;

    const query = searchTerm.trim().toLowerCase();
    if (query) {
      next = next.filter((record) => {
        if (record.record.toLowerCase().includes(query)) return true;
        if (record.artist.toLowerCase().includes(query)) return true;
        return false;
      });
    }

    if (filters.tags.length > 0) {
      next = next.filter((record) =>
        filters.tags.every((tag) => record.tags.includes(tag))
      );
    }

    next = next.filter(
      (record) =>
        record.rating >= filters.rating.min &&
        record.rating <= filters.rating.max
    );

    next = next.filter(
      (record) =>
        record.release >= filters.release.min &&
        record.release <= filters.release.max
    );

    return next;
  }, [records, searchTerm, filters]);

  const targetDisplayName = profile?.displayName || targetUsername;
  const targetAvatarInitial = (profile?.displayName || targetUsername)
    .charAt(0)
    .toUpperCase();
  const initialSearchValue = searchParams.get("q") ?? "";

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
          onSearchChange={handleCommunitySearch}
          searchMode="submit"
          searchPlaceholder="Search for users"
          initialSearchValue={initialSearchValue}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            pb: 3,
            px: 1,
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              flex: "0 0 auto",
              pb: { xs: 1, md: 1.5 },
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                alignItems: { xs: "flex-start", md: "center" },
                gap: { xs: 1.5, md: 2 },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <Avatar
                  sx={{ width: 48, height: 48, bgcolor: "grey.700" }}
                  src={profile?.profilePicUrl ?? undefined}
                >
                  {!profile?.profilePicUrl && targetAvatarInitial}
                </Avatar>
                <Box>
                  <Typography variant="h5" sx={{ lineHeight: 1.2 }}>
                    {targetDisplayName}'s Collection
                  </Typography>
                  <Typography variant="subtitle2" color="text.secondary">
                    @{profile?.username ?? targetUsername}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          <Grid
            container
            spacing={2}
            sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
          >
            <Grid
              size={{ xs: isLargeScreen ? 9 : 12 }}
              sx={{
                display: "flex",
                flexDirection: "column",
                minHeight: 105,
                height: "102%",
                mt: -1,
                mb: 0,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  pt: 1.1,
                }}
              >
                <TextField
                  variant="outlined"
                  placeholder="Search Collection"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{ type: "search" }}
                  size="small"
                  sx={{
                    width: { xs: "100%", sm: 320 },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {loading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                    }}
                  >
                    <CircularProgress size={24} />
                  </Box>
                ) : error ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      px: 2,
                    }}
                  >
                    <Typography color="error" align="center">
                      {error}
                    </Typography>
                  </Box>
                ) : filteredRecords.length === 0 ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      px: 2,
                    }}
                  >
                    <Typography color="text.secondary" align="center">
                      {searchTerm.trim() || filters.tags.length > 0
                        ? "No records match these filters."
                        : "No records to display."}
                    </Typography>
                  </Box>
                ) : (
                  <RecordTable records={filteredRecords} />
                )}
              </Box>
            </Grid>
            {isLargeScreen && (
              <Grid size={{ xs: 3 }} sx={{ minHeight: 0, mb: 1 }}>
                <FilterSidebar
                  tags={allTags}
                  currentFilters={filters}
                  onFiltersChange={handleFilterChange}
                  onResetFilters={resetFilters}
                />
              </Grid>
            )}
          </Grid>

          {!isLargeScreen && (
            <>
              {!sidebarOpen && !loading && (
                <IconButton
                  color="primary"
                  sx={{
                    position: "fixed",
                    top: "50%",
                    right: 16,
                    zIndex: 1300,
                    bgcolor: "background.paper",
                    boxShadow: 3,
                    borderRadius: 2,
                    transform: "translateY(-50%)",
                  }}
                  onClick={() => setSidebarOpen(true)}
                >
                  <FilterListAltIcon fontSize="large" />
                </IconButton>
              )}
              <Drawer
                anchor="right"
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                sx={{
                  "& .MuiDrawer-paper": {
                    width: 340,
                    maxWidth: "90vw",
                  },
                }}
              >
                <FilterSidebar
                  tags={allTags}
                  currentFilters={filters}
                  onFiltersChange={handleFilterChange}
                  onResetFilters={resetFilters}
                />
                <Box sx={{ textAlign: "right" }}>
                  <IconButton onClick={() => setSidebarOpen(false)}>
                    <span style={{ fontSize: 24, fontWeight: "bold" }}>
                      &times;
                    </span>
                  </IconButton>
                </Box>
              </Drawer>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
