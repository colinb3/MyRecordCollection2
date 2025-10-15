import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  Snackbar,
  Stack,
  CircularProgress,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import apiUrl from "./api";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { setUserId } from "./analytics";
import placeholderCover from "./assets/missingImg.jpg";
import FindRecordSidebar from "./components/FindRecordSidebar";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCommunityCaches } from "./communityUsers";
import { wikiGenres } from "./wiki";
import { useLocation, useNavigate } from "react-router-dom";

interface RecordListItem {
  id: string;
  record: string;
  artist: string;
  cover: string;
}

interface LocationState {
  album?: RecordListItem;
  query?: string;
  masterId?: number;
  fromCollection?: {
    path: string;
    title?: string;
    tableName?: string;
  };
}

interface MasterInfo {
  masterId: number | null;
  ratingAverage: number | null;
  releaseYear: number | null;
  cover: string | null;
  ratingCounts: number[] | null;
}

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";

function RatingsHistogram({ counts }: { counts: number[] }) {
  if (!Array.isArray(counts) || counts.length === 0) {
    return null;
  }

  const maxValue = counts.reduce(
    (max, current) =>
      Number.isFinite(current) && current > max ? current : max,
    0
  );
  const safeMax = maxValue > 0 ? maxValue : 1;

  return (
    <Box sx={{ alignSelf: { xs: "flex-start", md: "flex" } }}>
      <Box
        sx={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
          columnGap: 0.75,
          alignItems: "end",
          minHeight: 96,
        }}
      >
        {counts.map((count, index) => {
          const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
          const ratio = safeCount / safeMax;
          const barHeight = Math.max(Math.round(ratio * 80), 4);
          return (
            <Box
              key={index}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 28,
                minWidth: 0,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ whiteSpace: "nowrap" }}
              >
                {safeCount}
              </Typography>
              <Box
                sx={{
                  width: "100%",
                  height: `${barHeight}px`,
                  bgcolor: "primary.main",
                  borderRadius: 1,
                  transition: "height 0.2s ease",
                  mt: 0.5,
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, whiteSpace: "nowrap" }}
              >
                {index + 1}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default function Record() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | undefined) ?? {};
  const initialAlbum = locationState.album ?? null;
  const fromCollection = locationState.fromCollection;
  const fromCollectionPath =
    typeof fromCollection?.path === "string"
      ? fromCollection.path.trim() || null
      : null;
  const fromCollectionTitle = (() => {
    if (typeof fromCollection?.title === "string") {
      const trimmed = fromCollection.title.trim();
      if (trimmed.length > 0) return trimmed;
    }
    if (typeof fromCollection?.tableName === "string") {
      const trimmed = fromCollection.tableName.trim();
      if (trimmed.length > 0) return trimmed;
    }
    return null;
  })();
  const searchQuery =
    typeof locationState.query === "string" ? locationState.query.trim() : "";
  const backButtonLabel = fromCollectionTitle
    ? `Back to ${fromCollectionTitle}`
    : "Back to Search";
  const cachedUser = getCachedUserInfo();

  const parseMasterId = (value: string | null | undefined): number | null => {
    if (!value) return null;
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  };

  const masterIdFromQuery = parseMasterId(
    new URLSearchParams(location.search).get("q")
  );
  const initialMasterId =
    typeof locationState.masterId === "number" && locationState.masterId > 0
      ? locationState.masterId
      : masterIdFromQuery;

  const [album, setAlbum] = useState<RecordListItem | null>(initialAlbum);
  const [masterIdOverride, setMasterIdOverride] = useState<number | null>(
    initialMasterId ?? null
  );
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [wikiTags, setWikiTags] = useState<string[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [masterInfo, setMasterInfo] = useState<MasterInfo | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [releaseYearTouched, setReleaseYearTouched] = useState(false);
  const isMountedRef = useRef(true);
  const releaseYearTouchedRef = useRef(false);
  const skipNextMasterFetchRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    releaseYearTouchedRef.current = releaseYearTouched;
  }, [releaseYearTouched]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryMasterId = parseMasterId(params.get("q"));
    const stateMasterId =
      typeof locationState.masterId === "number" && locationState.masterId > 0
        ? locationState.masterId
        : null;
    const nextMasterId = stateMasterId ?? queryMasterId ?? null;
    setMasterIdOverride((prev) =>
      prev === nextMasterId ? prev : nextMasterId
    );
  }, [location.search, locationState.masterId]);

  useEffect(() => {
    if (!locationState.album) {
      const params = new URLSearchParams(location.search);
      const hasMasterQuery = parseMasterId(params.get("q"));
      if (!hasMasterQuery) {
        navigate("/search", { replace: true });
      }
    }
  }, [locationState.album, navigate, location.search]);

  useEffect(() => {
    if (locationState.album) {
      setAlbum(locationState.album);
    }
  }, [locationState.album]);

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
            if (!res.ok) return null;
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

  useEffect(() => {
    if (!album) return;

    setSelectedTags([]);
    setRating(0);
    setReleaseYear(new Date().getFullYear());
    setAddError(null);
    setWikiTags([]);
    setWikiLoading(true);
    setMasterError(null);
    setReleaseYearTouched(false);
    releaseYearTouchedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const genres = await wikiGenres(album.record, album.artist, true);
        if (cancelled) return;
        if (genres && genres.length > 0) {
          const first = genres[0];
          const yearNum = first && /^\d{4}$/.test(first) ? Number(first) : null;
          const withinRange =
            yearNum && yearNum >= 1800 && yearNum <= 2100 ? yearNum : null;
          if (withinRange && !releaseYearTouchedRef.current) {
            setReleaseYear(withinRange);
          }
          const tagsOnly = withinRange
            ? genres.slice(1).filter((tag) => !!tag)
            : genres.filter((tag) => !!tag);
          setWikiTags(tagsOnly);
        } else {
          setWikiTags([]);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setWikiTags([]);
        }
      } finally {
        if (!cancelled) {
          setWikiLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [album]);

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

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleAddNewTag = useCallback((tag: string) => {
    setAvailableTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  const handleReleaseYearChange = useCallback((value: number) => {
    if (Number.isFinite(value)) {
      setReleaseYear(value);
    }
    setReleaseYearTouched(true);
  }, []);

  const loadMasterInfo = useCallback(
    async (options?: { preserveReleaseYear?: boolean }) => {
      const masterIdToUse = masterIdOverride;
      const preserveReleaseYear =
        options?.preserveReleaseYear ?? releaseYearTouchedRef.current;
      const targetAlbumId =
        album?.id ?? (masterIdToUse ? `master-${masterIdToUse}` : null);

      if (!album && !masterIdToUse) {
        return;
      }

      let endpoint: string | null = null;
      if (masterIdToUse) {
        endpoint = apiUrl(`/api/records/master-info?masterId=${masterIdToUse}`);
      } else if (album) {
        const params = new URLSearchParams({
          artist: album.artist,
          record: album.record,
        });
        endpoint = apiUrl(`/api/records/master-info?${params.toString()}`);
      }

      if (!endpoint) {
        return;
      }

      setMasterLoading(true);
      setMasterError(null);
      setMasterInfo(null);

      try {
        const response = await fetch(endpoint, { credentials: "include" });

        if (!response.ok) {
          let message = "Failed to load community rating";
          try {
            const problem = await response.json();
            if (problem?.error) {
              message = problem.error;
            }
          } catch {
            /* ignore json errors */
          }
          throw new Error(message);
        }

        const data = await response.json();

        if (!isMountedRef.current) {
          return;
        }

        const masterIdValue = Number(data?.masterId);
        const ratingAverageValue =
          data?.ratingAverage !== null && data?.ratingAverage !== undefined
            ? Number(data.ratingAverage)
            : null;
        const releaseYearValue =
          data?.releaseYear !== null && data?.releaseYear !== undefined
            ? Number(data.releaseYear)
            : null;
        const coverValue =
          typeof data?.cover === "string" && data.cover.trim()
            ? data.cover.trim()
            : null;
        const ratingCountsValue = Array.isArray(data?.ratingCounts)
          ? data.ratingCounts.slice(0, 10).map((value: unknown) => {
              const num = Number(value);
              return Number.isFinite(num) && num >= 0 ? num : 0;
            })
          : null;

        const normalized: MasterInfo = {
          masterId:
            Number.isInteger(masterIdValue) && masterIdValue > 0
              ? masterIdValue
              : null,
          ratingAverage:
            ratingAverageValue !== null && Number.isFinite(ratingAverageValue)
              ? Math.round(ratingAverageValue * 10) / 10
              : null,
          releaseYear:
            releaseYearValue !== null && Number.isInteger(releaseYearValue)
              ? releaseYearValue
              : null,
          cover: coverValue,
          ratingCounts:
            ratingCountsValue && ratingCountsValue.length === 10
              ? ratingCountsValue
              : null,
        };

        if (!album) {
          const nameFromResponse =
            typeof data?.record === "string" && data.record.trim()
              ? data.record.trim()
              : null;
          const artistFromResponse =
            typeof data?.artist === "string" && data.artist.trim()
              ? data.artist.trim()
              : null;

          if (nameFromResponse || artistFromResponse) {
            setAlbum({
              id:
                targetAlbumId ?? `master-${normalized.masterId ?? Date.now()}`,
              record: nameFromResponse ?? "Unknown Record",
              artist: artistFromResponse ?? "Unknown Artist",
              cover: coverValue ?? "",
            });
          }
        }

        if (normalized.masterId && normalized.masterId !== masterIdOverride) {
          skipNextMasterFetchRef.current = normalized.masterId;
          setMasterIdOverride(normalized.masterId);
        }

        if (album && coverValue && (!album.cover || album.cover.length === 0)) {
          setAlbum((prev) =>
            prev
              ? {
                  ...prev,
                  cover: coverValue,
                }
              : prev
          );
        }

        const currentAlbumId = album?.id ?? targetAlbumId;
        if (
          targetAlbumId &&
          currentAlbumId &&
          targetAlbumId !== currentAlbumId
        ) {
          setMasterLoading(false);
          return;
        }

        setMasterInfo(normalized);
        setMasterLoading(false);

        if (
          !preserveReleaseYear &&
          normalized.releaseYear &&
          normalized.releaseYear >= 1800 &&
          normalized.releaseYear <= 2100
        ) {
          setReleaseYear(normalized.releaseYear);
          setReleaseYearTouched(true);
          releaseYearTouchedRef.current = true;
        }
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        console.warn("Failed to load master info", error);
        setMasterInfo(null);
        setMasterError(
          error instanceof Error
            ? error.message
            : "Failed to load community rating"
        );
        setMasterLoading(false);
      }
    },
    [album, masterIdOverride]
  );

  useEffect(() => {
    if (!album && !masterIdOverride) {
      setMasterInfo(null);
      setMasterError(null);
      return;
    }
    if (
      skipNextMasterFetchRef.current !== null &&
      masterIdOverride === skipNextMasterFetchRef.current
    ) {
      skipNextMasterFetchRef.current = null;
      return;
    }
    void loadMasterInfo({ preserveReleaseYear: false });
  }, [album, masterIdOverride, loadMasterInfo]);

  const submitRecord = useCallback(
    async (tableName: string, successMessage: string) => {
      if (!album) return;
      setAdding(true);
      setAddError(null);
      try {
        const normalizedCover =
          album.cover && album.cover.trim().length > 0 ? album.cover : null;
        const payloadMasterCover = normalizedCover ?? masterInfo?.cover ?? null;
        const payload = {
          id: -1,
          cover: normalizedCover,
          record: album.record,
          artist: album.artist,
          rating,
          isCustom: false,
          tags: selectedTags,
          release: releaseYear,
          added: new Date().toISOString().slice(0, 10),
          tableName,
          masterId: masterInfo?.masterId ?? masterIdOverride ?? null,
          masterReleaseYear: masterInfo?.releaseYear ?? null,
          masterCover: payloadMasterCover,
        };
        const res = await fetch(apiUrl("/api/records/create"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setSnackbar({
            open: true,
            message: successMessage,
            severity: "success",
          });
        } else {
          const problem = await res.json().catch(() => ({}));
          const msg = problem.error || `Failed to add record (${res.status})`;
          setAddError(msg);
          setSnackbar({ open: true, message: msg, severity: "error" });
        }
      } catch (error) {
        console.error(error);
        const msg = "Network error adding record";
        setAddError(msg);
        setSnackbar({ open: true, message: msg, severity: "error" });
      } finally {
        setAdding(false);
      }
    },
    [album, rating, releaseYear, selectedTags, masterInfo, masterIdOverride]
  );

  const handleAddRecord = useCallback(() => {
    void submitRecord(DEFAULT_COLLECTION_NAME, "Record added to collection");
  }, [submitRecord]);

  const handleAddWishlistRecord = useCallback(() => {
    void submitRecord(WISHLIST_COLLECTION_NAME, "Record added to wishlist");
  }, [submitRecord]);

  const handleBack = useCallback(() => {
    if (fromCollectionPath) {
      navigate(fromCollectionPath);
      return;
    }
    if (searchQuery) {
      navigate(`/search?tab=records&q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate("/search");
    }
  }, [navigate, fromCollectionPath, searchQuery]);

  if (!album) {
    return null;
  }

  let masterRatingContent: ReactNode = null;
  if (masterLoading) {
    masterRatingContent = (
      <Typography color="text.secondary">
        Loading community rating… <CircularProgress size={20} />
      </Typography>
    );
  } else if (masterError) {
    masterRatingContent = <Typography color="error">{masterError}</Typography>;
  } else if (masterInfo?.masterId) {
    const histogramCounts =
      Array.isArray(masterInfo.ratingCounts) &&
      masterInfo.ratingCounts.length === 10
        ? masterInfo.ratingCounts
        : null;
    masterRatingContent = (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {masterInfo.ratingAverage !== null ? (
          <Typography
            color="text.secondary"
            sx={{ mb: histogramCounts ? 0.7 : 0 }}
          >
            Average rating: {masterInfo.ratingAverage.toFixed(1)}
          </Typography>
        ) : (
          <Typography
            color="text.secondary"
            sx={{ mb: histogramCounts ? 0.7 : 0 }}
          >
            Be the first to rate!
          </Typography>
        )}
        {histogramCounts ? <RatingsHistogram counts={histogramCounts} /> : null}
      </Box>
    );
  }

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
        />
        <Box
          sx={{
            flex: 1,
            overflowY: { xs: "auto", md: "auto" },
            mt: 1,
            pb: 2,
            px: 1,
          }}
        >
          <Box maxWidth={800} mx="auto" sx={{ height: { md: "100%" } }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                minHeight: { xs: 420, md: 560 },
                height: { md: "100%" },
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  flexBasis: { md: "45%" },
                  flexGrow: 1,
                  p: { xs: 2, md: 3 },
                  display: "flex",
                  flexDirection: "column",
                  gap: 1.25,
                }}
              >
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                  variant="text"
                  sx={{ alignSelf: "flex-start" }}
                >
                  {backButtonLabel}
                </Button>
                <Stack direction={{ xs: "row", md: "column" }} spacing={2}>
                  <Box
                    component="img"
                    src={album.cover || placeholderCover}
                    alt={album.record}
                    sx={{
                      width: 180,
                      height: 180,
                      objectFit: "cover",
                      borderRadius: 2,
                      bgcolor: "grey.900",
                    }}
                  />
                  <Box sx={{}}>
                    <Typography variant="h5" fontWeight={700} gutterBottom>
                      {album.record}
                    </Typography>
                    <Typography color="text.secondary" variant="h6">
                      {album.artist}
                    </Typography>
                  </Box>
                </Stack>
                {masterRatingContent && (
                  <Box sx={{ mt: 1 }}>{masterRatingContent}</Box>
                )}
                {addError && <Alert severity="error">{addError}</Alert>}
              </Box>
              <Box
                sx={{
                  flexBasis: { md: "55%" },
                  flexGrow: 1,
                  p: { xs: 2, md: 3 },
                  mt: { xs: -1, md: 0 },
                  mb: { xs: 2, md: 0 },
                  maxHeight: { xs: 700, md: "none" },
                  display: "flex",
                  flexDirection: "column",
                }}
              >
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
                  onReleaseYearChange={handleReleaseYearChange}
                  canAdd={!adding}
                  onAddRecord={handleAddRecord}
                  onWishlistRecord={handleAddWishlistRecord}
                />
              </Box>
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
