import { useState, useEffect, useCallback } from "react";
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
}

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";

export default function Record() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | undefined) ?? {};
  const initialAlbum = locationState.album ?? null;
  const cachedUser = getCachedUserInfo();

  const [album, setAlbum] = useState<RecordListItem | null>(initialAlbum);
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

  useEffect(() => {
    if (!locationState.album) {
      navigate("/search", { replace: true });
    }
  }, [locationState.album, navigate]);

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
    let cancelled = false;

    (async () => {
      try {
        const genres = await wikiGenres(album.record, album.artist, true);
        if (cancelled) return;
        if (genres && genres.length > 0) {
          const first = genres[0];
          const yearNum = first && /^\d{4}$/.test(first) ? Number(first) : null;
          if (yearNum && yearNum >= 1800 && yearNum <= 2100) {
            setReleaseYear(yearNum);
            setWikiTags(genres.slice(1).filter((tag) => !!tag));
          } else {
            setWikiTags(genres.filter((tag) => !!tag));
          }
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

  const submitRecord = useCallback(
    async (tableName: string, successMessage: string) => {
      if (!album) return;
      setAdding(true);
      setAddError(null);
      try {
        const payload = {
          id: -1,
          cover: album.cover,
          record: album.record,
          artist: album.artist,
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
    [album, rating, releaseYear, selectedTags]
  );

  const handleAddRecord = useCallback(() => {
    void submitRecord(DEFAULT_COLLECTION_NAME, "Record added to collection");
  }, [submitRecord]);

  const handleAddWishlistRecord = useCallback(() => {
    void submitRecord(WISHLIST_COLLECTION_NAME, "Record added to wishlist");
  }, [submitRecord]);

  const handleBack = useCallback(() => {
    const q = (locationState.query || "").trim();
    if (q) {
      navigate(`/search?tab=records&q=${encodeURIComponent(q)}`);
    } else {
      navigate("/search");
    }
  }, [navigate, locationState.query]);

  if (!album) {
    return null;
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
                  gap: 2,
                }}
              >
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                  variant="text"
                  sx={{ alignSelf: "flex-start" }}
                >
                  Back to Search
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
                {addError && <Alert severity="error">{addError}</Alert>}
              </Box>
              <Box
                sx={{
                  flexBasis: { md: "55%" },
                  flexGrow: 1,
                  p: { xs: 2, md: 3 },
                  mt: { xs: -1, md: 0 },
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
                  onReleaseYearChange={setReleaseYear}
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
