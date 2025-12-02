import { useState, useEffect, useCallback } from "react";
import apiUrl from "./api";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  IconButton,
  Drawer,
  useMediaQuery,
  TextField,
  Snackbar,
  Alert,
  Button,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import FilterListAltIcon from "@mui/icons-material/FilterListAlt";
import AddIcon from "@mui/icons-material/Add";
import { darkTheme } from "./theme";
import {
  type Record,
  type Filters,
  type ColumnVisibilityMap,
  type RecordTableSortPreference,
  createDefaultColumnVisibility,
  createDefaultRecordTablePreferences,
} from "./types";
import {
  getCachedRecordTablePreferences,
  loadRecordTablePreferences,
} from "./preferences";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { loadUserTags } from "./userTags";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { setUserId } from "./analytics";
import ShareButton from "./components/ShareButton";
import { performLogout } from "./logout";

// Import Components
import TopBar from "./components/TopBar";
import RecordTable from "./components/RecordTable";
import FilterSidebar from "./components/FilterSidebar";
import ManageTagsDialog from "./components/ManageTagsDialog";
import TutorialDialog from "./components/TutorialDialog";

interface CollectionProps {
  tableName: string;
  title?: string;
}

interface CollectionLocationState {
  message?: string;
  showTutorial?: boolean;
}

interface CollectionPrivacy {
  tableName: string;
  isPrivate: boolean;
}

interface RecordsApiResponse {
  records: Record[];
  privacy: CollectionPrivacy | null;
}

const MIN_RELEASE_YEAR = 1901;
const MAX_RELEASE_YEAR = 2100;

const initialFilters: Filters = {
  tags: [],
  rating: { min: 0, max: 10 },
  release: { min: MIN_RELEASE_YEAR, max: MAX_RELEASE_YEAR },
};

export default function Collection({ tableName, title }: CollectionProps) {
  const cachedRecordTablePreferences = getCachedRecordTablePreferences();
  const cachedUserInfo = getCachedUserInfo();
  const [records, setRecords] = useState<Record[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Record[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [creating, setCreating] = useState<boolean>(false);

  // State for controlling the UI
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isLargeScreen = useMediaQuery("(min-width:1200px)");
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState<string>(
    cachedUserInfo?.username ?? ""
  );
  const [displayName, setDisplayName] = useState<string>(
    cachedUserInfo?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUserInfo?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cachedUserInfo);

  const [currentTableIsPrivate, setCurrentTableIsPrivate] = useState<
    boolean | null
  >(null);

  // Get the current collection URL in community format for sharing
  const getCollectionUrl = useCallback(() => {
    const baseUrl = window.location.origin;
    if (!username) {
      return baseUrl;
    }
    // Use clean routes without query parameters
    if (tableName === "My Collection") {
      return `${baseUrl}/community/${username}/collection`;
    }
    if (tableName === "Wishlist") {
      return `${baseUrl}/community/${username}/wishlist`;
    }
    if (tableName === "Listened") {
      return `${baseUrl}/community/${username}/listened`;
    }
    // Fallback for any custom table names (though unlikely in practice)
    return `${baseUrl}/community/${username}/collection`;
  }, [username, tableName]);

  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  // Snackbar for high level notifications
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityMap>(
    () =>
      cachedRecordTablePreferences
        ? { ...cachedRecordTablePreferences.columnVisibility }
        : createDefaultColumnVisibility()
  );
  const [defaultSortPref, setDefaultSortPref] =
    useState<RecordTableSortPreference>(() =>
      cachedRecordTablePreferences
        ? { ...cachedRecordTablePreferences.defaultSort }
        : createDefaultRecordTablePreferences().defaultSort
    );

  const handleFilterChange = (newFilters: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const navigateToRecordDetails = useCallback(
    (record: Record) => {
      navigate(`/record/${record.id}`);
    },
    [navigate]
  );

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  // Memoize the filtering and sorting logic
  useEffect(() => {
    let processedRecords = [...records];

    // 1. Filter by search term
    if (searchTerm) {
      processedRecords = processedRecords.filter(
        (r) =>
          r.record.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.artist.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // 2. Filter by tags
    if (filters.tags.length > 0) {
      processedRecords = processedRecords.filter((r) =>
        filters.tags.every((tag) => r.tags.includes(tag))
      );
    }

    // 3. Filter by rating
    processedRecords = processedRecords.filter(
      (r) =>
        r.rating >= (filters.rating?.min ?? 0) &&
        r.rating <= (filters.rating?.max ?? 10)
    );

    // 4. Filter by release
    const releaseMin = filters.release?.min ?? MIN_RELEASE_YEAR;
    const releaseMax = filters.release?.max ?? MAX_RELEASE_YEAR;
    processedRecords = processedRecords.filter((r) => {
      const releaseValue = Number.isFinite(r.release) ? r.release : null;
      if (releaseValue === null || releaseValue <= 0) {
        return true;
      }
      return releaseValue >= releaseMin && releaseValue <= releaseMax;
    });

    // 5. Sort

    setFilteredRecords(processedRecords);
  }, [records, searchTerm, filters]);

  // Fetch records and tags from API when app mounts
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [recordData, tagData, prefs] = await Promise.all([
          (async () => {
            const res = await fetch(
              apiUrl(`/api/records?table=${encodeURIComponent(tableName)}`),
              { credentials: "include" }
            );
            if (!res.ok) {
              console.error("Failed to fetch records", res.status);
              return null;
            }
            const data = await res.json().catch(() => null);
            if (!data) return null;
            // New server shape: { records: [...], privacy: { tableName, isPrivate } }
            if (Array.isArray(data)) {
              return {
                records: data,
                privacy: null,
              } as RecordsApiResponse;
            }
            if (
              data &&
              typeof data === "object" &&
              Array.isArray(data.records)
            ) {
              return {
                records: data.records as Record[],
                privacy: data.privacy ?? null,
              } as RecordsApiResponse;
            }
            return null;
          })(),
          loadUserTags(),
          loadRecordTablePreferences(),
        ]);

        if (cancelled) return;

        if (recordData && recordData.records) {
          const rd = recordData.records;
          setRecords(rd);
          setFilteredRecords(rd);
          setSelectedRecord(null);
          setCurrentTableIsPrivate(Boolean(recordData.privacy?.isPrivate));
        }

        if (tagData) {
          setAllTags(tagData);
        }

        if (prefs) {
          setColumnVisibility({ ...prefs.columnVisibility });
          setDefaultSortPref({ ...prefs.defaultSort });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch collection data", err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [tableName]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      setUserLoading(false);
      if (!info) {
        if (location.pathname !== "/login") {
          const next = encodeURIComponent(
            `${location.pathname}${location.search || ""}${location.hash || ""}`
          );
          navigate(`/login?next=${next}`);
        }
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

  // If navigated here with a message (e.g., after adding a record from FindRecord), show snackbar
  useEffect(() => {
    const state = location?.state as CollectionLocationState | undefined;
    if (state?.message) {
      const msg = state.message;
      setSnackbar({ open: true, message: msg, severity: "success" });
      // Clear history state so reloads/back navigation won't re-show the message
      try {
        window.history.replaceState({}, document.title);
      } catch {
        // ignore if replaceState is not available
      }
    }
  }, [location]);

  // Show tutorial for new users navigating from registration
  useEffect(() => {
    const state = location?.state as CollectionLocationState | undefined;
    if (state?.showTutorial && tableName === "My Collection") {
      setTutorialOpen(true);
      // Clear the state so refreshing doesn't re-show tutorial
      try {
        window.history.replaceState({}, document.title);
      } catch {
        // ignore if replaceState is not available
      }
    }
  }, [location, tableName]);

  const handleCloseTutorial = () => {
    setTutorialOpen(false);
  };

  const handleLogout = async () => {
    await performLogout(navigate);
  };

  // Handler for selecting a record in the table
  const handleSelectRecord = (rec: Record | null) => {
    setSelectedRecord(rec);
    if (rec && rec.id !== -1) {
      navigateToRecordDetails(rec);
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
        <Box sx={{ flex: "0 0 auto", mb: -0.5 }}>
          <TopBar
            onLogout={handleLogout}
            title={title ?? tableName}
            username={username}
            displayName={displayName}
            profilePicUrl={profilePicUrl ?? undefined}
            loading={userLoading}
          />
        </Box>

        <Box
          sx={{
            flex: "0 0 auto",
            mb: 1,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <TextField
            variant="outlined"
            type="search"
            placeholder={`Search ${title ?? tableName}...`}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            sx={{
              width: 275,
            }}
          />
          <Button
            variant="outlined"
            color="primary"
            startIcon={<AddIcon />}
            sx={{ whiteSpace: "nowrap", ml: 1 }}
            onClick={async () => {
              if (creating) return;
              setCreating(true);
              try {
                // Minimal payload for a custom record
                const payload = {
                  id: -1,
                  record: "New Record",
                  artist: "",
                  cover: null,
                  rating: 0,
                  isCustom: true,
                  tags: [],
                  tableName,
                };

                const res = await fetch(apiUrl("/api/records/create"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(payload),
                });

                if (res.status === 401) {
                  // Not authenticated — send to login with next
                  const next = encodeURIComponent(
                    `${location.pathname}${location.search || ""}${
                      location.hash || ""
                    }`
                  );
                  navigate(`/login?next=${next}`);
                  return;
                }

                if (!res.ok) {
                  const problem = await res.json().catch(() => ({}));
                  setSnackbar({
                    open: true,
                    message:
                      problem.error ||
                      `Failed to create record (${res.status})`,
                    severity: "error",
                  });
                  return;
                }

                const created = (await res.json()) as Record;
                // Update local caches and state so the new record appears
                setRecords((prev) => [created, ...prev]);
                setFilteredRecords((prev) => [created, ...prev]);
                setSelectedRecord(created);
                // Navigate to the record details page
                navigate(`/record/${created.id}`);
              } catch (err) {
                console.error("Failed to create record", err);
                setSnackbar({
                  open: true,
                  message: "Network error creating record",
                  severity: "error",
                });
              } finally {
                setCreating(false);
              }
            }}
          >
            Custom
          </Button>
          {!(currentTableIsPrivate === true) && (
            <Box sx={{ ml: 0.75 }}>
              <ShareButton
                url={getCollectionUrl()}
                title={title ?? tableName}
                text={`Check out my ${title ?? tableName}`}
              />
            </Box>
          )}
        </Box>
        <Grid
          container
          spacing={2}
          sx={{
            flex: "1 1 0",
            minHeight: 0,
            overflow: "hidden",
            pb: { xs: 1, sm: 0 },
          }}
        >
          <Grid
            size={{ xs: isLargeScreen ? 9 : 12 }}
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "102%",
              minHeight: 105,
              mb: 0,
              mt: -1,
            }}
          >
            <RecordTable
              records={filteredRecords}
              selectedId={selectedRecord?.id}
              onSelect={handleSelectRecord}
              initialColumnVisibility={columnVisibility}
              defaultSort={defaultSortPref}
              loading={loading}
            />
          </Grid>
          {isLargeScreen && (
            <Grid size={{ xs: 3 }} sx={{ height: "100%", minHeight: 0 }}>
              <FilterSidebar
                tags={allTags}
                currentFilters={filters}
                onFiltersChange={handleFilterChange}
                onResetFilters={resetFilters}
                onOpenManageTags={() => setManageTagsOpen(true)}
                tagsLoading={loading}
                displayedRecords={filteredRecords}
                isLargeScreen={isLargeScreen}
                setSidebarOpen={setSidebarOpen}
              />
            </Grid>
          )}
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
        {/* Floating filter button and Drawer only on small screens */}
        {!isLargeScreen && !sidebarOpen && (
          <IconButton
            color="primary"
            sx={{
              position: "fixed",
              top: "50%",
              right: 16,
              zIndex: 1300,
              bgcolor: "background.paper",
              boxShadow: 3,
              borderRadius: 2,
              transform: "translateY(-50%)",
            }}
            onClick={() => setSidebarOpen(true)}
          >
            <FilterListAltIcon fontSize="large" />
          </IconButton>
        )}

        {!isLargeScreen && (
          <Drawer
            anchor="right"
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            sx={{
              "& .MuiDrawer-paper": {
                width: 340,
                maxWidth: "90vw",
              },
            }}
          >
            <FilterSidebar
              tags={allTags}
              currentFilters={filters}
              onFiltersChange={handleFilterChange}
              onResetFilters={resetFilters}
              onOpenManageTags={() => setManageTagsOpen(true)}
              tagsLoading={loading}
              displayedRecords={filteredRecords}
              isLargeScreen={isLargeScreen}
              setSidebarOpen={setSidebarOpen}
            />
          </Drawer>
        )}
        <ManageTagsDialog
          open={manageTagsOpen}
          onClose={() => setManageTagsOpen(false)}
          tags={allTags}
          onTagsUpdated={(updated) => {
            setAllTags(updated);
            // If a selected filter tag was renamed/deleted, ensure filters stay consistent
            setFilters((prev) => ({
              ...prev,
              tags: prev.tags.filter((t) => updated.includes(t)),
            }));
          }}
          onTagRenamed={(oldName, newName) => {
            // Update records locally replacing oldName with newName in tag arrays
            setRecords((prev) =>
              prev.map((r) =>
                r.tags.includes(oldName)
                  ? {
                      ...r,
                      tags: r.tags.map((t) => (t === oldName ? newName : t)),
                    }
                  : r
              )
            );
            // Also update filteredRecords immediately for UX consistency
            setFilteredRecords((prev) =>
              prev.map((r) =>
                r.tags.includes(oldName)
                  ? {
                      ...r,
                      tags: r.tags.map((t) => (t === oldName ? newName : t)),
                    }
                  : r
              )
            );
            // Update filters selection if the renamed tag was selected
            setFilters((prev) => ({
              ...prev,
              tags: prev.tags.map((t) => (t === oldName ? newName : t)),
            }));
            // Also update currently selected record if it has the tag
            setSelectedRecord((prev) =>
              prev && prev.tags.includes(oldName)
                ? {
                    ...prev,
                    tags: prev.tags.map((t) => (t === oldName ? newName : t)),
                  }
                : prev
            );
          }}
          onTagDeleted={(deleted) => {
            // Remove the deleted tag from all records in memory so the table updates
            setRecords((prev) =>
              prev.map((r) =>
                r.tags.includes(deleted)
                  ? { ...r, tags: r.tags.filter((t) => t !== deleted) }
                  : r
              )
            );
            setFilteredRecords((prev) =>
              prev.map((r) =>
                r.tags.includes(deleted)
                  ? { ...r, tags: r.tags.filter((t) => t !== deleted) }
                  : r
              )
            );
            setSelectedRecord((prev) =>
              prev && prev.tags.includes(deleted)
                ? { ...prev, tags: prev.tags.filter((t) => t !== deleted) }
                : prev
            );
            // Also remove from currently applied filters
            setFilters((prev) => ({
              ...prev,
              tags: prev.tags.filter((t) => t !== deleted),
            }));
          }}
        />

        {/* First-time user tutorial */}
        <TutorialDialog open={tutorialOpen} onClose={handleCloseTutorial} />
      </Box>
    </ThemeProvider>
  );
}
