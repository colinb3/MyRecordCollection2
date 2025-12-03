import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
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
  Divider,
  Tooltip,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddBoxIcon from "@mui/icons-material/AddBox";
import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import HeadphonesOutlinedIcon from "@mui/icons-material/HeadphonesOutlined";
import FlagIcon from "@mui/icons-material/Flag";
import apiUrl from "./api";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { setUserId } from "./analytics";
import MasterSidebar from "./components/MasterSidebar";
import CoverImage from "./components/CoverImage";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { loadUserTags } from "./userTags";
import { wikiGenres } from "./wiki";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getCachedUserLists, setCachedUserLists } from "./userLists";
import { performLogout } from "./logout";
import ShareButton from "./components/ShareButton";
import ReportDialog from "./components/ReportDialog";

interface RecordListItem {
  id: string;
  record: string;
  artist: string;
  cover: string;
}

interface LocationState {
  album?: RecordListItem;
  query?: string;
  masterId?: string;
  fromCollection?: {
    path: string;
    title?: string;
    tableName?: string;
  };
  suggestedReleaseYear?: number;
  fromScanner?: boolean;
}

interface MasterInfo {
  masterId: string | null;
  ratingAverage: number | null;
  releaseYear: number | null;
  cover: string | null;
  ratingCounts: number[] | null;
  userCollections: UserCollectionEntry[];
  userLists: UserListEntry[];
  genres: string[];
  styles: string[];
  // indicates whether the master exists in the local server DB
  inDb?: boolean;
}

interface UserCollectionEntry {
  tableName: string;
  recordId: number;
}

interface UserListEntry {
  listId: number;
  name: string;
  isPrivate: boolean;
  listRecordId: number | null;
}

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";
const LISTENED_COLLECTION_NAME = "Listened";

function RatingsHistogram({ counts }: { counts: number[] }) {
  const [width, setWidth] = useState(window.innerWidth);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setSelectedBar(null);
    if (selectedBar !== null) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [selectedBar]);

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
          const barHeight = Math.max(Math.round(ratio * 90), 5);
          const isSelected = selectedBar === index;
          return (
            <Box
              key={index}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: { xs: (width - 130) / 10, md: 32 },
                minWidth: 0,
                position: "relative",
              }}
            >
              <Tooltip
                title={
                  <Typography
                    variant="body1"
                    sx={{ textAlign: "center" }}
                    fontSize={"1.1em"}
                  >
                    {index + 1}/10
                    <br />
                    {safeCount} Rating{safeCount === 1 ? "" : "s"}
                  </Typography>
                }
                open={isSelected}
              >
                <Box
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBar(isSelected ? null : index);
                  }}
                  sx={{
                    width: "100%",
                    height: `${barHeight}px`,
                    bgcolor: isSelected ? "primary.dark" : "primary.main",
                    borderRadius: 1,
                    transition: "0.2s ease",
                    mt: 0.5,
                    cursor: "pointer",
                    ":hover": { bgcolor: "primary.dark" },
                  }}
                />
              </Tooltip>
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

export default function MasterRecord() {
  const navigate = useNavigate();
  const location = useLocation();
  const { masterId: masterIdParam } = useParams<{ masterId?: string }>();
  const searchParams = new URLSearchParams(location.search);
  const locationState = (location.state as LocationState | undefined) ?? {};
  const initialAlbum = locationState.album ?? null;
  const fromCollection = locationState.fromCollection;
  const suggestedReleaseYear =
    typeof locationState.suggestedReleaseYear === "number" &&
    Number.isInteger(locationState.suggestedReleaseYear)
      ? locationState.suggestedReleaseYear
      : null;
  const cachedUser = getCachedUserInfo();

  const parseMasterId = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    // Accept numeric masterId or 'r' prefixed release ID
    if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) {
      return trimmed;
    }
    if (/^r\d+$/i.test(trimmed) && Number(trimmed.slice(1)) > 0) {
      return trimmed.toLowerCase();
    }
    return null;
  };

  const masterIdFromParam = parseMasterId(masterIdParam);
  const masterIdFromQuery = parseMasterId(searchParams.get("q"));
  const initialMasterId =
    typeof locationState.masterId === "string" && locationState.masterId.trim()
      ? locationState.masterId.trim()
      : masterIdFromParam ?? masterIdFromQuery;

  const [album, setAlbum] = useState<RecordListItem | null>(initialAlbum);
  const [masterIdOverride, setMasterIdOverride] = useState<string | null>(
    initialMasterId ?? null
  );
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cachedUser);

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [wikiTags, setWikiTags] = useState<string[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [releaseYear, setReleaseYear] = useState(
    suggestedReleaseYear ?? new Date().getFullYear()
  );
  const [reviewText, setReviewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [listActionLoading, setListActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
    action?: ReactNode;
  }>({ open: false, message: "", severity: "success" });
  const [masterInfo, setMasterInfo] = useState<MasterInfo | null>(null);
  const [masterLoading, setMasterLoading] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [releaseYearTouched, setReleaseYearTouched] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const albumCoverUrl =
    typeof album?.cover === "string" && album.cover.trim()
      ? album.cover.trim()
      : "";
  const masterCoverUrl =
    typeof masterInfo?.cover === "string" && masterInfo.cover.trim()
      ? masterInfo.cover.trim()
      : "";
  // Always prefer master cover if available, fall back to album cover
  const displayedCoverUrl = masterCoverUrl || albumCoverUrl;

  const [cachedListNames] = useState<UserListEntry[]>(() => {
    // Initialize with cached list names on mount
    const cached = getCachedUserLists();
    if (cached) {
      return cached.map((list) => ({
        listId: list.id,
        name: list.name,
        isPrivate: false, // Unknown from cache, will be updated when full data loads
        listRecordId: null, // Unknown from cache, will be updated when full data loads
      }));
    }
    return [];
  });
  const isMountedRef = useRef(true);
  const releaseYearTouchedRef = useRef(false);
  // Single ref to track the last successfully fetched master info
  const lastFetchedMasterRef = useRef<{
    masterId: string | null;
    albumKey: string | null;
  }>({
    masterId: null,
    albumKey: null,
  });

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
    if (
      suggestedReleaseYear &&
      Number.isInteger(suggestedReleaseYear) &&
      !releaseYearTouchedRef.current
    ) {
      setReleaseYear(suggestedReleaseYear);
    }
  }, [suggestedReleaseYear]);

  useEffect(() => {
    setReviewText("");
  }, [album?.id]);

  useEffect(() => {
    const paramMasterId = parseMasterId(masterIdParam);
    const queryMasterId = parseMasterId(
      new URLSearchParams(location.search).get("q")
    );
    const stateMasterId =
      typeof locationState.masterId === "string" &&
      locationState.masterId.trim()
        ? locationState.masterId.trim()
        : null;
    const nextMasterId =
      stateMasterId ?? paramMasterId ?? queryMasterId ?? null;
    setMasterIdOverride((prev) =>
      prev === nextMasterId ? prev : nextMasterId
    );
  }, [location.search, locationState.masterId, masterIdParam]);

  useEffect(() => {
    if (!locationState.album) {
      const paramMasterId = parseMasterId(masterIdParam);
      const hasMasterQuery = parseMasterId(
        new URLSearchParams(location.search).get("q")
      );
      if (!paramMasterId && !hasMasterQuery) {
        navigate("/search", { replace: true });
      }
    }
  }, [locationState.album, navigate, location.search, masterIdParam]);

  useEffect(() => {
    if (locationState.album) {
      setAlbum(locationState.album);
    }
  }, [locationState.album]);

  useEffect(() => {
    if (!masterIdOverride) {
      return;
    }
    const currentParamMasterId = parseMasterId(masterIdParam);
    if (currentParamMasterId === masterIdOverride) {
      return;
    }
    navigate(
      {
        pathname: `/master/${masterIdOverride}`,
        search: location.search,
      },
      {
        replace: true,
        state: { ...locationState, masterId: masterIdOverride },
      }
    );
  }, [
    masterIdOverride,
    navigate,
    masterIdParam,
    location.search,
    locationState,
  ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [info, tags] = await Promise.all([loadUserInfo(), loadUserTags()]);

      if (cancelled) return;
      setUserLoading(false);

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
    setWikiTags([]);
    setWikiLoading(true);
    setMasterError(null);
    setReleaseYearTouched(false);
    releaseYearTouchedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const genres = await wikiGenres(album.record, album.artist, false);
        if (cancelled) return;
        if (genres && genres.length > 0) {
          const filteredTags = genres.filter((tag) => !!tag);
          setWikiTags(filteredTags);
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
    await performLogout(navigate);
  }, [navigate]);

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleAddNewTag = useCallback((tag: string) => {
    // Insert the new tag in alphabetical order (case-insensitive)
    setAvailableTags((prev) => {
      if (prev.includes(tag)) return prev;
      const newTags = [...prev, tag];
      newTags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      return newTags;
    });
    // Also select the new tag
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  }, []);

  const handleReleaseYearChange = useCallback((value: number) => {
    if (Number.isFinite(value)) {
      setReleaseYear(value);
    }
    setReleaseYearTouched(true);
  }, []);

  const handleReviewChange = useCallback((value: string) => {
    setReviewText(value);
  }, []);

  const loadMasterInfo = useCallback(
    async (options?: { preserveReleaseYear?: boolean; force?: boolean }) => {
      const masterIdToUse = masterIdOverride;
      const preserveReleaseYear =
        options?.preserveReleaseYear ?? releaseYearTouchedRef.current;
      const forceRefresh = options?.force ?? false;

      if (!album && !masterIdToUse) {
        return;
      }

      // Create a unique key for deduplication
      const albumKey = album ? `${album.artist}:${album.record}` : null;

      // Check if we've already fetched this exact master info
      if (!forceRefresh) {
        let alreadyFetched = false;

        if (masterIdToUse) {
          // If we're fetching by masterId, only skip if we previously fetched by the same masterId
          alreadyFetched =
            lastFetchedMasterRef.current.masterId === masterIdToUse;
        } else if (albumKey) {
          // If we're fetching by albumKey, only skip if we previously fetched by the same albumKey
          alreadyFetched = lastFetchedMasterRef.current.albumKey === albumKey;
        }

        if (alreadyFetched) {
          return;
        }
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

        // masterId can be a numeric string or 'r' prefixed string
        const masterIdValue =
          typeof data?.masterId === "string" && data.masterId.trim()
            ? data.masterId.trim()
            : typeof data?.masterId === "number" && data.masterId > 0
            ? String(data.masterId)
            : null;
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
        const userCollectionsValue = Array.isArray(data?.userCollections)
          ? data.userCollections
              .map((entry: unknown): UserCollectionEntry | null => {
                if (!entry || typeof entry !== "object") {
                  return null;
                }
                const typed = entry as {
                  tableName?: unknown;
                  recordId?: unknown;
                };
                const tableName =
                  typeof typed.tableName === "string"
                    ? typed.tableName.trim()
                    : null;
                const recordIdNumber = Number(typed.recordId);
                if (
                  !tableName ||
                  !Number.isInteger(recordIdNumber) ||
                  recordIdNumber <= 0
                ) {
                  return null;
                }
                return {
                  tableName,
                  recordId: recordIdNumber,
                };
              })
              .filter(
                (
                  value: UserCollectionEntry | null
                ): value is UserCollectionEntry => value !== null
              )
          : [];

        const userListsValue = Array.isArray(data?.userLists)
          ? data.userLists
              .map((entry: unknown): UserListEntry | null => {
                if (!entry || typeof entry !== "object") {
                  return null;
                }
                const typed = entry as {
                  listId?: unknown;
                  name?: unknown;
                  isPrivate?: unknown;
                  listRecordId?: unknown;
                };
                const listIdNumber = Number(typed.listId);
                if (!Number.isInteger(listIdNumber) || listIdNumber <= 0) {
                  return null;
                }
                const name =
                  typeof typed.name === "string" && typed.name.trim()
                    ? typed.name.trim()
                    : null;
                if (!name) {
                  return null;
                }
                const isPrivateValue = typed.isPrivate;
                const isPrivate =
                  isPrivateValue === true ||
                  isPrivateValue === "true" ||
                  Number(isPrivateValue) === 1;
                const recordIdNumber = Number(typed.listRecordId);
                const listRecordId =
                  Number.isInteger(recordIdNumber) && recordIdNumber > 0
                    ? recordIdNumber
                    : null;
                return {
                  listId: listIdNumber,
                  name,
                  isPrivate,
                  listRecordId,
                };
              })
              .filter(
                (value: UserListEntry | null): value is UserListEntry =>
                  value !== null
              )
          : [];

        const genresValue = Array.isArray(data?.genres)
          ? data.genres.filter(
              (g: unknown): g is string =>
                typeof g === "string" && g.trim().length > 0
            )
          : [];
        const stylesValue = Array.isArray(data?.styles)
          ? data.styles.filter(
              (s: unknown): s is string =>
                typeof s === "string" && s.trim().length > 0
            )
          : [];

        const normalized: MasterInfo = {
          masterId: masterIdValue,
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
          userCollections: userCollectionsValue,
          userLists: userListsValue,
          genres: genresValue,
          styles: stylesValue,
          inDb: data?.inDb === true,
        };

        // Update cache with list names (minimal cache for fast loading)
        if (userListsValue.length > 0) {
          const listNames = userListsValue.map((list: UserListEntry) => ({
            id: list.listId,
            name: list.name,
          }));
          setCachedUserLists(listNames);
        }

        // Update the lastFetchedMasterRef to prevent duplicate fetches
        if (masterIdToUse) {
          // We fetched by masterId
          lastFetchedMasterRef.current = {
            masterId: masterIdToUse,
            albumKey: null,
          };
        } else if (albumKey) {
          // We fetched by albumKey
          lastFetchedMasterRef.current = {
            masterId: null,
            albumKey: albumKey,
          };
        }

        // If we discovered a masterId, update masterIdOverride for URL sync
        // This won't trigger a refetch since we'll mark it as fetched
        if (
          normalized.masterId &&
          !masterIdToUse &&
          normalized.masterId !== masterIdOverride
        ) {
          // Update the ref to include the discovered masterId so we don't refetch when URL changes
          lastFetchedMasterRef.current = {
            masterId: normalized.masterId,
            albumKey: null,
          };
          setMasterIdOverride(normalized.masterId);
        }

        const nameFromResponse =
          typeof data?.record === "string" && data.record.trim()
            ? data.record.trim()
            : null;
        const artistFromResponse =
          typeof data?.artist === "string" && data.artist.trim()
            ? data.artist.trim()
            : null;

        if (!album) {
          if (nameFromResponse || artistFromResponse) {
            setAlbum({
              id: `master-${normalized.masterId ?? Date.now()}`,
              record: nameFromResponse ?? "Unknown Record",
              artist: artistFromResponse ?? "Unknown Artist",
              cover: coverValue ?? "",
            });
          }
        } else {
          // Check if name or artist from server differs from what user clicked
          // Only show snackbar if master is in DB (meaning we're using official data)
          const nameChanged =
            nameFromResponse && album.record !== nameFromResponse;
          const artistChanged =
            artistFromResponse && album.artist !== artistFromResponse;

          if (normalized.inDb && (nameChanged || artistChanged)) {
            setSnackbar({
              open: true,
              message:
                "Some details changed. If you believe the name or artist is incorrect, please report the master to let us know.",
              severity: "success",
            });
          }

          // Update album name/artist if they differ from server's values
          // Only update cover if album doesn't have one yet (don't override existing cover)
          const needsNameArtistUpdate = nameChanged || artistChanged;
          const needsCoverUpdate =
            coverValue && (!album.cover || album.cover.length === 0);

          if (needsNameArtistUpdate || needsCoverUpdate) {
            setAlbum((prev) =>
              prev
                ? {
                    ...prev,
                    record: nameFromResponse ?? prev.record,
                    artist: artistFromResponse ?? prev.artist,
                    // Only update cover if album doesn't have one
                    cover: needsCoverUpdate
                      ? coverValue || prev.cover
                      : prev.cover,
                  }
                : prev
            );
          }
        }

        setMasterInfo(normalized);
        setMasterLoading(false);

        if (
          !preserveReleaseYear &&
          normalized.releaseYear &&
          normalized.releaseYear >= 1901 &&
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
      lastFetchedMasterRef.current = { masterId: null, albumKey: null };
      return;
    }

    void loadMasterInfo({ preserveReleaseYear: false });
  }, [album, masterIdOverride, loadMasterInfo]);

  const removeExistingRecord = useCallback(
    async (recordId: number, successMessage: string) => {
      setAdding(true);
      try {
        const res = await fetch(apiUrl("/api/records/delete"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: recordId }),
        });

        if (res.ok) {
          setSnackbar({
            open: true,
            message: successMessage,
            severity: "success",
          });
          await loadMasterInfo({ preserveReleaseYear: true, force: true });
        } else {
          const problem = await res.json().catch(() => ({}));
          setSnackbar({
            open: true,
            message: problem.error || "Failed to remove record",
            severity: "error",
          });
        }
      } catch (error) {
        console.error(error);
        setSnackbar({
          open: true,
          message: "Network error removing record",
          severity: "error",
        });
      } finally {
        setAdding(false);
      }
    },
    [loadMasterInfo]
  );

  const submitRecord = useCallback(
    async (tableName: string, successMessage: string) => {
      if (!album) return;
      setAdding(true);
      try {
        const normalizedCover =
          album.cover && album.cover.trim().length > 0 ? album.cover : null;
        const payloadMasterCover = normalizedCover ?? masterInfo?.cover ?? null;
        const trimmedReview = reviewText.trim();
        const reviewPayload =
          trimmedReview.length > 0 ? trimmedReview.slice(0, 4000) : null;
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
          review: reviewPayload,
          genres: masterInfo?.genres ?? [],
          styles: masterInfo?.styles ?? [],
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
          await loadMasterInfo({ preserveReleaseYear: true, force: true });
        } else {
          const problem = await res.json().catch(() => ({}));
          const msg = problem.error || `Failed to add record (${res.status})`;

          // If there's a conflict with an existing record in a different collection, show Move button
          if (
            res.status === 409 &&
            problem.existingRecordId &&
            problem.existingCollection &&
            problem.existingCollection !== tableName
          ) {
            const handleMove = async () => {
              try {
                const moveRes = await fetch(apiUrl("/api/records/move"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    id: problem.existingRecordId,
                    targetTableName: tableName,
                  }),
                });

                if (moveRes.ok) {
                  await loadMasterInfo({
                    preserveReleaseYear: true,
                    force: true,
                  });
                  setSnackbar({
                    open: true,
                    message: `Record moved to ${tableName}`,
                    severity: "success",
                  });
                } else {
                  const moveError = await moveRes.json().catch(() => ({}));
                  setSnackbar({
                    open: true,
                    message: moveError.error || "Failed to move record",
                    severity: "error",
                  });
                }
              } catch (error) {
                console.error(error);
                setSnackbar({
                  open: true,
                  message: "Network error moving record",
                  severity: "error",
                });
              }
            };

            setSnackbar({
              open: true,
              message: msg,
              severity: "error",
              action: (
                <Button color="inherit" size="small" onClick={handleMove}>
                  Move
                </Button>
              ),
            });
          } else {
            setSnackbar({ open: true, message: msg, severity: "error" });
          }
        }
      } catch (error) {
        console.error(error);
        const msg = "Network error adding record";
        setSnackbar({ open: true, message: msg, severity: "error" });
      } finally {
        setAdding(false);
      }
    },
    [
      album,
      rating,
      releaseYear,
      reviewText,
      selectedTags,
      masterInfo,
      masterIdOverride,
      loadMasterInfo,
    ]
  );

  const handleAddRecord = useCallback(() => {
    if (!username) {
      if (location.pathname !== "/login") {
        const next = encodeURIComponent(
          `${location.pathname}${location.search || ""}${location.hash || ""}`
        );
        navigate(`/login?next=${next}`);
      }
      return;
    }
    void submitRecord(DEFAULT_COLLECTION_NAME, "Record added to collection");
  }, [submitRecord, username, navigate]);

  const handleAddWishlistRecord = useCallback(() => {
    if (!username) {
      if (location.pathname !== "/login") {
        const next = encodeURIComponent(
          `${location.pathname}${location.search || ""}${location.hash || ""}`
        );
        navigate(`/login?next=${next}`);
      }
      return;
    }
    void submitRecord(WISHLIST_COLLECTION_NAME, "Record added to wishlist");
  }, [submitRecord, username, navigate]);

  const handleAddListenedRecord = useCallback(() => {
    if (!username) {
      if (location.pathname !== "/login") {
        const next = encodeURIComponent(
          `${location.pathname}${location.search || ""}${location.hash || ""}`
        );
        navigate(`/login?next=${next}`);
      }
      return;
    }
    void submitRecord(LISTENED_COLLECTION_NAME, "Record added to listened");
  }, [submitRecord, username, navigate]);

  const membership = useMemo(() => {
    const empty = {
      collection: null as UserCollectionEntry | null,
      wishlist: null as UserCollectionEntry | null,
      listened: null as UserCollectionEntry | null,
    };
    if (!Array.isArray(masterInfo?.userCollections)) {
      return empty;
    }
    const defaultKey = DEFAULT_COLLECTION_NAME.trim().toLowerCase();
    const wishlistKey = WISHLIST_COLLECTION_NAME.trim().toLowerCase();
    const listenedKey = LISTENED_COLLECTION_NAME.trim().toLowerCase();
    const next = { ...empty };
    for (const entry of masterInfo.userCollections) {
      if (!entry || typeof entry.tableName !== "string") {
        continue;
      }
      const normalized = entry.tableName.trim().toLowerCase();
      if (normalized === defaultKey) {
        next.collection = entry;
      } else if (normalized === wishlistKey) {
        next.wishlist = entry;
      } else if (normalized === listenedKey) {
        next.listened = entry;
      }
    }
    return next;
  }, [masterInfo?.userCollections]);

  const listOptions = useMemo(() => {
    // Use full data from masterInfo if available, otherwise use cached names
    const lists = Array.isArray(masterInfo?.userLists)
      ? masterInfo.userLists
      : cachedListNames;

    return [...lists].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [masterInfo?.userLists, cachedListNames]);

  const handleAddToList = useCallback(
    async (listId: number) => {
      if (!username) {
        if (location.pathname !== "/login") {
          const next = encodeURIComponent(
            `${location.pathname}${location.search || ""}${location.hash || ""}`
          );
          navigate(`/login?next=${next}`);
        }
        return;
      }

      const resolvedMasterId = masterInfo?.masterId ?? masterIdOverride;
      const recordNameForList =
        (album?.record && album.record.trim()) || "Untitled";
      const artistForList =
        typeof album?.artist === "string" ? album.artist : "";
      const coverForList = masterInfo?.cover ?? album?.cover ?? null;
      const releaseYearForList = Number.isFinite(releaseYear)
        ? releaseYear
        : masterInfo?.releaseYear ?? null;

      const listOption = listOptions.find((opt) => opt.listId === listId);
      const listName = listOption?.name ?? "list";

      setListActionLoading(true);
      try {
        const response = await fetch(apiUrl(`/api/lists/${listId}/records`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            masterId: resolvedMasterId ?? null,
            recordName: recordNameForList,
            artist: artistForList,
            cover: coverForList,
            releaseYear: releaseYearForList,
            rating: Number.isFinite(Number(rating))
              ? Math.trunc(Number(rating))
              : null,
            genres: masterInfo?.genres ?? [],
            styles: masterInfo?.styles ?? [],
          }),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(
            typeof problem.error === "string"
              ? problem.error
              : "Failed to add record to list"
          );
        }
        setSnackbar({
          open: true,
          message: `Added to ${listName}`,
          severity: "success",
        });
        await loadMasterInfo({ preserveReleaseYear: true, force: true });
      } catch (error) {
        console.error(error);
        setSnackbar({
          open: true,
          message:
            error instanceof Error ? error.message : "List update failed",
          severity: "error",
        });
      } finally {
        setListActionLoading(false);
      }
    },
    [
      album,
      rating,
      loadMasterInfo,
      masterIdOverride,
      masterInfo,
      navigate,
      releaseYear,
      username,
      location.pathname,
      location.search,
      location.hash,
    ]
  );

  const handleManageLists = useCallback(() => {
    navigate("/lists");
  }, [navigate]);

  const handleOpenMasterReviews = useCallback(() => {
    const resolvedMasterId = masterInfo?.masterId ?? masterIdOverride;
    if (!resolvedMasterId) {
      return;
    }

    // Just navigate - browser history will handle the back button
    navigate(`/master/${resolvedMasterId}/reviews`, {
      state: {
        album, // Keep album for display purposes
      },
    });
  }, [album, masterInfo, masterIdOverride, navigate]);

  const handleBack = useCallback(() => {
    // Simply use browser history for consistent back navigation
    navigate(-1);
  }, [navigate]);

  const promptRecordRemoval = useCallback(
    (
      entry: UserCollectionEntry | null,
      successMessage: string,
      infoMessage: string
    ) => {
      if (!entry) {
        return;
      }
      if (!username) {
        navigate("/login");
        return;
      }
      setSnackbar({
        open: true,
        message: infoMessage,
        severity: "error",
        action: (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setSnackbar((prev) => ({ ...prev, open: false }));
              if (!adding) {
                void removeExistingRecord(entry.recordId, successMessage);
              }
            }}
          >
            Remove
          </Button>
        ),
      });
    },
    [adding, navigate, removeExistingRecord, username]
  );

  const wishlistButtonConfig = membership.wishlist
    ? {
        label: "Wishlisted",
        variant: "contained" as const,
        disabled: adding,
        onClick: () =>
          promptRecordRemoval(
            membership.wishlist,
            "Record removed from Wishlist",
            "Record already in Wishlist. Remove it?"
          ),
        icon: <FavoriteIcon />,
      }
    : {
        label: "Wishlist",
        variant: "outlined" as const,
        disabled: adding,
        onClick: handleAddWishlistRecord,
        icon: <FavoriteBorderIcon />,
      };

  const listenedButtonConfig = membership.listened
    ? {
        label: "Listened",
        variant: "contained" as const,
        disabled: adding,
        onClick: () =>
          promptRecordRemoval(
            membership.listened,
            "Record removed from Listened",
            "Record already in Listened. Remove it?"
          ),
        icon: <HeadphonesIcon />,
      }
    : {
        label: "Listened",
        variant: "outlined" as const,
        disabled: adding,
        onClick: handleAddListenedRecord,
        icon: <HeadphonesOutlinedIcon />,
      };

  const collectionButtonConfig = membership.collection
    ? {
        label: "Added to Collection",
        variant: "contained" as const,
        disabled: adding,
        onClick: () =>
          promptRecordRemoval(
            membership.collection,
            "Record removed from My Collection",
            "Record already in My Collection. Remove it?"
          ),
        icon: <AddBoxIcon />,
      }
    : {
        label: "Add to Collection",
        variant: "outlined" as const,
        disabled: adding,
        onClick: handleAddRecord,
        icon: <AddBoxOutlinedIcon />,
      };

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
        {histogramCounts ? (
          <Box display={"flex"} flexDirection={"column"} alignItems={"center"}>
            <Box display={"inline-block"} mb={0.5}>
              <RatingsHistogram counts={histogramCounts} />
            </Box>
            <Typography color="text.secondary">Ratings</Typography>
          </Box>
        ) : null}
        {masterInfo?.inDb && (
          <Box alignSelf={"center"}>
            <Button
              variant="outlined"
              onClick={handleOpenMasterReviews}
              sx={{ mt: 1.5, alignSelf: "flex-start", px: 3 }}
            >
              View community reviews
            </Button>
          </Box>
        )}
      </Box>
    );
  } else if (masterInfo) {
    masterRatingContent = (
      <Typography color="text.secondary">
        Ratings unavailable. Make sure the record name and artist are correct.
      </Typography>
    );
  }

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
          loading={userLoading}
        />
        <Box
          sx={{
            flex: 1,
            overflowY: { xs: "auto", md: "auto" },
            pt: 1,
            px: 1,
            pb: 3,
          }}
        >
          <Box
            maxWidth={860}
            mx="auto"
            sx={{ height: { md: "100%" }, pb: { xs: 4, sm: 0 } }}
          >
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                height: { md: "100%" },
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  flexBasis: { md: "48%" },
                  flexGrow: 1,
                  my: { xs: 2, md: 3 },
                  pl: { xs: 2, md: 3 },
                  mr: { xs: 2, md: 0 },
                  pr: { xs: 0, md: 1.5 },
                  display: "flex",
                  flexDirection: "column",
                  overflowY: { md: "auto" },
                }}
              >
                <Stack direction={"row"} justifyContent="space-between">
                  <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={handleBack}
                    variant="outlined"
                    sx={{ alignSelf: "flex-start", mb: 1.5 }}
                  >
                    Back
                  </Button>
                  <Box sx={{ gap: 0.5 }}>
                    {masterInfo?.inDb ? (
                      <>
                        {username && (
                          <Tooltip title="Report">
                            <IconButton
                              color="inherit"
                              size="medium"
                              aria-label="Report this record"
                              onClick={() => setReportDialogOpen(true)}
                            >
                              <FlagIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <ShareButton
                          title={`${album?.record || "Record"} by ${
                            album?.artist || "Unknown Artist"
                          }`}
                          text={`Check out this record: ${
                            album?.record || "Record"
                          } by ${album?.artist || "Unknown Artist"}`}
                        />
                      </>
                    ) : null}
                  </Box>
                </Stack>
                <Stack direction={{ xs: "row", md: "column" }}>
                  {fromCollection && (masterLoading || !masterInfo) ? (
                    <Box
                      sx={{
                        width: 180,
                        height: 180,
                        borderRadius: 2,
                        bgcolor: "grey.900",
                        mb: { xs: 0, md: 1.5 },
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CircularProgress />
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        minWidth: { xs: 150, sm: 175, md: 200 },
                        minHeight: { xs: 150, sm: 175, md: 200 },
                        width: { xs: 150, sm: 175, md: 200 },
                        height: { xs: 150, sm: 175, md: 200 },
                        borderRadius: 2,
                        mb: { xs: 0, md: 1.5 },
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CoverImage
                        src={displayedCoverUrl}
                        alt={album?.record ?? "Album cover"}
                        variant="rounded"
                        iconSize="large"
                        sx={{
                          width: { xs: 150, sm: 175, md: 200 },
                          height: { xs: 150, sm: 175, md: 200 },
                          borderRadius: 2,
                        }}
                      />
                    </Box>
                  )}
                  <Box sx={{ ml: { xs: 2, md: 0 } }}>
                    <Typography variant="h5" fontWeight={700}>
                      {album.record}
                    </Typography>
                    <Typography color="text.secondary" variant="h6">
                      {album.artist}
                    </Typography>
                  </Box>
                </Stack>
                <Divider sx={{ my: 2 }} />
                {masterRatingContent && <Box>{masterRatingContent}</Box>}
              </Box>
              <Box
                sx={{
                  flexBasis: { md: "52%" },
                  flexGrow: 1,
                  p: { xs: 2, md: 3 },
                  pl: { md: 2 },
                  mt: { xs: -1, md: 0 },
                  mb: { xs: 2, md: 0 },
                  maxHeight: { xs: 720, md: "none" },
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <MasterSidebar
                  availableTags={availableTags}
                  selectedTags={selectedTags}
                  onToggleTag={handleToggleTag}
                  onAddNewTag={handleAddNewTag}
                  wikiTags={wikiTags}
                  wikiLoading={wikiLoading}
                  masterLoading={masterLoading}
                  rating={rating}
                  onRatingChange={setRating}
                  releaseYear={releaseYear}
                  onReleaseYearChange={handleReleaseYearChange}
                  review={reviewText}
                  onReviewChange={handleReviewChange}
                  wishlistButton={wishlistButtonConfig}
                  listenedButton={listenedButtonConfig}
                  collectionButton={collectionButtonConfig}
                  listOptions={listOptions}
                  onAddToList={handleAddToList}
                  onManageLists={handleManageLists}
                  listActionDisabled={listActionLoading}
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
            action={snackbar.action}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        <ReportDialog
          open={reportDialogOpen}
          onClose={() => setReportDialogOpen(false)}
          type="master"
          targetId={
            masterIdOverride ?? (masterIdParam ? masterIdParam : undefined)
          }
          targetName={album?.record || "Unknown"}
        />
      </Box>
    </ThemeProvider>
  );
}
