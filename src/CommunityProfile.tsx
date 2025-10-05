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
import { clearProfileHighlightsCache } from "./profileHighlights";
import { clearCollectionRecordsCache } from "./collectionRecords";
import RecordPreviewGrid from "./components/RecordPreviewGrid";
import type { PublicUserProfile } from "./types";
import { clearCommunityCaches, loadPublicUserProfile } from "./communityUsers";
import apiUrl from "./api";

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

  useEffect(() => {
    if (!targetUsername) {
      setError("Missing username");
      setProfile(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadPublicUserProfile(targetUsername)
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load profile";
        setProfile(null);
        setError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetUsername]);

  const highlights = useMemo(() => profile?.highlights ?? [], [profile]);
  const recentRecords = useMemo(() => profile?.recentRecords ?? [], [profile]);

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
    if (!targetUsername) return;
    navigate(`/community/${encodeURIComponent(targetUsername)}/collection`);
  }, [navigate, targetUsername]);

  const targetDisplayName = profile?.displayName || targetUsername;
  const targetAvatarInitial = (profile?.displayName || targetUsername)
    .charAt(0)
    .toUpperCase();

  const initialSearchValue = searchParams.get("q") ?? "";

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
          title="Community"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
          onSearchChange={handleCommunitySearch}
          searchMode="submit"
          searchPlaceholder="Search for users"
          initialSearchValue={initialSearchValue}
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
                        @{profile.username}
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
                    No highlights shared yet.
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
                    No recent additions available.
                  </Typography>
                ) : (
                  <RecordPreviewGrid
                    records={recentRecords}
                    keyPrefix="recent"
                  />
                )}
                <Box sx={{ mt: 1 }}>
                  <Button variant="contained" onClick={handleSeeCollection}>
                    See Full Collection
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
