import { useState, useEffect, useCallback } from "react";
import apiUrl from "./api";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  IconButton,
  Drawer,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import FilterListAltIcon from "@mui/icons-material/FilterListAlt";
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
  clearRecordTablePreferencesCache,
  getCachedRecordTablePreferences,
  loadRecordTablePreferences,
} from "./preferences";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { clearCommunityCaches } from "./communityUsers";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { setUserId } from "./analytics";

// Import Components
import TopBar from "./components/TopBar";
import RecordTable from "./components/RecordTable";
import FilterSidebar from "./components/FilterSidebar";
import ButtonBar from "./components/ButtonBar";
import MoveRecordDialog from "./components/MoveRecordDialog";
import EditRecordDialog from "./components/EditRecordDialog";
import ManageTagsDialog from "./components/ManageTagsDialog";

interface CollectionProps {
  tableName: string;
  title?: string;
}

const initialFilters: Filters = {
  tags: [],
  rating: { min: 0, max: 10 },
  release: { min: 1877, max: 2100 },
};

export default function Collection({ tableName, title }: CollectionProps) {
  const cachedRecordTablePreferences = getCachedRecordTablePreferences();
  const cachedUserInfo = getCachedUserInfo();
  const [records, setRecords] = useState<Record[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<Record[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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

  const [selectedRecord, setSelectedRecord] = useState<Record | null>(null);
  // Track the last actual (persisted) selected record so we can restore after cancelling a create
  const [lastRealSelectedRecord, setLastRealSelectedRecord] =
    useState<Record | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState<"edit" | "create">("edit");
  // Deletion dialog & snackbar
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
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
  const handleViewMasterRecord = useCallback(() => {
    if (!selectedRecord || !selectedRecord.masterId) {
      return;
    }

    const albumPayload = {
      id: `collection-${selectedRecord.id}`,
      record: selectedRecord.record,
      artist: selectedRecord.artist,
      cover: selectedRecord.cover ?? "",
    };

    const originPath = `${location.pathname}${location.search}${location.hash}`;

    navigate(`/record?q=${selectedRecord.masterId}`, {
      state: {
        album: albumPayload,
        masterId: selectedRecord.masterId,
        query: selectedRecord.record,
        fromCollection: {
          path: originPath,
          title: title ?? tableName,
          tableName,
        },
      },
    });
  }, [
    navigate,
    selectedRecord,
    location.pathname,
    location.search,
    location.hash,
    title,
    tableName,
  ]);

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
    processedRecords = processedRecords.filter(
      (r) =>
        r.release >= (filters.release?.min ?? 1877) &&
        r.release <= (filters.release?.max ?? 2100)
    );

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
            return (await res.json()) as Record[];
          })(),
          (async () => {
            const res = await fetch(apiUrl("/api/tags"), {
              credentials: "include",
            });
            if (!res.ok) {
              console.error("Failed to fetch tags", res.status);
              return null;
            }
            return (await res.json()) as string[];
          })(),
          loadRecordTablePreferences(),
        ]);

        if (cancelled) return;

        if (recordData) {
          setRecords(recordData);
          setFilteredRecords(recordData);
          setSelectedRecord(null);
          setLastRealSelectedRecord(null);
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

  // If navigated here with a message (e.g., after adding a record from FindRecord), show snackbar
  useEffect(() => {
    if (
      location &&
      (location as any).state &&
      (location as any).state.message
    ) {
      const msg = (location as any).state.message;
      setSnackbar({ open: true, message: msg, severity: "success" });
      // Clear history state so reloads/back navigation won't re-show the message
      try {
        window.history.replaceState({}, document.title);
      } catch {}
    }
  }, [location]);

  const handleLogout = async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    clearCommunityCaches();
    try {
      setUserId(undefined);
    } catch {}
    navigate("/login");
  };

  // Handler for selecting a record in the table
  const handleSelectRecord = (rec: Record | null) => {
    setSelectedRecord(rec);
    if (rec && rec.id !== -1) {
      setLastRealSelectedRecord(rec);
    }
  };

  // Open dialog for editing selected record
  const handleEditRecord = () => {
    if (selectedRecord) {
      setEditMode("edit");
      setEditDialogOpen(true);
    }
  };

  // Open dialog for creating a new record
  const handleCreateRecord = () => {
    setEditMode("create");
    setSelectedRecord({
      id: -1,
      cover: "",
      record: "",
      artist: "",
      rating: 0,
      isCustom: true,
      tags: [],
      release: 2024,
      added: new Date().toISOString().slice(0, 10),
    });
    setEditDialogOpen(true);
  };

  const handleDeleteRecord = () => {
    if (!selectedRecord || selectedRecord.id === -1) return;
    setDeleteDialogOpen(true);
  };

  const performDelete = async () => {
    if (!selectedRecord) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(apiUrl("/api/records/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: selectedRecord.id }),
      });
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
        setSelectedRecord(null);
        setLastRealSelectedRecord(null);
        setSnackbar({
          open: true,
          message: "Record deleted",
          severity: "success",
        });
      } else {
        const problem = await res.json().catch(() => ({}));
        setSnackbar({
          open: true,
          message: problem.error || "Failed to delete record",
          severity: "error",
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: "Network error deleting record",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleMoveRecord = () => {
    if (!selectedRecord) return;
    setMoveDialogOpen(true);
  };

  const handleRecordMoved = (
    targetCollection: string,
    serverMessage?: string
  ) => {
    // Remove from current list (since it's moving out of the current table)
    if (selectedRecord) {
      setRecords((prev) => prev.filter((r) => r.id !== selectedRecord.id));
      setFilteredRecords((prev) =>
        prev.filter((r) => r.id !== selectedRecord.id)
      );
      setSelectedRecord(null);
      setLastRealSelectedRecord(null);
    }
    setSnackbar({
      open: true,
      message: serverMessage || `Record moved to ${targetCollection}`,
      severity: "success",
    });
    setMoveDialogOpen(false);
  };

  // Save handler for dialog
  const handleSaveRecord = async (rec: Record) => {
    try {
      let updated: Record | null = null;
      if (editMode === "edit" && rec.id !== -1) {
        const res = await fetch(apiUrl("/api/records/update"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(rec),
        });
        if (res.ok) {
          updated = await res.json();
          setRecords((prev) =>
            prev.map((r) => (r.id === updated!.id ? updated! : r))
          );
          // Keep the selectedRecord in sync with the saved changes
          setSelectedRecord(updated);
        } else {
          const problem = await res.json().catch(() => ({}));
          setSnackbar({
            open: true,
            message: problem.error || `Failed to save record (${res.status})`,
            severity: "error",
          });
          return;
        }
      } else if (editMode === "create") {
        const createPayload = { ...rec, tableName };
        const res = await fetch(apiUrl("/api/records/create"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(createPayload),
        });
        if (res.ok) {
          updated = await res.json();
          setRecords((prev) => [...prev, updated!]);
          // Select the newly created record so editing it shows the latest data
          setSelectedRecord(updated);
          setLastRealSelectedRecord(updated);
        } else {
          const problem = await res.json().catch(() => ({}));
          setSnackbar({
            open: true,
            message: problem.error || `Failed to create record (${res.status})`,
            severity: "error",
          });
          return;
        }
      }

      // If the saved record returned tags, merge any new tags into allTags
      if (updated && Array.isArray(updated.tags)) {
        setAllTags((prev) => {
          const set = new Set(prev);
          for (const t of updated!.tags) set.add(t);
          return Array.from(set);
        });
      }

      setEditDialogOpen(false);
      if (updated) {
        setSnackbar({
          open: true,
          message: editMode === "create" ? "Record added" : "Record saved",
          severity: "success",
        });
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: "Failed to save record",
        severity: "error",
      });
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
          />
        </Box>

        <Box sx={{ flex: "0 0 auto", mb: 1 }}>
          <ButtonBar
            onSearchChange={setSearchTerm}
            onEditRecord={handleEditRecord}
            onCreateRecord={handleCreateRecord}
            onDeleteRecord={handleDeleteRecord}
            onMoveRecord={handleMoveRecord}
            onViewMaster={handleViewMasterRecord}
            editEnabled={!!selectedRecord}
            viewMasterEnabled={Boolean(selectedRecord?.masterId)}
            collectionTitle={title ?? tableName}
          />
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
              />
            </Grid>
          )}
        </Grid>
        <EditRecordDialog
          open={editDialogOpen}
          onClose={() => {
            // If creating and user cancels, restore previous real selection
            if (editMode === "create" && selectedRecord?.id === -1) {
              setSelectedRecord(lastRealSelectedRecord);
              setEditMode("edit");
            }
            setEditDialogOpen(false);
          }}
          onSave={handleSaveRecord}
          record={selectedRecord}
          tagOptions={allTags}
        />
        <Dialog
          open={deleteDialogOpen}
          onClose={() => !deleteLoading && setDeleteDialogOpen(false)}
        >
          <DialogTitle sx={{ bgcolor: "background.paper" }}>
            Delete Record
          </DialogTitle>
          <DialogContent sx={{ bgcolor: "background.paper" }}>
            <DialogContentText>
              {`Are you sure you want to permanently delete "${
                selectedRecord?.record || ""
              }"? This action cannot be undone.`}
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ bgcolor: "background.paper" }}>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
              sx={{ fontWeight: 700 }}
            >
              Cancel
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={performDelete}
              disabled={deleteLoading}
              sx={{ fontWeight: 700 }}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
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
            />
            <Box sx={{ textAlign: "right", p: 1 }}>
              <IconButton onClick={() => setSidebarOpen(false)}>
                <span style={{ fontSize: 24, fontWeight: "bold" }}>
                  &times;
                </span>
              </IconButton>
            </Box>
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
            setLastRealSelectedRecord((prev) =>
              prev && prev.tags.includes(oldName)
                ? {
                    ...prev,
                    tags: prev.tags.map((t) => (t === oldName ? newName : t)),
                  }
                : prev
            );
          }}
        />
        <MoveRecordDialog
          open={moveDialogOpen}
          recordId={selectedRecord?.id ?? null}
          currentCollection={tableName}
          onClose={() => setMoveDialogOpen(false)}
          onMoved={handleRecordMoved}
        />
      </Box>
    </ThemeProvider>
  );
}
