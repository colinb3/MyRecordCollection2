import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Avatar,
  Button,
  CircularProgress,
  IconButton,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { setUserId } from "./analytics";
import {
  clearProfileHighlightsCache,
  loadProfileHighlights,
} from "./profileHighlights";
import { clearCollectionRecordsCache } from "./collectionRecords";
import RecordPreviewGrid from "./components/RecordPreviewGrid";
import type { PublicUserProfile, Record as MrcRecord } from "./types";
import { clearCommunityCaches, loadPublicUserProfile } from "./communityUsers";
import apiUrl from "./api";
import { loadRecentRecords } from "./profileRecentRecords";
import SettingsIcon from "@mui/icons-material/Settings";

const OWN_PREVIEW_LIMIT = 4;

interface SectionCardProps {
  title: string;
  children: ReactNode;
}

function SectionCard({ title, children }: SectionCardProps) {
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
          gap: 1,
        }}
      >
        <Typography variant="h6">{title}</Typography>
      </Box>
      {children}
    </Paper>
  );
}

export default function CommunityProfile() {
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

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const normalizedTarget = targetUsername.trim().toLowerCase();
  const normalizedCurrent = (username ?? "").toLowerCase();
  const isViewingOwnProfile =
    normalizedTarget.length === 0 || normalizedTarget === normalizedCurrent;

  useEffect(() => {
    let cancelled = false;

    if (isViewingOwnProfile && !username) {
      return;
    }

    setLoading(true);
    setError(null);

    const loadData = async () => {
      if (isViewingOwnProfile) {
        try {
          const userInfo = await loadUserInfo();
          if (cancelled) return;
          if (!userInfo) {
            setProfile(null);
            setError("Failed to load profile");
            return;
          }
          const [highlightsData, recentData] = await Promise.all([
            loadProfileHighlights().catch((err) => {
              console.warn("Failed to load profile highlights", err);
              return null;
            }),
            loadRecentRecords().catch((err) => {
              console.warn("Failed to load recent records", err);
              return [] as MrcRecord[];
            }),
          ]);
          if (cancelled) return;
          setProfile({
            username: userInfo.username,
            displayName: userInfo.displayName ?? null,
            bio: userInfo.bio ?? null,
            profilePicUrl: userInfo.profilePicUrl ?? null,
            highlights: highlightsData?.records ?? [],
            recentRecords: recentData ?? [],
          });
          setError(null);
        } catch (err: unknown) {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : "Failed to load profile";
          setProfile(null);
          setError(message);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      } else {
        try {
          const data = await loadPublicUserProfile(targetUsername);
          if (cancelled) return;
          setProfile(data);
          setError(null);
        } catch (err: unknown) {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : "Failed to load profile";
          setProfile(null);
          setError(message);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [isViewingOwnProfile, normalizedTarget, targetUsername, username]);

  const highlights = useMemo(() => {
    const records = profile?.highlights ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const recentRecords = useMemo(() => {
    const records = profile?.recentRecords ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const profileUsername = profile?.username ?? (targetUsername || username);
  const targetDisplayName =
    profile?.displayName || profileUsername || username || "";
  const targetAvatarInitial = targetDisplayName
    ? targetDisplayName.charAt(0).toUpperCase()
    : "";

  const handleLogout = useCallback(async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearCollectionRecordsCache();
    clearProfileHighlightsCache();
    clearCommunityCaches();
    clearUserInfoCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore */
    }
    navigate("/login");
  }, [navigate]);

  const handleOpenProfileSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleCommunitySearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        navigate("/community");
      } else {
        navigate(`/community?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [navigate]
  );

  const handleSeeCollection = useCallback(() => {
    if (isViewingOwnProfile) {
      navigate("/mycollection");
      return;
    }
    if (!profileUsername) return;
    navigate(`/community/${encodeURIComponent(profileUsername)}/collection`);
  }, [isViewingOwnProfile, navigate, profileUsername]);

  const initialSearchValue = searchParams.get("q") ?? "";
  const topBarProps = {
    onSearchChange: handleCommunitySearch,
    searchMode: "submit" as const,
    searchPlaceholder: "Search for users",
    initialSearchValue,
  };

  const seeCollectionLabel = isViewingOwnProfile
    ? "Go to My Collection"
    : "See Full Collection";
  const highlightEmptyCopy = isViewingOwnProfile
    ? "No Highlights Set"
    : "No highlights shared yet.";
  const recentEmptyCopy = isViewingOwnProfile
    ? "No recent additions yet."
    : "No recent additions available.";

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          p: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title={isViewingOwnProfile ? "Your Profile" : "Community"}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
          {...topBarProps}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, pr: 1 }}>
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
                {loading ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <CircularProgress size={24} />
                    <Typography color="text.secondary">
                      Loading profile…
                    </Typography>
                  </Box>
                ) : error ? (
                  <Typography color="error">{error}</Typography>
                ) : profile ? (
                  <>
                    {isViewingOwnProfile && (
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
                      src={profile.profilePicUrl ?? undefined}
                    >
                      {!profile.profilePicUrl && targetAvatarInitial}
                    </Avatar>
                    <Box>
                      <Typography variant="h4">{targetDisplayName}</Typography>
                      <Typography
                        variant="subtitle1"
                        color="text.secondary"
                        sx={{ pb: 1 }}
                      >
                        @{profileUsername}
                      </Typography>
                      {profile.bio && profile.bio.trim().length > 0 && (
                        <Typography
                          variant="body1"
                          sx={{ mt: 1, whiteSpace: "pre-line" }}
                          color="text.primary"
                        >
                          {profile.bio}
                        </Typography>
                      )}
                    </Box>
                  </>
                ) : (
                  <Typography color="text.secondary">
                    No profile information available.
                  </Typography>
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <SectionCard title="Collection Highlights">
                {loading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <CircularProgress size={20} />
                    <Typography color="text.secondary">
                      Loading highlights…
                    </Typography>
                  </Box>
                ) : highlights.length === 0 ? (
                  <Typography color="text.secondary">
                    {highlightEmptyCopy}
                  </Typography>
                ) : (
                  <RecordPreviewGrid
                    records={highlights}
                    keyPrefix="highlight"
                  />
                )}
              </SectionCard>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <SectionCard title="Recently Added">
                {loading ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <CircularProgress size={20} />
                    <Typography color="text.secondary">
                      Loading recent records…
                    </Typography>
                  </Box>
                ) : recentRecords.length === 0 ? (
                  <Typography color="text.secondary">
                    {recentEmptyCopy}
                  </Typography>
                ) : (
                  <RecordPreviewGrid
                    records={recentRecords}
                    keyPrefix="recent"
                  />
                )}
                <Box sx={{ mt: 1 }}>
                  <Button variant="contained" onClick={handleSeeCollection}>
                    {seeCollectionLabel}
                  </Button>
                </Box>
              </SectionCard>
            </Grid>
          </Grid>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
