import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Avatar,
  CircularProgress,
  Divider,
  Alert,
  ButtonBase,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import apiUrl from "./api";
import placeholderCover from "./assets/missingImg.jpg";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCommunityCaches } from "./communityUsers";
import { setUserId } from "./analytics";
import { formatLocalDateTime } from "./dateUtils";
import type { MasterReviewEntry } from "./types";

interface RecordListItem {
  id: string;
  record: string;
  artist: string;
  cover: string;
}

interface ReviewsLocationState {
  album?: RecordListItem;
  query?: string;
  fromCollection?: {
    path: string;
    title?: string;
    tableName?: string;
  };
  fromMaster?: {
    path: string;
  };
}

type FetchStatus = "loading" | "ready" | "empty" | "error";

export default function MasterReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { masterId: masterIdParam } = useParams<{ masterId?: string }>();
  const locationState =
    (location.state as ReviewsLocationState | undefined) ?? {};
  const cachedUser = getCachedUserInfo();
  const fromMasterPath =
    typeof locationState.fromMaster?.path === "string"
      ? locationState.fromMaster.path
      : null;

  const safeMasterId = useMemo(() => {
    if (!masterIdParam) return null;
    const numeric = Number(masterIdParam);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }, [masterIdParam]);

  const [album, setAlbum] = useState<RecordListItem | null>(
    locationState.album ?? null
  );
  const [masterRatingAverage, setMasterRatingAverage] = useState<number | null>(
    null
  );
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [reviews, setReviews] = useState<MasterReviewEntry[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading");
  const [fetchError, setFetchError] = useState<string | null>(null);

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

  const handleOwnerClick = useCallback(
    (event: MouseEvent, ownerUsername: string) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(`/community/${encodeURIComponent(ownerUsername)}`);
    },
    [navigate]
  );

  useEffect(() => {
    if (!safeMasterId) {
      setFetchStatus("error");
      setFetchError("Invalid master record");
      return;
    }

    let cancelled = false;
    setFetchStatus("loading");
    setFetchError(null);

    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/records/master-reviews?masterId=${safeMasterId}`),
          { credentials: "include" }
        );
        if (!res.ok) {
          let message = "Failed to load reviews";
          try {
            const body = await res.json();
            if (body?.error) {
              message = body.error;
            }
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }
        const data = await res.json();
        if (cancelled) return;
        const masterRecord =
          typeof data?.record === "string" && data.record.trim()
            ? data.record.trim()
            : null;
        const masterArtist =
          typeof data?.artist === "string" && data.artist.trim()
            ? data.artist.trim()
            : null;
        const masterCover =
          typeof data?.cover === "string" && data.cover.trim()
            ? data.cover.trim()
            : null;
        setAlbum((previous) => ({
          id: previous?.id ?? `master-${safeMasterId}`,
          record: masterRecord ?? previous?.record ?? "Unknown Record",
          artist: masterArtist ?? previous?.artist ?? "Unknown Artist",
          cover: masterCover ?? previous?.cover ?? "",
        }));
        // Prefer ratingAverage from reviews response if present
        const ratingAverageFromResponse =
          data && typeof data.ratingAverage === "number"
            ? Number(data.ratingAverage)
            : null;
        if (
          ratingAverageFromResponse !== null &&
          Number.isFinite(ratingAverageFromResponse)
        ) {
          setMasterRatingAverage(
            Math.round(ratingAverageFromResponse * 10) / 10
          );
        }

        const normalized: MasterReviewEntry[] = Array.isArray(data?.reviews)
          ? data.reviews
              .map((raw: unknown) => {
                if (!raw || typeof raw !== "object") return null;
                const value = raw as Record<string, unknown>;
                const reviewText =
                  typeof value.review === "string" ? value.review.trim() : "";
                if (!reviewText) return null;
                const ownerRaw = value.owner;
                if (!ownerRaw || typeof ownerRaw !== "object") return null;
                const ownerValue = ownerRaw as Record<string, unknown>;
                const username =
                  typeof ownerValue.username === "string"
                    ? ownerValue.username
                    : null;
                if (!username) return null;
                const entry: MasterReviewEntry = {
                  recordId: Number(value.recordId) || 0,
                  record: typeof value.record === "string" ? value.record : "",
                  artist: typeof value.artist === "string" ? value.artist : "",
                  cover:
                    typeof value.cover === "string" && value.cover
                      ? value.cover
                      : null,
                  rating:
                    typeof value.rating === "number" &&
                    Number.isFinite(value.rating)
                      ? value.rating
                      : null,
                  review: reviewText,
                  added: typeof value.added === "string" ? value.added : "",
                  owner: {
                    username,
                    displayName:
                      typeof ownerValue.displayName === "string"
                        ? ownerValue.displayName
                        : null,
                    profilePicUrl:
                      typeof ownerValue.profilePicUrl === "string"
                        ? ownerValue.profilePicUrl
                        : null,
                  },
                };
                return entry;
              })
              .filter(
                (entry: MasterReviewEntry | null): entry is MasterReviewEntry =>
                  entry !== null
              )
          : [];
        setReviews(normalized);
        setFetchStatus(normalized.length > 0 ? "ready" : "empty");
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Failed to load reviews";
        setFetchError(message);
        setFetchStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [safeMasterId]);

  const dateTimeFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearCommunityCaches();
    clearUserInfoCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore */
    }
    navigate("/login");
  }, [navigate]);

  const handleBack = useCallback(() => {
    if (fromMasterPath) {
      navigate(fromMasterPath);
      return;
    }
    if (safeMasterId) {
      navigate(`/master/${safeMasterId}`);
    } else {
      navigate("/search");
    }
  }, [navigate, fromMasterPath, safeMasterId]);

  const coverSrc =
    album?.cover && album.cover.trim() ? album.cover : placeholderCover;
  const title = album?.record || "Master Reviews";
  const subtitle = album?.artist ? `by ${album.artist}` : "";

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
          title="Reviews"
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
            px: 1,
          }}
        >
          <Box
            maxWidth={800}
            mx="auto"
            sx={{ height: { md: "100%" }, pb: { xs: 4, sm: 0 } }}
          >
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box sx={{ p: { xs: 2, md: 3 } }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                  variant="outlined"
                  sx={{ alignSelf: "flex-start", mb: 1.5 }}
                >
                  Back
                </Button>
                <Stack
                  direction={{ xs: "row" }}
                  spacing={{ xs: 2, md: 3 }}
                  alignItems={{ xs: "flex-start" }}
                >
                  <Box
                    component="img"
                    src={coverSrc}
                    alt={album?.record ?? "Album cover"}
                    sx={{
                      width: { xs: 125, sm: 150, md: 175 },
                      height: { xs: 125, sm: 150, md: 175 },
                      borderRadius: 2,
                      objectFit: "cover",
                      boxShadow: 2,
                      bgcolor: "grey.900",
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                      {title}
                    </Typography>
                    {subtitle && (
                      <Typography variant="subtitle1" color="text.secondary">
                        {subtitle}
                      </Typography>
                    )}
                    {masterRatingAverage !== null && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Rating: {masterRatingAverage.toFixed(1)}
                      </Typography>
                    )}
                  </Box>
                </Stack>
                <Divider sx={{ my: 2.5 }} />
                {fetchStatus === "loading" && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 180,
                    }}
                  >
                    <CircularProgress size={32} />
                  </Box>
                )}
                {fetchStatus === "error" && (
                  <Alert severity="error">{fetchError}</Alert>
                )}
                {fetchStatus === "empty" && (
                  <Typography color="text.secondary">
                    No community reviews yet. Be the first to leave one!
                  </Typography>
                )}
                {fetchStatus === "ready" && (
                  <Stack spacing={2.5}>
                    {reviews.map((entry) => {
                      const ownerDisplay = entry.owner.displayName?.trim()
                        ? entry.owner.displayName.trim()
                        : `@${entry.owner.username}`;
                      const addedText =
                        formatLocalDateTime(entry.added, dateTimeFormatter) ??
                        "Unknown date";
                      const ratingText =
                        entry.rating && entry.rating > 0
                          ? `${entry.rating}/10`
                          : null;
                      const avatarSrc = entry.owner.profilePicUrl ?? undefined;
                      const avatarInitial = ownerDisplay
                        .trim()
                        .charAt(0)
                        .toUpperCase();
                      return (
                        <Paper
                          key={`${entry.recordId}-${entry.owner.username}-${entry.added}`}
                          variant="outlined"
                          sx={{ p: { xs: 1.75, md: 2.25 }, borderRadius: 2 }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                          >
                            <ButtonBase
                              onClick={(event) =>
                                handleOwnerClick(event, entry.owner.username)
                              }
                              sx={{
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
                              <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                sx={{ minWidth: 0 }}
                              >
                                <Avatar
                                  src={avatarSrc}
                                  alt={ownerDisplay}
                                  sx={{ bgcolor: "grey.700" }}
                                >
                                  {!avatarSrc && avatarInitial}
                                </Avatar>
                                <Typography fontWeight={600} noWrap>
                                  {ownerDisplay}
                                </Typography>
                              </Stack>
                            </ButtonBase>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                            >
                              {addedText}
                            </Typography>
                          </Stack>
                          <Divider sx={{ my: 1.5 }} />
                          {ratingText && (
                            <Typography
                              variant="body1"
                              color="text.secondary"
                              mb={1}
                            >
                              Rating: {ratingText}
                            </Typography>
                          )}
                          <Typography sx={{ whiteSpace: "pre-wrap" }}>
                            {entry.review}
                          </Typography>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
