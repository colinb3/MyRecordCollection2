/**
 * @author Colin Brown
 * @description Master record reviews page component for viewing and managing community reviews
 * @fileformat Page component
 */

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
  IconButton,
  Snackbar,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { darkTheme } from "../theme";
import apiUrl from "../api";
import CoverImage from "../components/CoverImage";
import { getCachedUserInfo, loadUserInfo } from "../userInfo";
import { setUserId } from "../analytics";
import { performLogout } from "../logout";
import { formatLocalDateTime } from "../dateUtils";
import type { MasterReviewEntry } from "../types";

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
type SortOption = "likes" | "date" | "friends";

function sortMasterReviews(
  entries: MasterReviewEntry[],
  sortOption: SortOption,
): MasterReviewEntry[] {
  const list = [...entries];
  const parseDate = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  };
  const compareByDate = (a: MasterReviewEntry, b: MasterReviewEntry) => {
    const delta = parseDate(b.added) - parseDate(a.added);
    if (delta !== 0) {
      return delta;
    }
    return b.recordId - a.recordId;
  };

  if (sortOption === "likes") {
    list.sort((a, b) => {
      if (b.reviewLikes !== a.reviewLikes) {
        return b.reviewLikes - a.reviewLikes;
      }
      return compareByDate(a, b);
    });
  } else if (sortOption === "friends") {
    list.sort((a, b) => {
      if (Number(b.isFriend) !== Number(a.isFriend)) {
        return Number(b.isFriend) - Number(a.isFriend);
      }
      return compareByDate(a, b);
    });
  } else {
    list.sort(compareByDate);
  }

  return list;
}

export default function MasterReviews() {
  const navigate = useNavigate();
  const location = useLocation();
  const { masterId: masterIdParam } = useParams<{ masterId?: string }>();
  const locationState =
    (location.state as ReviewsLocationState | undefined) ?? {};
  const cachedUser = getCachedUserInfo();

  const safeMasterId = useMemo(() => {
    if (!masterIdParam) return null;
    const trimmed = masterIdParam.trim();
    // Accept numeric masterId or 'r' prefixed release ID
    if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) {
      return trimmed;
    }
    if (/^r\d+$/i.test(trimmed) && Number(trimmed.slice(1)) > 0) {
      return trimmed.toLowerCase();
    }
    return null;
  }, [masterIdParam]);

  const [album, setAlbum] = useState<RecordListItem | null>(
    locationState.album ?? null,
  );
  const [masterRatingAverage, setMasterRatingAverage] = useState<number | null>(
    null,
  );
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? "",
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null,
  );
  const [userLoading, setUserLoading] = useState(!cachedUser);
  const [reviews, setReviews] = useState<MasterReviewEntry[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("loading");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("likes");
  const [likeBusy, setLikeBusy] = useState<Record<number, boolean>>({});
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });

  const normalizeProfilePicUrl = useCallback((raw: unknown): string | null => {
    if (typeof raw !== "string") {
      return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return apiUrl(normalizedPath);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
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
    [navigate],
  );

  const handleSortChange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: SortOption | null) => {
      if (!next || next === sortOption) {
        return;
      }
      if (next === "friends" && !username) {
        setSnackbar({
          open: true,
          message: "Log in to see friends' reviews.",
          severity: "info",
        });
        return;
      }
      setFetchStatus("loading");
      setFetchError(null);
      setSortOption(next);
    },
    [sortOption, username, setSnackbar, setFetchStatus, setFetchError],
  );

  const handleToggleReviewLike = useCallback(
    async (recordId: number) => {
      if (likeBusy[recordId]) {
        return;
      }

      const target = reviews.find((entry) => entry.recordId === recordId);
      if (!target) {
        return;
      }

      if (username && target.owner.username === username) {
        setSnackbar({
          open: true,
          message: "You can't like your own review.",
          severity: "info",
        });
        return;
      }

      setLikeBusy((prev) => ({ ...prev, [recordId]: true }));

      try {
        const method = target.likedByViewer ? "DELETE" : "POST";
        const response = await fetch(
          apiUrl(`/api/records/${recordId}/review/like`),
          {
            method,
            credentials: "include",
          },
        );

        if (response.status === 401) {
          setSnackbar({
            open: true,
            message: "Log in to like reviews.",
            severity: "error",
          });
          if (location.pathname !== "/login") {
            const next = encodeURIComponent(
              `${location.pathname}${location.search || ""}${
                location.hash || ""
              }`,
            );
            navigate(`/login?next=${next}`);
          }
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || "Failed to update review like");
        }

        let nextLikes = Number(body?.reviewLikes);
        if (!Number.isFinite(nextLikes)) {
          nextLikes = target.likedByViewer
            ? Math.max(0, target.reviewLikes - 1)
            : target.reviewLikes + 1;
        }
        const normalizedLikes = Number.isFinite(nextLikes) ? nextLikes : 0;
        const nextLiked =
          typeof body?.liked === "boolean" ? body.liked : !target.likedByViewer;

        setReviews((prev) => {
          const updated = prev.map((entry) =>
            entry.recordId === recordId
              ? {
                  ...entry,
                  reviewLikes: normalizedLikes,
                  likedByViewer: nextLiked,
                }
              : entry,
          );
          return sortMasterReviews(updated, sortOption);
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update review like";
        setSnackbar({ open: true, message, severity: "error" });
      } finally {
        setLikeBusy((prev) => {
          if (!prev[recordId]) return prev;
          const next = { ...prev };
          delete next[recordId];
          return next;
        });
      }
    },
    [likeBusy, reviews, username, navigate, location, setSnackbar, sortOption],
  );

  const handleSnackbarClose = useCallback(
    (_: unknown, reason?: string) => {
      if (reason === "clickaway") {
        return;
      }
      setSnackbar((prev) => ({ ...prev, open: false }));
    },
    [setSnackbar],
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
    setLikeBusy({});

    (async () => {
      try {
        const res = await fetch(
          apiUrl(
            `/api/records/master-reviews?masterId=${safeMasterId}&sort=${encodeURIComponent(
              sortOption,
            )}`,
          ),
          { credentials: "include" },
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
            Math.round(ratingAverageFromResponse * 10) / 10,
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
                const reviewLikesRaw =
                  typeof value.reviewLikes === "number"
                    ? value.reviewLikes
                    : Number(value.reviewLikes);
                const likedByViewerRaw = value.likedByViewer;
                const isFriendRaw = value.isFriend;
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
                  reviewLikes: Number.isFinite(reviewLikesRaw)
                    ? reviewLikesRaw
                    : 0,
                  likedByViewer:
                    typeof likedByViewerRaw === "boolean"
                      ? likedByViewerRaw
                      : Boolean(likedByViewerRaw),
                  isFriend:
                    typeof isFriendRaw === "boolean"
                      ? isFriendRaw
                      : Boolean(isFriendRaw),
                  owner: {
                    username,
                    displayName:
                      typeof ownerValue.displayName === "string"
                        ? ownerValue.displayName
                        : null,
                    profilePicUrl: normalizeProfilePicUrl(
                      ownerValue.profilePicUrl,
                    ),
                  },
                };
                return entry;
              })
              .filter(
                (entry: MasterReviewEntry | null): entry is MasterReviewEntry =>
                  entry !== null,
              )
          : [];
        setReviews(sortMasterReviews(normalized, sortOption));
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
  }, [safeMasterId, normalizeProfilePicUrl, sortOption]);

  const dateTimeFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const handleBack = useCallback(() => {
    // Simply use browser history for consistent back navigation
    navigate(-1);
  }, [navigate]);

  const coverUrl = album?.cover && album.cover.trim() ? album.cover.trim() : "";
  const title = album?.record || "Master Reviews";
  const subtitle = album?.artist ? `by ${album.artist}` : "";
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
          minHeight: "100vh",
        }}
      >
        <TopBar
          title="Reviews"
          onLogout={handleLogout}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          loading={userLoading}
        />

        <Box sx={{ flex: 1, overflowY: "auto", pb: 4, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: 1 }}>
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
                    sx={{
                      width: { xs: 125, sm: 150, md: 175 },
                      height: { xs: 125, sm: 150, md: 175 },
                      borderRadius: 2,
                      boxShadow: 2,
                    }}
                  >
                    <CoverImage
                      src={coverUrl}
                      alt={album?.record || "Album cover"}
                      variant="rounded"
                      iconSize="large"
                      sx={{
                        width: { xs: 125, sm: 150, md: 175 },
                        height: { xs: 125, sm: 150, md: 175 },
                        borderRadius: 2,
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                      {title}
                    </Typography>
                    {subtitle && (
                      <Typography
                        variant="subtitle1"
                        color="text.secondary"
                        gutterBottom
                      >
                        {subtitle}
                      </Typography>
                    )}
                    {masterRatingAverage !== null && (
                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Rating: <b>{masterRatingAverage.toFixed(1)}</b>
                      </Typography>
                    )}
                  </Box>
                </Stack>
                <Divider sx={{ my: 2.5 }} />
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: { xs: "flex-start", sm: "flex-end" },
                    mb: 2,
                  }}
                >
                  <ToggleButtonGroup
                    value={sortOption}
                    exclusive
                    onChange={handleSortChange}
                    size="small"
                    aria-label="Sort reviews"
                  >
                    <ToggleButton value="likes" aria-label="Sort by likes">
                      Likes
                    </ToggleButton>
                    <ToggleButton value="date" aria-label="Sort by newest">
                      Newest
                    </ToggleButton>
                    <ToggleButton
                      value="friends"
                      aria-label="Sort by friends"
                      disabled={!username}
                    >
                      Friends
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
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
                      const isOwnReview =
                        Boolean(username) && entry.owner.username === username;
                      const likeButtonDisabled =
                        isOwnReview || Boolean(likeBusy[entry.recordId]);
                      return (
                        <Paper
                          key={`${entry.recordId}-${entry.owner.username}-${entry.added}`}
                          variant="outlined"
                          sx={{ p: { xs: 1.75, md: 2.25 }, borderRadius: 2 }}
                        >
                          <Stack
                            direction={"row"}
                            alignItems={"center"}
                            justifyContent="space-between"
                            spacing={{ xs: 1, sm: 1.5 }}
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
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={1}
                              sx={{ alignSelf: "auto" }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                noWrap
                                sx={{ maxWidth: 160 }}
                              >
                                {addedText}
                              </Typography>
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={-0.5}
                              >
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    handleToggleReviewLike(entry.recordId)
                                  }
                                  disabled={likeButtonDisabled}
                                  aria-pressed={entry.likedByViewer}
                                  aria-label={
                                    entry.likedByViewer
                                      ? "Unlike review"
                                      : "Like review"
                                  }
                                  sx={{
                                    color: entry.likedByViewer
                                      ? "error.main"
                                      : "text.secondary",
                                    "&.Mui-disabled": {
                                      color: entry.likedByViewer
                                        ? "error.dark"
                                        : "action.disabled",
                                    },
                                  }}
                                >
                                  {entry.likedByViewer ? (
                                    <FavoriteIcon fontSize="small" />
                                  ) : (
                                    <FavoriteBorderIcon fontSize="small" />
                                  )}
                                </IconButton>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ minWidth: 20, textAlign: "center" }}
                                >
                                  {entry.reviewLikes}
                                </Typography>
                              </Stack>
                            </Stack>
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
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
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
    </ThemeProvider>
  );
}
