import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Paper,
  Avatar,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Stack,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import type { CommunityUserSummary } from "./types";
import { clearCommunityCaches, searchCommunityUsers } from "./communityUsers";
import apiUrl from "./api";

const MIN_QUERY_LENGTH = 2;

export default function Community() {
  const navigate = useNavigate();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const rawQuery = searchParams.get("q") ?? "";
  const normalizedQuery = useMemo(() => rawQuery.trim(), [rawQuery]);
  const [submittedQuery, setSubmittedQuery] = useState(normalizedQuery);

  const [results, setResults] = useState<CommunityUserSummary[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "ready">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSubmittedQuery(normalizedQuery);
  }, [normalizedQuery]);

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
    let cancelled = false;
    const query = submittedQuery;
    if (!query) {
      setResults([]);
      setStatus("idle");
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus("error");
      setError(`Enter at least ${MIN_QUERY_LENGTH} characters to search.`);
      return () => {
        cancelled = true;
      };
    }

    setStatus("loading");
    setError(null);

    searchCommunityUsers(query)
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to search users";
        setError(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [submittedQuery]);

  const handleSearchSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ q: trimmed }, { replace: true });
      }
    },
    [setSearchParams]
  );

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

  const handleResultClick = useCallback(
    (targetUsername: string) => {
      navigate(`/community/${encodeURIComponent(targetUsername)}`);
    },
    [navigate]
  );

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
          onSearchChange={handleSearchSubmit}
          searchMode="submit"
          searchPlaceholder="Search for users"
          initialSearchValue={rawQuery}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 3, px: 1 }}>
          <Stack spacing={2} maxWidth={720} mx="auto" sx={{ mt: 1 }}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                p: 2,
              }}
            >
              {status === "idle" && (
                <Typography color="text.secondary">
                  Search for a username or display name in the search bar above.
                </Typography>
              )}
              {status === "loading" && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    justifyContent: "center",
                    py: 4,
                  }}
                >
                  <CircularProgress size={24} />
                  <Typography color="text.secondary">
                    Searching community…
                  </Typography>
                </Box>
              )}
              {status === "error" && error && (
                <Typography color="error">{error}</Typography>
              )}
              {status === "ready" && results.length === 0 && (
                <>
                  <Typography variant="h5" mb={1}>
                    Search Results
                  </Typography>
                  <Typography color="text.secondary">
                    No users matched “{submittedQuery}”.
                  </Typography>
                </>
              )}
              {status === "ready" && results.length != 0 && (
                <Typography variant="h5" mb={1}>
                  Search Results
                </Typography>
              )}
              {results.length > 0 && (
                <List disablePadding>
                  {results.map((user) => {
                    const primary = user.displayName || `@${user.username}`;
                    return (
                      <ListItemButton
                        key={user.username}
                        onClick={() => handleResultClick(user.username)}
                        sx={{ borderRadius: 1 }}
                      >
                        <ListItemAvatar>
                          <Avatar
                            src={user.profilePicUrl ?? undefined}
                            alt={primary}
                            sx={{ bgcolor: "grey.700" }}
                          >
                            {!user.profilePicUrl &&
                              (user.displayName || user.username)
                                .charAt(0)
                                .toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={primary}
                          secondary={
                            <Box component="span" display="block">
                              <Typography
                                component="span"
                                variant="body2"
                                color="text.secondary"
                                sx={{ display: "block" }}
                              >
                                @{user.username}
                              </Typography>
                              {user.bio && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{ display: "block" }}
                                >
                                  {user.bio}
                                </Typography>
                              )}
                            </Box>
                          }
                          primaryTypographyProps={{ fontWeight: 600 }}
                        />
                      </ListItemButton>
                    );
                  })}
                </List>
              )}
            </Paper>
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
