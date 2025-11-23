import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  CircularProgress,
  Button,
  ButtonBase,
  Stack,
  Avatar,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import apiUrl from "./api";
import { performLogout } from "./logout";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface GenreInterest {
  genre: string;
  rating: number | null;
  collectionPercent: number;
  recordCount: number;
}

const COLORS = [
  "#1976d2", // primary blue
  "#dc004e", // secondary pink
  "#9c27b0", // purple
  "#f57c00", // orange
  "#388e3c", // green
  "#d32f2f", // red
  "#0288d1", // light blue
  "#7b1fa2", // deep purple
  "#c2185b", // pink
  "#f9a825", // yellow
  "#00796b", // teal
  "#5d4037", // brown
  "#455a64", // blue grey
  "#e64a19", // deep orange
  "#689f38", // light green
];

export default function CommunityStats() {
  const navigate = useNavigate();
  const params = useParams<{ username: string }>();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const targetUsername = params.username ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [genreData, setGenreData] = useState<GenreInterest[]>([]);
  const [targetDisplayName, setTargetDisplayName] = useState<string>("");
  const [targetProfilePicUrl, setTargetProfilePicUrl] = useState<string | null>(
    null
  );
  const targetProfileAlt =
    targetDisplayName ?? targetUsername ?? "Record owner";
  const targetInitial = useMemo(() => {
    if (targetDisplayName) return targetDisplayName.charAt(0).toUpperCase();
    if (targetUsername) return targetUsername.charAt(0).toUpperCase();
    return "?";
  }, [targetDisplayName, targetUsername]);

  // Responsive chart sizing
  const chartHeight = isMobile ? 300 : isTablet ? 325 : 350;
  const chartRadius = isMobile ? 75 : isTablet ? 100 : 120;

  const handleOpenOwnerProfile = useCallback(() => {
    if (!targetUsername) return;
    navigate(`/community/${encodeURIComponent(targetUsername)}`);
  }, [navigate, targetUsername]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (info) {
        setUsername(info.username);
        setDisplayName(info.displayName ?? "");
        setProfilePicUrl(info.profilePicUrl ?? null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!targetUsername) {
      setError("Username is required");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(
          apiUrl(
            `/api/community/users/${encodeURIComponent(
              targetUsername
            )}/genre-interests`
          ),
          { credentials: "include" }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load genre interests");
        }

        const data = await res.json();
        if (cancelled) return;

        setGenreData(data.genres || []);
        setTargetDisplayName(data.displayName || targetUsername);
        setTargetProfilePicUrl(data.profilePicUrl || null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate(`/community/${encodeURIComponent(targetUsername)}`);
  }, [navigate, targetUsername]);

  const handleGenreClick = useCallback(
    (genreName: string) => {
      navigate(
        `/community/${encodeURIComponent(
          targetUsername
        )}/genre?g=${encodeURIComponent(genreName)}`
      );
    },
    [navigate, targetUsername]
  );

  const pieChartData = genreData
    .filter((g) => g.collectionPercent > 0)
    .map((g) => ({
      name: g.genre,
      value: g.collectionPercent,
      recordCount: g.recordCount,
      rating: g.rating,
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <Paper sx={{ p: 1.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {payload[0].name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {payload[0].value.toFixed(1)}% of collection
            <br />
            {payload[0].payload.recordCount === 1
              ? "1 record"
              : `${payload[0].payload.recordCount} records`}
            <br />
            {`Avg. Rating: ${payload[0].payload.rating}`}
          </Typography>
        </Paper>
      );
    }
    return null;
  };

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
          title="Stats"
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
                p: { xs: 2, md: 3 },
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ width: "100%" }}
              >
                <Button
                  variant="outlined"
                  startIcon={<ArrowBackIcon />}
                  onClick={handleBack}
                  sx={{ alignSelf: "flex-start", mb: 1.5, px: 1.9 }}
                >
                  Back
                </Button>

                <Box sx={{ ml: 2, minWidth: 0, mb: 1.5 }}>
                  <ButtonBase
                    onClick={handleOpenOwnerProfile}
                    sx={{
                      borderRadius: 1,
                      px: 1,
                      py: 0.5,
                      textAlign: "right",
                      "&:hover": {
                        bgcolor: "action.hover",
                      },
                      minWidth: 0,
                      maxWidth: "100%",
                    }}
                    aria-label={`View ${targetDisplayName}'s profile`}
                  >
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{ minWidth: 0 }}
                    >
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          fontWeight={600}
                          sx={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                          }}
                        >
                          {targetDisplayName ?? targetUsername}
                        </Typography>
                      </Stack>
                      <Avatar
                        src={
                          targetProfilePicUrl
                            ? targetProfilePicUrl.startsWith("http")
                              ? targetProfilePicUrl
                              : apiUrl(targetProfilePicUrl)
                            : undefined
                        }
                        alt={targetProfileAlt}
                        sx={{ width: 40, height: 40, flexShrink: 0 }}
                      >
                        {targetInitial}
                      </Avatar>
                    </Stack>
                  </ButtonBase>
                </Box>
              </Stack>

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
              ) : genreData.length === 0 ? (
                <Typography color="text.secondary" align="center" py={4}>
                  No genre data available
                </Typography>
              ) : (
                <Box>
                  {/* Pie Chart */}
                  <Box
                    sx={{
                      mb: 3,
                      outline: "none",
                      "& *": { outline: "none !important" },
                      "& path": { cursor: "pointer" },
                    }}
                  >
                    {pieChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(props: any) =>
                              `${props.name} (${props.value.toFixed(1)}%)`
                            }
                            outerRadius={chartRadius}
                            fill="#8884d8"
                            dataKey="value"
                            style={{ outline: "none" }}
                          >
                            {pieChartData.map((_entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={COLORS[index % COLORS.length]}
                                style={{ outline: "none" }}
                              />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <Typography color="text.secondary" align="center">
                        No genre distribution data
                      </Typography>
                    )}
                  </Box>

                  {/* Genre Ratings Table */}
                  <Paper sx={{ p: 3 }}>
                    <Typography variant="h6" sx={{ mb: 2 }}>
                      Average Ratings by Genre
                    </Typography>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                      }}
                    >
                      {genreData
                        .filter((g) => g.rating !== null)
                        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
                        .map((genre) => (
                          <Box
                            key={genre.genre}
                            onClick={() => handleGenreClick(genre.genre)}
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              p: 2,
                              bgcolor: "background.default",
                              borderRadius: 1,
                              cursor: "pointer",
                              transition: "background-color 0.2s",
                              "&:hover": {
                                bgcolor: "action.hover",
                              },
                            }}
                          >
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body1" fontWeight={600}>
                                {genre.genre}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {genre.collectionPercent.toFixed(1)}% of
                                collection
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                pl: 0.5,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 100,
                                  height: 8,
                                  bgcolor: "grey.800",
                                  borderRadius: 1,
                                  overflow: "hidden",
                                }}
                              >
                                <Box
                                  sx={{
                                    width: `${
                                      ((genre.rating || 0) / 10) * 100
                                    }%`,
                                    height: "100%",
                                    bgcolor: "primary.main",
                                  }}
                                />
                              </Box>
                              <Typography
                                variant="h6"
                                sx={{ minWidth: 45, textAlign: "right" }}
                              >
                                {genre.rating?.toFixed(1)}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      {genreData.filter((g) => g.rating !== null).length ===
                        0 && (
                        <Typography color="text.secondary" align="center">
                          No rated genres
                        </Typography>
                      )}
                    </Box>
                  </Paper>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
