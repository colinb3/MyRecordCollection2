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
  ButtonBase,
  CircularProgress,
  IconButton,
  Tooltip,
  Stack,
} from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { setUserId } from "./analytics";
import RecordPreviewGrid from "./components/RecordPreviewGrid";
import SpinningRecord from "./components/SpinningRecord";
import type { PublicUserProfile } from "./types";
import {
  loadPublicUserProfile,
  followUser,
  unfollowUser,
} from "./communityUsers";
import SettingsIcon from "@mui/icons-material/Settings";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import BarChartIcon from "@mui/icons-material/BarChart";
import ShareButton from "./components/ShareButton";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { performLogout } from "./logout";

const OWN_PREVIEW_LIMIT = 3;

interface SectionCardProps {
  title: string;
  children: ReactNode;
}

function SectionCard({ title, children }: SectionCardProps) {
  return (
    <Paper
      sx={{
        p: { xs: 2, md: 3 },
        borderRadius: 1,
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
  const [followPending, setFollowPending] = useState<boolean>(false);
  const [followError, setFollowError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      // Allow unauthenticated access - don't redirect to login
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

  const normalizedTarget = targetUsername.trim().toLowerCase();
  const normalizedCurrent = (username ?? "").toLowerCase();
  const isViewingOwnProfile =
    normalizedTarget.length === 0 || normalizedTarget === normalizedCurrent;

  useEffect(() => {
    let cancelled = false;

    if (isViewingOwnProfile && !username) {
      return () => {
        cancelled = true;
      };
    }

    const effectiveUsername = isViewingOwnProfile ? username : targetUsername;
    if (!effectiveUsername) {
      setProfile(null);
      setError("Failed to load profile");
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);

    loadPublicUserProfile(effectiveUsername, isViewingOwnProfile)
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
  }, [isViewingOwnProfile, targetUsername, username]);

  const highlights = useMemo(() => {
    const records = profile?.highlights ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const recentRecords = useMemo(() => {
    const records = profile?.recentRecords ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const wishlistRecords = useMemo(() => {
    const records = profile?.wishlistRecords ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const listenedRecords = useMemo(() => {
    const records = profile?.listenedRecords ?? [];
    return isViewingOwnProfile ? records.slice(0, OWN_PREVIEW_LIMIT) : records;
  }, [profile, isViewingOwnProfile]);

  const profileUsername =
    profile?.username ??
    (targetUsername && targetUsername.length > 0
      ? targetUsername
      : undefined) ??
    username ??
    "";
  const targetDisplayName =
    profile?.displayName || profileUsername || username || "";
  const targetAvatarInitial = targetDisplayName
    ? targetDisplayName.charAt(0).toUpperCase()
    : "";
  const joinedDateDisplay = useMemo(() => {
    const raw = profile?.joinedDate;
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let date: Date | null = null;
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (
        Number.isFinite(year) &&
        Number.isFinite(month) &&
        Number.isFinite(day)
      ) {
        date = new Date(Date.UTC(year, month - 1, day));
      }
    }

    if (!date) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (!date) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }, [profile?.joinedDate]);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const handleOpenProfileSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const handleSeeCollection = useCallback(() => {
    if (isViewingOwnProfile) {
      navigate("/mycollection");
      return;
    }
    if (!profileUsername) return;
    navigate(`/community/${encodeURIComponent(profileUsername)}/collection`);
  }, [isViewingOwnProfile, navigate, profileUsername]);

  const handleSeeWishlist = useCallback(() => {
    if (isViewingOwnProfile) {
      navigate("/wishlist");
      return;
    }
    if (!profileUsername) return;
    navigate(`/community/${encodeURIComponent(profileUsername)}/wishlist`);
  }, [isViewingOwnProfile, navigate, profileUsername]);

  const handleSeeListened = useCallback(() => {
    if (isViewingOwnProfile) {
      navigate("/listened");
      return;
    }
    const target = profileUsername || username;
    if (!target) return;
    navigate(`/community/${encodeURIComponent(target)}/listened`);
  }, [isViewingOwnProfile, navigate, profileUsername, username]);

  const handleViewFollows = useCallback(
    (tab: "followers" | "following") => {
      if (!profileUsername) return;
      navigate(
        `/community/${encodeURIComponent(profileUsername)}/follows?tab=${tab}`
      );
    },
    [navigate, profileUsername]
  );

  const handleToggleFollow = useCallback(async () => {
    if (!profile || profile.isFollowing === null || followPending) {
      return;
    }

    const targetUsername = profile.username;
    const normalizedTarget = targetUsername.toLowerCase();
    const currentlyFollowing = profile.isFollowing;

    setFollowPending(true);
    setFollowError(null);

    try {
      const result = currentlyFollowing
        ? await unfollowUser(targetUsername)
        : await followUser(targetUsername);

      setProfile((prev) => {
        if (!prev) return prev;
        if (prev.username.toLowerCase() !== normalizedTarget) {
          return prev;
        }
        return {
          ...prev,
          followersCount: result.target.followersCount,
          followingCount: result.target.followingCount,
          isFollowing: result.isFollowing,
        };
      });

      const updatedInfo = await loadUserInfo(true);
      if (updatedInfo) {
        setUsername(updatedInfo.username);
        setDisplayName(updatedInfo.displayName ?? "");
        setProfilePicUrl(updatedInfo.profilePicUrl ?? null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update follow status";
      setFollowError(message);
    } finally {
      setFollowPending(false);
    }
  }, [followPending, profile]);

  useEffect(() => {
    setFollowError(null);
    setFollowPending(false);
  }, [profile?.username]);

  const highlightEmptyCopy = isViewingOwnProfile
    ? "No Highlights Set"
    : "No highlights shared yet.";
  const recentEmptyCopy = isViewingOwnProfile
    ? "No recent additions yet."
    : "No recent additions shared yet.";
  const showRecentSection = isViewingOwnProfile || !profile?.collectionPrivate;
  const wishlistEmptyCopy = isViewingOwnProfile
    ? "No wishlist records yet."
    : "No wishlist shared yet.";
  const showWishlistSection = isViewingOwnProfile || !profile?.wishlistPrivate;

  const showListenedSection = isViewingOwnProfile || !profile?.listenedPrivate;
  const listenedEmptyCopy = isViewingOwnProfile
    ? "No listened records yet."
    : "No listened records shared yet.";

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
          boxSizing: "border-box",
        }}
      >
        <TopBar
          title={isViewingOwnProfile ? "My Profile" : "Community"}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 4, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                p: { xs: 2, md: 3 },
              }}
            >
              <Box
                sx={{
                  p: 1,
                  display: "flex",
                  flexDirection: { xs: "column", md: "row" },
                  alignItems: "flex-start",
                  gap: 3,
                  position: "relative",
                  mb: 0,
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
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 120,
                        height: 120,
                        bgcolor: "grey.700",
                      }}
                      src={undefined}
                    >
                      {targetAvatarInitial}
                    </Avatar>
                    <CircularProgress size={24} />
                    <Typography color="text.secondary">
                      Loading profile…
                    </Typography>
                  </Box>
                ) : error ? (
                  <Typography color="error">{error}</Typography>
                ) : profile ? (
                  <>
                    <Box
                      sx={{
                        position: "absolute",
                        top: -2.5,
                        right: -2.5,
                        justifyItems: "flex-end",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          gap: 0.25,
                          mb: 0.75,
                        }}
                      >
                        {!isViewingOwnProfile ? (
                          <Tooltip title="Compare collections">
                            <IconButton
                              color="inherit"
                              size="medium"
                              aria-label="Compare collections"
                              onClick={() =>
                                navigate(
                                  `/community/${profileUsername}/compare`
                                )
                              }
                            >
                              <CompareArrowsIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Profile settings">
                            <IconButton
                              color="inherit"
                              aria-label="Open profile settings"
                              onClick={handleOpenProfileSettings}
                            >
                              <SettingsIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="View stats">
                          <IconButton
                            color="inherit"
                            size="medium"
                            aria-label="View stats"
                            onClick={() =>
                              navigate(`/community/${profileUsername}/stats`)
                            }
                          >
                            <BarChartIcon />
                          </IconButton>
                        </Tooltip>
                        <ShareButton
                          title={`${
                            profile.displayName || profile.username
                          }'s Profile`}
                          text={`Check out ${
                            profile.displayName || profile.username
                          }'s profile!`}
                        />
                      </Box>

                      {profile.listeningTo && profile.listeningTo.masterId && (
                        <Box>
                          <ButtonBase
                            onClick={() =>
                              navigate(
                                `/master/${profile.listeningTo!.masterId}`
                              )
                            }
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1.5,
                              borderRadius: 1,
                              p: 0.5,
                              "&:hover": {
                                bgcolor: "action.hover",
                              },
                              transition: "background-color 0.2s",
                            }}
                          >
                            <Box
                              sx={{
                                textAlign: "right",
                                maxWidth: { xs: 120, sm: 250 },
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ mb: 0.5 }}
                                noWrap
                              >
                                Listening to:
                              </Typography>
                              <Typography
                                variant="body1"
                                sx={{ fontWeight: 600 }}
                                noWrap
                              >
                                {profile.listeningTo.name}
                              </Typography>
                              {profile.listeningTo.artist && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  noWrap
                                >
                                  {profile.listeningTo.artist}
                                </Typography>
                              )}
                            </Box>
                            <SpinningRecord
                              coverUrl={profile.listeningTo.cover}
                              size={80}
                            />
                          </ButtonBase>
                        </Box>
                      )}
                    </Box>
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
                      <Typography
                        variant="h4"
                        mt={{ xs: -1, md: 0 }}
                        flexWrap={"wrap"}
                      >
                        {targetDisplayName}
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        color="text.secondary"
                        sx={{ pb: joinedDateDisplay ? 0.3 : 0.8 }}
                      >
                        @{profileUsername}
                      </Typography>
                      {joinedDateDisplay && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ pb: 1 }}
                        >
                          Joined {joinedDateDisplay}
                        </Typography>
                      )}
                      <Box
                        sx={{
                          display: "flex",
                          gap: 0.5,
                          flexWrap: "wrap",
                          mb: profile?.bio ? 1.5 : 0,
                        }}
                      >
                        {typeof profile?.isFollowing === "boolean" && (
                          <Button
                            variant={
                              profile.isFollowing ? "outlined" : "contained"
                            }
                            size="small"
                            onClick={handleToggleFollow}
                            disabled={followPending}
                            sx={{ textTransform: "none", minWidth: 0, mr: 1 }}
                          >
                            {followPending
                              ? "Updating…"
                              : profile.isFollowing
                              ? "Unfollow"
                              : "Follow"}
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleViewFollows("followers")}
                          sx={{ textTransform: "none", minWidth: 0 }}
                        >
                          {profile?.followersCount.toLocaleString()} Followers
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleViewFollows("following")}
                          sx={{ textTransform: "none", minWidth: 0 }}
                        >
                          {profile?.followingCount.toLocaleString()} Following
                        </Button>
                      </Box>
                      {followError && (
                        <Typography
                          variant="body2"
                          color="error"
                          sx={{ mt: 0.5 }}
                        >
                          {followError}
                        </Typography>
                      )}
                      {profile.bio && profile.bio.trim().length > 0 && (
                        <Typography
                          variant="body1"
                          sx={{ whiteSpace: "pre-line" }}
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
              </Box>
              {profile ? <></> : null}

              <Box sx={{ mt: 2 }}>
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
                      ownerUsername={profileUsername}
                      isOwnerViewing={isViewingOwnProfile}
                    />
                  )}
                </SectionCard>
              </Box>

              {showRecentSection && (
                <Box sx={{ mt: 2 }}>
                  <SectionCard title="Recently Collected">
                    {loading ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
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
                        showDateAdded
                        ownerUsername={profileUsername}
                        isOwnerViewing={isViewingOwnProfile}
                      />
                    )}
                    {(!loading && recentRecords.length > 0) ||
                    isViewingOwnProfile ? (
                      <Stack direction="row" gap={1} flexWrap={"wrap"}>
                        <Button
                          variant="contained"
                          onClick={handleSeeCollection}
                          startIcon={<VisibilityIcon />}
                        >
                          View
                        </Button>
                        {!isViewingOwnProfile && (
                          <Button
                            variant="outlined"
                            startIcon={<CompareArrowsIcon />}
                            onClick={() =>
                              navigate(
                                `/community/${profileUsername}/compare?filter=collection`
                              )
                            }
                          >
                            Compare
                          </Button>
                        )}
                      </Stack>
                    ) : null}
                  </SectionCard>
                </Box>
              )}

              {showListenedSection && (
                <Box sx={{ mt: 2 }}>
                  <SectionCard title="Recently Listened">
                    {loading ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <CircularProgress size={20} />
                        <Typography color="text.secondary">
                          Loading listened records…
                        </Typography>
                      </Box>
                    ) : listenedRecords.length === 0 ? (
                      <Typography color="text.secondary">
                        {listenedEmptyCopy}
                      </Typography>
                    ) : (
                      <RecordPreviewGrid
                        records={listenedRecords}
                        keyPrefix="listened"
                        showDateAdded={true}
                        ownerUsername={profileUsername}
                        isOwnerViewing={isViewingOwnProfile}
                      />
                    )}
                    {(!loading && listenedRecords.length > 0) ||
                    isViewingOwnProfile ? (
                      <Stack direction="row" gap={1} flexWrap={"wrap"}>
                        <Button
                          variant="contained"
                          onClick={handleSeeListened}
                          startIcon={<VisibilityIcon />}
                        >
                          View
                        </Button>
                        {!isViewingOwnProfile && (
                          <Button
                            variant="outlined"
                            startIcon={<CompareArrowsIcon />}
                            onClick={() =>
                              navigate(
                                `/community/${profileUsername}/compare?filter=listened`
                              )
                            }
                          >
                            Compare
                          </Button>
                        )}
                      </Stack>
                    ) : null}
                  </SectionCard>
                </Box>
              )}

              {showWishlistSection && (
                <Box sx={{ mt: 2 }}>
                  <SectionCard title="Wishlist">
                    {loading ? (
                      <Box
                        sx={{ display: "flex", alignItems: "center", gap: 2 }}
                      >
                        <CircularProgress size={20} />
                        <Typography color="text.secondary">
                          Loading wishlist…
                        </Typography>
                      </Box>
                    ) : wishlistRecords.length === 0 ? (
                      <Typography color="text.secondary">
                        {wishlistEmptyCopy}
                      </Typography>
                    ) : (
                      <RecordPreviewGrid
                        records={wishlistRecords}
                        keyPrefix="wishlist"
                        ownerUsername={profileUsername}
                        isOwnerViewing={isViewingOwnProfile}
                      />
                    )}

                    {(!loading && wishlistRecords.length > 0) ||
                    isViewingOwnProfile ? (
                      <Stack direction="row" gap={1} flexWrap={"wrap"}>
                        <Button
                          variant="contained"
                          onClick={handleSeeWishlist}
                          startIcon={<VisibilityIcon />}
                        >
                          View
                        </Button>
                        {!isViewingOwnProfile && (
                          <Button
                            variant="outlined"
                            startIcon={<CompareArrowsIcon />}
                            onClick={() =>
                              navigate(
                                `/community/${profileUsername}/compare?filter=wishlist`
                              )
                            }
                          >
                            Compare
                          </Button>
                        )}
                      </Stack>
                    ) : null}
                  </SectionCard>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
