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
} from "@mui/material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import apiUrl from "./api";
import { performLogout } from "./logout";
import { loadPublicUserProfile } from "./communityUsers";
import { fontSize } from "@mui/system";

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
                        All
                      </ToggleButton>
                      <ToggleButton
                        value="collection"
                        aria-label="collections"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Collections
                      </ToggleButton>
                      <ToggleButton
                        value="listened"
                        aria-label="listened"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Listened
                      </ToggleButton>
                      <ToggleButton
                        value="wishlist"
                        aria-label="wishlists"
                        sx={{ fontSize: "0.75em" }}
                      >
                        Wishlists
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
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
