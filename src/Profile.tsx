import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Avatar,
  Button,
  LinearProgress,
  IconButton,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useNavigate } from "react-router-dom";
import apiUrl from "./api";
import { darkTheme } from "./theme";
import TopBar from "./components/TopBar";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { setUserId } from "./analytics";
import {
  loadProfileHighlights,
  clearProfileHighlightsCache,
} from "./profileHighlights";
import { clearCollectionRecordsCache } from "./collectionRecords";
import { loadRecentRecords } from "./profileRecentRecords";
import type { Record } from "./types";
import placeholderCover from "./assets/missingImg.jpg";
import SettingsIcon from "@mui/icons-material/Settings";

const PREVIEW_LIMIT = 4;

interface ProfileSectionProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

function ProfileSection({ title, action, children }: ProfileSectionProps) {
  return (
    <Paper
      sx={{
        p: { xs: 2, md: 3 },
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography variant="h6">{title}</Typography>
        {action}
      </Box>
      {children}
    </Paper>
  );
}

interface RecordPreviewGridProps {
  records: Record[];
  keyPrefix?: string;
}

function RecordPreviewGrid({ records, keyPrefix }: RecordPreviewGridProps) {
  return (
    <Grid container spacing={2} maxWidth={800}>
      {records.map((record) => {
        const coverSrc = record.cover || placeholderCover;
        const key = keyPrefix ? `${keyPrefix}-${record.id}` : record.id;
        return (
          <Grid size={{ xs: 6, sm: 3 }} key={key}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  backgroundColor: "grey.900",
                }}
              >
                <Box
                  component="img"
                  src={coverSrc}
                  alt={record.record}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Box>
              <Box sx={{ p: 1.5 }}>
                <Typography variant="subtitle1" noWrap>
                  {record.record}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {record.artist}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [favouriteRecords, setFavouriteRecords] = useState<Record[]>([]);
  const [loadingFavourites, setLoadingFavourites] = useState<boolean>(true);
  const [recentRecords, setRecentRecords] = useState<Record[]>([]);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(true);

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
    let cancelled = false;

    const loadRecords = async () => {
      setLoadingFavourites(true);
      try {
        const highlights = await loadProfileHighlights();
        if (cancelled) return;

        if (highlights && highlights.records.length > 0) {
          setFavouriteRecords(highlights.records.slice(0, PREVIEW_LIMIT));
        } else {
          setFavouriteRecords([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load profile highlights", error);
          setFavouriteRecords([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingFavourites(false);
        }
      }
    };

    loadRecords();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRecents = async () => {
      setLoadingRecent(true);
      try {
        const recents = await loadRecentRecords();
        if (cancelled) return;
        setRecentRecords(recents);
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load recent records", error);
          setRecentRecords([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingRecent(false);
        }
      }
    };

    loadRecents();

    return () => {
      cancelled = true;
    };
  }, []);

  const favouritePreviewRecords = useMemo(
    () => favouriteRecords.slice(0, PREVIEW_LIMIT),
    [favouriteRecords]
  );

  const recentPreviewRecords = useMemo(
    () => recentRecords.slice(0, PREVIEW_LIMIT),
    [recentRecords]
  );

  const handleLogout = async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    clearProfileHighlightsCache();
    clearCollectionRecordsCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore */
    }
    navigate("/login");
  };

  const handleOpenProfileSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const isOwnProfile = true;

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          p: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title="Profile"
          username={username}
          displayName={displayName}
          onLogout={handleLogout}
          searchBar={false}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, px: 1 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Paper
                sx={{
                  p: { xs: 2, md: 3 },
                  borderRadius: 2,
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  alignItems: { xs: "flex-start", sm: "center" },
                  gap: 3,
                }}
              >
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 120,
                    height: 120,
                    bgcolor: "grey.700",
                  }}
                />
                <Box>
                  <Typography variant="h4" gutterBottom>
                    {displayName || username || "Your Profile"}
                  </Typography>
                  <Typography variant="subtitle1" color="text.secondary">
                    @{username}
                  </Typography>
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <ProfileSection
                title="Favourites"
                action={
                  isOwnProfile ? (
                    <IconButton
                      color="inherit"
                      size="small"
                      aria-label="Open profile settings"
                      onClick={handleOpenProfileSettings}
                    >
                      <SettingsIcon fontSize="small" />
                    </IconButton>
                  ) : undefined
                }
              >
                {loadingFavourites ? (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress />
                  </Box>
                ) : favouritePreviewRecords.length === 0 ? (
                  <Typography color="text.secondary">
                    No Favourites Set
                  </Typography>
                ) : (
                  <RecordPreviewGrid records={favouritePreviewRecords} />
                )}
              </ProfileSection>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <ProfileSection title="Recently Added">
                {loadingRecent ? (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress />
                  </Box>
                ) : recentPreviewRecords.length === 0 ? (
                  <Typography color="text.secondary">
                    No recent additions yet.
                  </Typography>
                ) : (
                  <RecordPreviewGrid
                    records={recentPreviewRecords}
                    keyPrefix="recent"
                  />
                )}
                <Box sx={{ mt: 1 }}>
                  <Button
                    variant="contained"
                    onClick={() => navigate("/mycollection")}
                  >
                    See Full Collection
                  </Button>
                </Box>
              </ProfileSection>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
