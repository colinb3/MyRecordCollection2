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
  children: ReactNode;
}

function ProfileSection({ title, children }: ProfileSectionProps) {
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
          // header layout no longer needs space-between since there's no action button
          gap: 1,
        }}
      >
        <Typography variant="h6">{title}</Typography>
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
  const [bio, setBio] = useState<string>(cachedUser?.bio ?? "");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [highlightRecords, setHighlightRecords] = useState<Record[]>([]);
  const [loadingHighlights, setLoadingHighlights] = useState<boolean>(true);
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
      setBio(info.bio ?? "");
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

  useEffect(() => {
    let cancelled = false;

    const loadRecords = async () => {
      setLoadingHighlights(true);
      try {
        const highlights = await loadProfileHighlights();
        if (cancelled) return;

        if (highlights && highlights.records.length > 0) {
          setHighlightRecords(highlights.records.slice(0, PREVIEW_LIMIT));
        } else {
          setHighlightRecords([]);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load profile highlights", error);
          setHighlightRecords([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingHighlights(false);
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

  const highlightsPreviewRecords = useMemo(
    () => highlightRecords.slice(0, PREVIEW_LIMIT),
    [highlightRecords]
  );

  const recentPreviewRecords = useMemo(
    () => recentRecords.slice(0, PREVIEW_LIMIT),
    [recentRecords]
  );

  const avatarInitial = useMemo(() => {
    const source = displayName || username;
    return source ? source.charAt(0).toUpperCase() : "";
  }, [displayName, username]);

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
          profilePicUrl={profilePicUrl ?? undefined}
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
                  alignItems: "flex-start",
                  gap: 3,
                  position: "relative",
                }}
              >
                {isOwnProfile && (
                  <IconButton
                    color="inherit"
                    aria-label="Open profile settings"
                    onClick={handleOpenProfileSettings}
                    sx={{ position: "absolute", top: 16, right: 16 }}
                  >
                    <SettingsIcon />
                  </IconButton>
                )}
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 120,
                    height: 120,
                    bgcolor: "grey.700",
                  }}
                  src={profilePicUrl ?? undefined}
                >
                  {!profilePicUrl && avatarInitial}
                </Avatar>
                <Box>
                  <Typography variant="h4">
                    {displayName || username || "Your Profile"}
                  </Typography>
                  <Typography
                    variant="subtitle1"
                    color="text.secondary"
                    sx={{ pb: 1 }}
                  >
                    @{username}
                  </Typography>
                  {bio.trim().length > 0 && (
                    <Typography
                      variant="body1"
                      sx={{ mt: 1, whiteSpace: "pre-line" }}
                    >
                      {bio}
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <ProfileSection title="Collection Highlights">
                {loadingHighlights ? (
                  <Box sx={{ mt: 2 }}>
                    <LinearProgress />
                  </Box>
                ) : highlightsPreviewRecords.length === 0 ? (
                  <Typography color="text.secondary">
                    No Highlights Set
                  </Typography>
                ) : (
                  <RecordPreviewGrid records={highlightsPreviewRecords} />
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
