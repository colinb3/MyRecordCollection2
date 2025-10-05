import { useState, useEffect, useMemo } from "react";
import apiUrl from "./api";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  CircularProgress,
  Alert,
  Snackbar,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { darkTheme } from "./theme";
import TopBar from "./components/TopBar";
import { useNavigate } from "react-router-dom";
import { setUserId } from "./analytics";
import { wikiGenres } from "./wiki";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import placeholderCover from "./assets/missingImg.jpg";
import FindRecordSidebar, {
  type AlbumListItem,
} from "./components/FindRecordSidebar";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";

interface AlbumResult {
  name: string;
  artist: string;
  url: string;
  listeners?: string;
  image?: { ["#text"]: string; size: string }[];
}

const DEFAULT_COLLECTION_NAME = "My Collection";
const WISHLIST_COLLECTION_NAME = "Wishlist";

export default function FindRecord() {
  const [results, setResults] = useState<AlbumResult[]>([]);
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | undefined>(
    undefined
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sidebar / add-to-collection state
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [wikiTags, setWikiTags] = useState<string[]>([]);
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [rating, setRating] = useState<number>(0);
  const [releaseYear, setReleaseYear] = useState<number>(
    new Date().getFullYear()
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [info, tags] = await Promise.all([
        loadUserInfo(),
        (async () => {
          try {
            const res = await fetch(apiUrl("/api/tags"), {
              credentials: "include",
            });
            if (!res.ok) {
              return null;
            }
            return (await res.json()) as string[];
          } catch {
            return null;
          }
        })(),
      ]);

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
      if (Array.isArray(tags)) {
        setAvailableTags(tags);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    try {
      setUserId(undefined);
    } catch {}
    navigate("/login");
  };

  const handleSearchSubmit = async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        apiUrl(`/api/lastfm/album.search?q=${encodeURIComponent(value)}`),
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        const albums = data?.results?.albummatches?.album || [];
        setResults(albums);
      } else {
        const problem = await res.json().catch(() => ({}));
        setError(problem.error || `Search failed (${res.status})`);
      }
    } catch (e) {
      console.error(e);
      setError("Network error searching Last.fm");
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    return results.map((a, idx) => {
      // Prefer largest available image (extralarge/mega) else fall back to last non-empty, else first
      const nonEmpty = (a.image || []).filter((im) => im["#text"]);
      const largePref =
        nonEmpty.find((im) => im.size === "extralarge") ||
        nonEmpty.find((im) => im.size === "mega") ||
        nonEmpty[nonEmpty.length - 1] ||
        nonEmpty[0];
      const cover = largePref?.["#text"] || "";
      return {
        id: `${a.name}-${a.artist}-${idx}`,
        cover,
        record: a.name,
        artist: a.artist,
      } as AlbumListItem & { record: string };
    });
  }, [results]);

  // When selecting a different album reset metadata inputs (except tags maybe keep?) We'll keep chosen tags/rating for convenience only per selection? Probably reset.
  useEffect(() => {
    if (selectedAlbumId) {
      setRating(0);
      setReleaseYear(new Date().getFullYear());
      setSelectedTags([]);
      setAddError(null);
    }
  }, [selectedAlbumId]);

  const handleToggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddNewTag = (tag: string) => {
    setAvailableTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
  };

  const submitRecord = async (
    tableName: string,
    redirectPath: string,
    successMessage: string
  ) => {
    if (!selectedAlbumId) return;
    const selectedRow = rows.find((r) => r.id === selectedAlbumId);
    if (!selectedRow) return;
    setAdding(true);
    setAddError(null);
    try {
      const payload = {
        id: -1,
        cover: selectedRow.cover,
        record: selectedRow.record,
        artist: selectedRow.artist,
        rating,
        tags: selectedTags,
        release: releaseYear,
        dateAdded: new Date().toISOString().slice(0, 10),
        tableName,
      };
      const res = await fetch(apiUrl("/api/records/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await res.json().catch(() => null);
        // Navigate back to collection after successful add and show a toast there
        navigate(redirectPath, { state: { message: successMessage } });
      } else {
        const problem = await res.json().catch(() => ({}));
        const msg = problem.error || `Failed to add record (${res.status})`;
        setAddError(msg);
        setSnackbar({ open: true, message: msg, severity: "error" });
      }
    } catch (e) {
      setAddError("Network error adding record");
      setSnackbar({
        open: true,
        message: "Network error adding record",
        severity: "error",
      });
    } finally {
      setAdding(false);
    }
  };

  const handleAddRecord = async () =>
    submitRecord(DEFAULT_COLLECTION_NAME, "/mycollection", "Record added");

  const handleAddWishlistRecord = async () =>
    submitRecord(WISHLIST_COLLECTION_NAME, "/wishlist", "Added to wishlist");

  const columns: GridColDef[] = [
    {
      field: "cover",
      headerName: "",
      width: 110,
      sortable: false,
      renderCell: (params) => {
        const src = params.value || placeholderCover;
        const title = params.row.record ?? "cover";
        return (
          <img
            src={src}
            alt={title}
            style={{
              maxWidth: 100,
              maxHeight: 100,
              objectFit: "cover",
              borderRadius: 4,
            }}
          />
        );
      },
    },
    {
      field: "record",
      headerName: "Album",
      flex: 1.5,
      minWidth: 100,
      cellClassName: "wrapCell",
      renderCell: (params) => (
        <div className="wrapText" style={{ width: "100%" }}>
          {params.value}
        </div>
      ),
    },
    {
      field: "artist",
      headerName: "Artist",
      flex: 1,
      minWidth: 100,
      cellClassName: "wrapCell",
      renderCell: (params) => (
        <div className="wrapText" style={{ width: "100%" }}>
          {params.value}
        </div>
      ),
    },
  ];

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
          title="Find Record"
          onSearchChange={handleSearchSubmit}
          onLogout={handleLogout}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          searchMode="submit"
          searchPlaceholder="Search All Albums (By Title)"
        />
        <Grid
          container
          spacing={2}
          sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
        >
          <Grid
            size={{ xs: 7, sm: 8, md: 9 }}
            height={"100%"}
            sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}
          >
            {error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            )}
            <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
              <DataGrid
                rows={rows}
                columns={columns}
                density="comfortable"
                hideFooter
                rowHeight={90}
                onRowClick={async (p) => {
                  const id = p.id as string;
                  // clear previous wiki suggestions immediately
                  setWikiTags([]);
                  setSelectedAlbumId(id);
                  setWikiLoading(true);
                  try {
                    const selectedRow = rows.find((r) => r.id === id);
                    if (!selectedRow) return;
                    // fetch wiki genres (include release year as first item)
                    const genres = await wikiGenres(
                      selectedRow.record,
                      selectedRow.artist,
                      true
                    );
                    if (genres && genres.length > 0) {
                      // If the first value looks like a release year (4-digit), use it
                      const first = genres[0];
                      const yearNum =
                        first && /^\d{4}$/.test(first) ? Number(first) : null;
                      if (yearNum && yearNum >= 1800 && yearNum <= 2100) {
                        setReleaseYear(yearNum);
                        setWikiTags(genres.slice(1).filter((g) => !!g));
                      } else {
                        setWikiTags(genres.filter((g) => !!g));
                      }
                    } else {
                      setWikiTags([]);
                    }
                  } catch (err) {
                    setWikiTags([]);
                  } finally {
                    setWikiLoading(false);
                  }
                }}
                getRowClassName={(params) =>
                  params.id === selectedAlbumId ? "selected-row" : ""
                }
                sx={{
                  border: "none",
                  height: "100%",
                  "& .MuiDataGrid-cell": {
                    display: "flex",
                    alignItems: "center",
                    py: 1,
                    minWidth: 0,
                  },
                  "& .wrapCell .MuiDataGrid-cellContent": {
                    whiteSpace: "normal",
                    overflow: "hidden",
                    textOverflow: "clip",
                    overflowWrap: "anywhere",
                    lineHeight: 1.2,
                    display: "block",
                  },
                  "& .wrapCell": {
                    whiteSpace: "normal !important",
                  },
                  "& .wrapCell .wrapText": {
                    whiteSpace: "normal",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    lineHeight: 1.2,
                    alignSelf: "center",
                  },
                  "& .selected-row": {
                    bgcolor: (theme) =>
                      `${theme.palette.action.selected} !important`,
                  },
                }}
              />
              {loading && (
                <Box
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "rgba(0,0,0,0.35)",
                  }}
                >
                  <CircularProgress />
                </Box>
              )}
            </Box>
          </Grid>
          <Grid
            size={{ xs: 5, sm: 4, md: 3 }}
            sx={{ height: "100%", minHeight: 0 }}
          >
            <FindRecordSidebar
              availableTags={availableTags}
              selectedTags={selectedTags}
              onToggleTag={handleToggleTag}
              onAddNewTag={handleAddNewTag}
              wikiTags={wikiTags}
              wikiLoading={wikiLoading}
              rating={rating}
              onRatingChange={setRating}
              releaseYear={releaseYear}
              onReleaseYearChange={setReleaseYear}
              canAdd={!!selectedAlbumId && !adding}
              onAddRecord={handleAddRecord}
              onWishlistRecord={handleAddWishlistRecord}
            />
            {addError && (
              <Alert severity="error" sx={{ mt: 1 }}>
                {addError}
              </Alert>
            )}
          </Grid>
        </Grid>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={(_, reason) => {
            if (reason !== "clickaway")
              setSnackbar((s) => ({ ...s, open: false }));
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            severity={snackbar.severity}
            variant="filled"
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
