import { useState, useEffect, useCallback } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
  Avatar,
  Divider,
  Tooltip,
  Stack,
  Button,
} from "@mui/material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import apiUrl from "./api";
import { performLogout } from "./logout";
import { loadPublicUserProfile } from "./communityUsers";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";

type CollectionFilter = "all" | "collection" | "listened" | "wishlist";

interface ComparedRecord {
  id: number;
  masterId: number;
  record: string;
  artist: string;
  cover: string | null;
  myRating: number;
  theirRating: number;
  myCollection?: string;
  theirCollection?: string;
}

interface GenreInterest {
  genre: string;
  rating: number | null;
  collectionPercent: number;
}

interface GenreComparison {
  genre: string;
  myRating: number | null;
  theirRating: number | null;
  myPercent: number;
  theirPercent: number;
}

export default function Compare() {
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
  const profileInitial = (displayName || username || "?")
    .charAt(0)
    .toUpperCase();

  const targetUsername = params.username ?? "";

  // Get initial filter from URL query param
  const urlFilter = searchParams.get("filter") as CollectionFilter | null;
  const initialFilter: CollectionFilter =
    urlFilter &&
    ["all", "collection", "listened", "wishlist"].includes(urlFilter)
      ? urlFilter
      : "all";

  const [filter, setFilter] = useState<CollectionFilter>(initialFilter);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ComparedRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetProfilePic, setTargetProfilePic] = useState<string | null>(null);
  const [targetDisplayName, setTargetDisplayName] = useState<string>("");
  const [genreComparisons, setGenreComparisons] = useState<GenreComparison[]>(
    []
  );
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);

  const targetProfileAlt =
    targetDisplayName || targetUsername || "Record owner";
  const targetInitial = (targetDisplayName || targetUsername || "?")
    .charAt(0)
    .toUpperCase();

  const handleBack = useCallback(() => {
    // Simply use browser history for consistent back navigation
    navigate(-1);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (!info) {
        const next = encodeURIComponent(`/community/${targetUsername}/compare`);
        navigate(`/login?next=${next}`, { replace: true });
        return;
      }
      setUsername(info.username);
      setDisplayName(info.displayName ?? "");
      setProfilePicUrl(info.profilePicUrl ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, targetUsername]);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const fetchComparedRecords = useCallback(async () => {
    if (!username || !targetUsername) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        apiUrl(
          `/api/compare/${encodeURIComponent(targetUsername)}?filter=${filter}`
        ),
        {
          credentials: "include",
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load comparison");
      }

      const data = await res.json();
      setRecords(Array.isArray(data.records) ? data.records : []);
    } catch (err) {
      console.error("Failed to load comparison", err);
      setError(
        err instanceof Error ? err.message : "Failed to load comparison"
      );
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [username, targetUsername, filter]);

  useEffect(() => {
    if (username && targetUsername) {
      fetchComparedRecords();
    }
  }, [username, targetUsername, filter, fetchComparedRecords]);

  useEffect(() => {
    if (!targetUsername) return;

    let cancelled = false;

    (async () => {
      try {
        const profile = await loadPublicUserProfile(targetUsername, false);
        if (!cancelled) {
          setTargetProfilePic(profile.profilePicUrl || null);
          setTargetDisplayName(profile.displayName || "");
        }
      } catch (err) {
        console.error("Failed to load target user profile", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

  const handleFilterChange = (
    _event: React.MouseEvent<HTMLElement>,
    newFilter: CollectionFilter | null
  ) => {
    if (newFilter !== null) {
      setFilter(newFilter);
    }
  };

  const fetchGenreComparisons = useCallback(async () => {
    if (!username || !targetUsername) return;

    console.log("🎵 fetchGenreComparisons START", { username, targetUsername });
    setLoadingGenres(true);
    setGenreError(null);

    try {
      const res = await fetch(
        apiUrl(`/api/compare/${encodeURIComponent(targetUsername)}/genres`),
        { credentials: "include" }
      );

      console.log("🎵 Genre fetch response:", res.status, res.ok);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load genre comparison");
      }

      const data = await res.json();
      console.log("🎵 Genre data received:", data);

      const myGenres: Record<string, GenreInterest> = {};
      const theirGenres: Record<string, GenreInterest> = {};

      // Map my genres
      if (Array.isArray(data.myGenres)) {
        data.myGenres.forEach((g: GenreInterest) => {
          myGenres[g.genre] = {
            genre: g.genre,
            rating: g.rating !== null ? Number(g.rating) : null,
            collectionPercent: Number(g.collectionPercent),
          };
        });
      }

      // Map their genres
      if (Array.isArray(data.theirGenres)) {
        data.theirGenres.forEach((g: GenreInterest) => {
          theirGenres[g.genre] = {
            genre: g.genre,
            rating: g.rating !== null ? Number(g.rating) : null,
            collectionPercent: Number(g.collectionPercent),
          };
        });
      }

      // Get all unique genres from both users
      const allGenres = new Set<string>([
        ...Object.keys(myGenres),
        ...Object.keys(theirGenres),
      ]);

      console.log("🎵 All genres:", Array.from(allGenres));

      // Create comparison array for all genres
      const comparisons: GenreComparison[] = Array.from(allGenres).map(
        (genre) => ({
          genre,
          myRating: myGenres[genre]?.rating ?? null,
          theirRating: theirGenres[genre]?.rating ?? null,
          myPercent: myGenres[genre]?.collectionPercent ?? 0,
          theirPercent: theirGenres[genre]?.collectionPercent ?? 0,
        })
      );

      console.log("🎵 Comparisons created:", comparisons);

      // Sort by combined presence (sum of both percentages)
      comparisons.sort((a, b) => {
        const aTotal = a.myPercent + a.theirPercent;
        const bTotal = b.myPercent + b.theirPercent;
        return bTotal - aTotal;
      });

      console.log("🎵 Setting genreComparisons, count:", comparisons.length);
      setGenreComparisons(comparisons);
    } catch (err) {
      console.error("🎵 Failed to load genre comparison", err);
      setGenreError(
        err instanceof Error ? err.message : "Failed to load genre comparison"
      );
      setGenreComparisons([]);
    } finally {
      console.log("🎵 fetchGenreComparisons DONE");
      setLoadingGenres(false);
    }
  }, [username, targetUsername]);

  useEffect(() => {
    if (username && targetUsername) {
      fetchGenreComparisons();
    }
  }, [username, targetUsername, fetchGenreComparisons]);

  console.log("🎵 Compare component render", {
    username,
    targetUsername,
    loading,
    error,
    recordsCount: records.length,
    loadingGenres,
    genreError,
    genreComparisonsCount: genreComparisons.length,
  });

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflowY: "hidden",
        }}
      >
        <TopBar
          onLogout={handleLogout}
          title={`Compare`}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
        />

        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                height: { md: "100%" },
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: { xs: 2, md: 3 },
                }}
              >
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{ width: "100%", mb: 1 }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    onClick={handleBack}
                    sx={{ alignSelf: "flex-start", mb: 1.5, px: 1.9 }}
                  >
                    Back
                  </Button>
                  <Stack direction={"row"} alignItems={"center"} spacing={1.25}>
                    <Avatar
                      src={
                        profilePicUrl
                          ? profilePicUrl.startsWith("http")
                            ? profilePicUrl
                            : apiUrl(profilePicUrl)
                          : undefined
                      }
                      alt={profilePicUrl ? displayName || username : "Profile"}
                      onClick={() =>
                        navigate(`/community/${encodeURIComponent(username)}`)
                      }
                      sx={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        bgcolor: "grey.700",
                        "&:hover": {
                          opacity: 0.8,
                        },
                        cursor: "pointer",
                      }}
                    >
                      {profileInitial}
                    </Avatar>
                    <CompareArrowsIcon />
                    <Avatar
                      src={
                        targetProfilePic
                          ? targetProfilePic.startsWith("http")
                            ? targetProfilePic
                            : apiUrl(targetProfilePic)
                          : undefined
                      }
                      alt={targetProfileAlt}
                      onClick={() =>
                        navigate(
                          `/community/${encodeURIComponent(targetUsername)}`
                        )
                      }
                      sx={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        bgcolor: "grey.700",
                        "&:hover": {
                          opacity: 0.8,
                        },
                        cursor: "pointer",
                      }}
                    >
                      {targetInitial}
                    </Avatar>
                  </Stack>
                </Stack>

                <Paper
                  sx={{
                    p: 2,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 2,
                      flexWrap: "wrap",
                      gap: 1,
                    }}
                  >
                    <Typography variant="h6">You Both Have</Typography>
                    <ToggleButtonGroup
                      value={filter}
                      exclusive
                      onChange={handleFilterChange}
                      size="small"
                      aria-label="collection filter"
                      sx={{ flexWrap: "wrap" }}
                    >
                      <ToggleButton
                        value="all"
                        aria-label="all collections"
                        sx={{ fontSize: "0.75em" }}
                      >
                        All{" "}
                        {filter === "all" && !loading && `(${records.length})`}
                      </ToggleButton>
                      <ToggleButton
                        value="collection"
                        aria-label="collection"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Collection{" "}
                        {filter === "collection" &&
                          !loading &&
                          `(${records.length})`}
                      </ToggleButton>
                      <ToggleButton
                        value="listened"
                        aria-label="listened"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Listened{" "}
                        {filter === "listened" &&
                          !loading &&
                          `(${records.length})`}
                      </ToggleButton>
                      <ToggleButton
                        value="wishlist"
                        aria-label="wishlist"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Wishlist{" "}
                        {filter === "wishlist" &&
                          !loading &&
                          `(${records.length})`}
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {loading ? (
                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      py={8}
                    >
                      <CircularProgress />
                    </Box>
                  ) : error ? (
                    <Typography color="error" align="center" py={4}>
                      {error}
                    </Typography>
                  ) : records.length === 0 ? (
                    <Typography color="text.secondary" align="center" py={4}>
                      No records in common
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        display: "flex",
                        gap: 2,
                        overflowX: "auto",
                        pb: 2,
                        "&::-webkit-scrollbar": {
                          height: 8,
                        },
                      }}
                    >
                      {records.map((record) => (
                        <Box
                          key={record.id}
                          sx={{
                            minWidth: { xs: 140, sm: 160, md: 180 },
                            maxWidth: { xs: 140, sm: 160, md: 180 },
                            cursor: "pointer",
                            "&:hover": {
                              "& .cover-image": {
                                transform: "scale(1.05)",
                              },
                            },
                          }}
                          onClick={() => navigate(`/master/${record.masterId}`)}
                        >
                          <Box
                            sx={{
                              position: "relative",
                              width: "100%",
                              paddingTop: "100%",
                              mb: 0.75,
                              overflow: "hidden",
                              borderRadius: 1,
                              bgcolor: "grey.800",
                            }}
                          >
                            <img
                              src={record.cover || undefined}
                              alt={record.record}
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                transition: "transform 0.2s ease-in-out",
                              }}
                              className="cover-image"
                            />
                          </Box>
                          <Box sx={{ pl: 0.5 }}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {record.record}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                                mb: 1,
                              }}
                            >
                              {record.artist}
                            </Typography>
                            <Box
                              sx={{
                                display: "flex",
                                gap: 1.25,
                                alignItems: "center",
                              }}
                            >
                              {record.myRating > 0 && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                  }}
                                >
                                  <Tooltip title="You">
                                    <Avatar
                                      src={profilePicUrl || undefined}
                                      sx={{ width: 20, height: 20 }}
                                    />
                                  </Tooltip>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {record.myRating}/10
                                  </Typography>
                                </Box>
                              )}
                              {record.theirRating > 0 && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                  }}
                                >
                                  <Tooltip title={targetUsername}>
                                    <Avatar
                                      src={targetProfilePic || undefined}
                                      sx={{ width: 20, height: 20 }}
                                    />
                                  </Tooltip>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                  >
                                    {record.theirRating}/10
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                            {filter === "all" &&
                              (record.myCollection ||
                                record.theirCollection) && (
                                <>
                                  <Divider sx={{ my: 1 }} />
                                  <Box
                                    sx={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 0.75,
                                    }}
                                  >
                                    {record.myCollection && (
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.5,
                                        }}
                                      >
                                        <Tooltip title="You">
                                          <Avatar
                                            src={profilePicUrl || undefined}
                                            sx={{ width: 20, height: 20 }}
                                          />
                                        </Tooltip>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          fontSize="0.7rem"
                                        >
                                          {record.myCollection}
                                        </Typography>
                                      </Box>
                                    )}
                                    {record.theirCollection && (
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.5,
                                        }}
                                      >
                                        <Tooltip title={targetUsername}>
                                          <Avatar
                                            src={targetProfilePic || undefined}
                                            sx={{ width: 20, height: 20 }}
                                          />
                                        </Tooltip>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          fontSize="0.7rem"
                                        >
                                          {record.theirCollection}
                                        </Typography>
                                      </Box>
                                    )}
                                  </Box>
                                </>
                              )}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Paper>
              </Box>
            </Paper>

            {/* Genre Comparison Section */}
            <Paper variant="outlined" sx={{ borderRadius: 2, mt: 2, p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Genre Makeup and Average Rating
              </Typography>

              {loadingGenres ? (
                <Box
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  py={4}
                >
                  <CircularProgress size={24} />
                </Box>
              ) : genreError ? (
                <Typography color="error" align="center" py={2}>
                  {genreError}
                </Typography>
              ) : genreComparisons.length === 0 ? (
                <Typography color="text.secondary" align="center" py={2}>
                  No genre data available
                </Typography>
              ) : (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
                >
                  {genreComparisons
                    .filter((g) => g.myPercent > 0 || g.theirPercent > 0)
                    .map((genre) => (
                      <Box key={genre.genre}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 0.5,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 500, minWidth: 180 }}
                          >
                            {genre.genre}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              gap: 2,
                              alignItems: "center",
                            }}
                          >
                            {genre.myRating !== null && (
                              <Tooltip title="Your avg rating">
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                  }}
                                >
                                  <Avatar
                                    src={profilePicUrl || undefined}
                                    sx={{ width: 20, height: 20 }}
                                  >
                                    {profileInitial}
                                  </Avatar>
                                  <Typography
                                    variant="caption"
                                    sx={{ minWidth: 28 }}
                                  >
                                    {genre.myRating.toFixed(1)}
                                  </Typography>
                                </Box>
                              </Tooltip>
                            )}
                            {genre.theirRating !== null && (
                              <Tooltip title={`${targetUsername}'s avg rating`}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                  }}
                                >
                                  <Avatar
                                    src={targetProfilePic || undefined}
                                    sx={{ width: 20, height: 20 }}
                                  >
                                    {targetInitial}
                                  </Avatar>
                                  <Typography
                                    variant="caption"
                                    sx={{ minWidth: 28 }}
                                  >
                                    {genre.theirRating.toFixed(1)}
                                  </Typography>
                                </Box>
                              </Tooltip>
                            )}
                          </Box>
                        </Box>
                        <Box
                          sx={{
                            display: "flex",
                            gap:
                              genre.myPercent > 0 && genre.theirPercent > 0
                                ? 1
                                : 0,
                            alignItems: "center",
                          }}
                        >
                          {genre.myPercent > 0 && (
                            <Tooltip title="You">
                              <Box
                                sx={{
                                  flex: genre.myPercent,
                                  minWidth: 20,
                                  height: 24,
                                  bgcolor: "primary.main",
                                  borderRadius: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {genre.myPercent > 0 && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "primary.contrastText",
                                      fontSize: "0.7rem",
                                    }}
                                  >
                                    {genre.myPercent.toFixed(0)}%
                                  </Typography>
                                )}
                              </Box>
                            </Tooltip>
                          )}
                          {genre.theirPercent > 0 && (
                            <Tooltip title={targetUsername}>
                              <Box
                                sx={{
                                  flex: genre.theirPercent,
                                  minWidth: 20,
                                  height: 24,
                                  bgcolor: "secondary.main",
                                  borderRadius: 1,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {genre.theirPercent >= 3 && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: "secondary.contrastText",
                                      fontSize: "0.7rem",
                                    }}
                                  >
                                    {genre.theirPercent.toFixed(0)}%
                                  </Typography>
                                )}
                              </Box>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                    ))}
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
