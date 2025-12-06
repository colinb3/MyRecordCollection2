import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Avatar,
  TextField,
  Drawer,
  IconButton,
  useMediaQuery,
  ButtonBase,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import FilterListAltIcon from "@mui/icons-material/FilterListAlt";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { darkTheme } from "../theme";
import { getCachedUserInfo, loadUserInfo } from "../userInfo";
import { setUserId } from "../analytics";
import RecordTable from "../components/RecordTable";
import type { PublicUserProfile, Record as MrcRecord, Filters } from "../types";
import {
  loadPublicUserCollection,
  loadPublicUserCollectionByGenre,
  loadPublicUserProfile,
} from "../communityUsers";
import FilterSidebar from "../components/FilterSidebar";
import { performLogout } from "../logout";
import ShareButton from "../components/ShareButton";

const MIN_RELEASE_YEAR = 1901;
const MAX_RELEASE_YEAR = 2100;

const createInitialFilters = (): Filters => ({
  tags: [],
  rating: { min: 0, max: 10 },
  release: { min: MIN_RELEASE_YEAR, max: MAX_RELEASE_YEAR },
});

interface CommunityCollectionProps {
  tableName: string;
}

export default function CommunityCollection({
  tableName,
}: CommunityCollectionProps) {
  const navigate = useNavigate();
  const params = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const genreFilter = searchParams.get("g") || null;
  const tableFilter = searchParams.get("t") || null;
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cachedUser);

  const targetUsername = params.username ?? "";
  const normalizedViewer = (username ?? "").toLowerCase();
  const normalizedTarget = targetUsername.trim().toLowerCase();
  const viewingOwnCollection =
    normalizedTarget.length > 0 && normalizedTarget === normalizedViewer;

  const activeTableName = useMemo(() => {
    return tableName;
  }, [tableName]);

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

    // If genre filter is present, use the genre-specific endpoint
    const collectionPromise = genreFilter
      ? loadPublicUserCollectionByGenre(
          targetUsername,
          genreFilter,
          tableFilter || undefined
        )
      : loadPublicUserCollection(targetUsername, activeTableName);

    Promise.all([loadPublicUserProfile(targetUsername), collectionPromise])
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
  }, [targetUsername, activeTableName, genreFilter]);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

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

    // Genre filtering is now done server-side via the API endpoint
    // No need to filter by genre on the frontend

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

    const releaseMin = filters.release.min ?? MIN_RELEASE_YEAR;
    const releaseMax = filters.release.max ?? MAX_RELEASE_YEAR;
    next = next.filter((record) => {
      const releaseValue = Number.isFinite(record.release)
        ? record.release
        : null;
      if (releaseValue === null || releaseValue <= 0) {
        return true;
      }
      return releaseValue >= releaseMin && releaseValue <= releaseMax;
    });

    return next;
  }, [records, searchTerm, filters]);

  const targetDisplayName = profile?.displayName || targetUsername;
  const targetAvatarInitial = (profile?.displayName || targetUsername)
    .charAt(0)
    .toUpperCase();
  const isWishlistView = activeTableName === "Wishlist";
  const isListenedView = activeTableName === "Listened";
  const searchPlaceholder = isWishlistView
    ? "Search Wishlist"
    : isListenedView
    ? "Search Listened"
    : "Search Collection";
  const noMatchMessage = isWishlistView
    ? "No wishlist records match these filters."
    : isListenedView
    ? "No listened records match these filters."
    : "No records match these filters.";
  const emptyCollectionMessage = isWishlistView
    ? "No wishlist records to display."
    : isListenedView
    ? "No listened records to display."
    : "No records to display.";
  const navigateToRecordDetails = useCallback(
    (record: MrcRecord) => {
      const targetPath = viewingOwnCollection
        ? `/record/${record.id}`
        : `/community/${encodeURIComponent(targetUsername)}/record/${
            record.id
          }`;

      navigate(targetPath);
    },
    [navigate, targetUsername, viewingOwnCollection]
  );

  const handleSelectRecord = useCallback(
    (record: MrcRecord | null) => {
      if (record && record.id > 0) {
        navigateToRecordDetails(record);
      }
    },
    [navigateToRecordDetails]
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
          loading={userLoading}
        />
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            pb: { xs: 1, sm: 0 },
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              flex: "0 0 auto",
              pb: 0.5,
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
              <ButtonBase
                onClick={() => {
                  if (profile) {
                    navigate(
                      `/community/${encodeURIComponent(profile.username)}`
                    );
                  }
                }}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  alignSelf: "flex-start",
                  borderRadius: 1,
                  px: 0.5,
                  py: 0.5,
                  textAlign: "left",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                  // ensure children can shrink for text truncation
                  minWidth: 0,
                }}
              >
                <Avatar
                  sx={{ width: 36, height: 36, bgcolor: "grey.700" }}
                  src={profile?.profilePicUrl ?? undefined}
                >
                  {!profile?.profilePicUrl && targetAvatarInitial}
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ lineHeight: 1 }}>
                    {genreFilter
                      ? `${targetDisplayName}'s ${genreFilter} Records${
                          tableFilter ? ` (${tableFilter})` : ""
                        }`
                      : isWishlistView
                      ? `${targetDisplayName}'s Wishlist`
                      : isListenedView
                      ? `${targetDisplayName}'s Listened`
                      : `${targetDisplayName}'s Collection`}
                  </Typography>
                </Box>
              </ButtonBase>
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
                  alignItems: { xs: "stretch" },
                  justifyContent: { xs: "flex-start" },
                  pt: 1.1,
                  gap: 0.5,
                  flexWrap: "nowrap",
                }}
              >
                <TextField
                  variant="outlined"
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  InputProps={{ type: "search" }}
                  size="small"
                  sx={{
                    width: { xs: "100%", sm: 300 },
                  }}
                />
                <ShareButton
                  title={`${
                    profile?.displayName ?? profile?.username ?? ""
                  }'s ${activeTableName}`}
                  text={`Check out ${
                    profile?.displayName ?? profile?.username ?? ""
                  }'s ${activeTableName}`}
                />
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {error ? (
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
                ) : filteredRecords.length === 0 && !loading ? (
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
                        ? noMatchMessage
                        : emptyCollectionMessage}
                    </Typography>
                  </Box>
                ) : (
                  <RecordTable
                    records={filteredRecords}
                    loading={loading}
                    onSelect={handleSelectRecord}
                  />
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
                  tagsLoading={loading}
                  displayedRecords={filteredRecords}
                  isLargeScreen={isLargeScreen}
                  setSidebarOpen={setSidebarOpen}
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
                  tagsLoading={loading}
                  displayedRecords={filteredRecords}
                  isLargeScreen={isLargeScreen}
                  setSidebarOpen={setSidebarOpen}
                />
              </Drawer>
            </>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
