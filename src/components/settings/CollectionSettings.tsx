/**
 * @author Colin Brown
 * @description Collection settings component for managing collection privacy and configuration
 * @fileformat React Component
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputLabel,
  LinearProgress,
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import Papa, { type ParseResult } from "papaparse";
import apiUrl from "../../api";
import { wikiGenres } from "../../wiki";
import { clearCommunityCaches } from "../../communityUsers";
import { updateTagsCache } from "../../userTags";
import {
  loadCollectionPrivacy,
  updateCollectionPrivacyCache,
  type CollectionPrivacyState,
} from "../../collectionPrivacy";
import {
  getCachedRecordTablePreferences,
  loadRecordTablePreferences,
  setCachedRecordTablePreferences,
} from "../../preferences";
import {
  createDefaultColumnVisibility,
  createDefaultRecordTablePreferences,
  RECORD_TABLE_COLUMNS,
  SORTABLE_RECORD_TABLE_COLUMNS,
  type ColumnVisibilityMap,
  type RecordTableColumnKey,
  type RecordTablePreferences,
  type RecordTableSortPreference,
} from "../../types";

const DEFAULT_COLLECTION = "My Collection";
const WISHLIST_COLLECTION = "Wishlist";
const LISTENED_COLLECTION = "Listened";
const MIN_RELEASE_YEAR = 1901;
const MAX_RELEASE_YEAR = 2100;

interface DiscogsCsvRow {
  [key: string]: string | undefined;
}

interface ParsedDiscogsRecord {
  artist: string;
  record: string;
  rating: number;
  release: number;
  rawDateAdded: string | null;
  releaseId: string | null;
}

interface ImportResult {
  created: number;
  skipped: number;
  withoutCover: number;
}

function normalizeArtist(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.endsWith(")")) {
    const start = trimmed.lastIndexOf("(");
    const end = trimmed.lastIndexOf(")");
    if (start !== -1 && end === trimmed.length - 1) {
      return trimmed.slice(0, start).trim();
    }
  }
  return trimmed;
}

function pickField(row: DiscogsCsvRow, candidates: string[]): string | "" {
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseDiscogsRows(rows: DiscogsCsvRow[]): ParsedDiscogsRecord[] {
  const parsed: ParsedDiscogsRecord[] = [];
  for (const row of rows) {
    const artistRaw = pickField(row, ["Artist", "artist"]);
    const titleRaw = pickField(row, ["Title", "title", "Release Title"]);
    if (!artistRaw || !titleRaw) continue;

    const ratingRaw = pickField(row, ["Rating", "rating"]);
    const releaseRaw = pickField(row, ["Released", "released", "Year", "year"]);
    const releaseIdRaw = pickField(row, [
      "release_id",
      "Release Id",
      "ReleaseId",
    ]);
    const rawDate = pickField(row, [
      "Date Added",
      "Added",
      "Collection Date Added",
    ]);

    let rating = 0;
    if (ratingRaw) {
      const numeric = Number(ratingRaw);
      if (!Number.isNaN(numeric) && numeric >= 0) {
        rating = Math.round(Math.min(5, numeric) * 2);
      }
    }

    let release = Number.parseInt(releaseRaw, 10);
    if (
      !Number.isInteger(release) ||
      release < MIN_RELEASE_YEAR ||
      release > MAX_RELEASE_YEAR
    ) {
      release = Math.min(
        Math.max(new Date().getFullYear(), MIN_RELEASE_YEAR),
        MAX_RELEASE_YEAR,
      );
    }

    let normalizedDate: string | null = null;
    if (rawDate) {
      const match = rawDate.match(/\d{4}-\d{2}-\d{2}/);
      if (match) {
        normalizedDate = match[0];
      } else {
        const parsedDate = new Date(rawDate);
        if (!Number.isNaN(parsedDate.getTime())) {
          normalizedDate = parsedDate.toISOString().slice(0, 10);
        }
      }
    }

    parsed.push({
      artist: normalizeArtist(artistRaw),
      record: titleRaw.trim(),
      rating,
      release,
      rawDateAdded: normalizedDate,
      releaseId: releaseIdRaw || null,
    });
  }
  return parsed;
}

export default function CollectionSettings() {
  const cachedRecordTablePreferences = getCachedRecordTablePreferences();
  const hadCachedPreferences = Boolean(cachedRecordTablePreferences);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedDiscogsRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [includeWikiTags, setIncludeWikiTags] = useState<boolean>(false);
  const [useDateAdded, setUseDateAdded] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [tagProgress, setTagProgress] = useState<number>(0);
  const [submittingRecords, setSubmittingRecords] = useState<boolean>(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "info";
  }>({ open: false, message: "", severity: "success" });
  const [importSummary, setImportSummary] = useState<ImportResult | null>(null);
  const [isCollectionPrivate, setIsCollectionPrivate] =
    useState<boolean>(false);
  const [isWishlistPrivate, setIsWishlistPrivate] = useState<boolean>(true);
  const [isListenedPrivate, setIsListenedPrivate] = useState<boolean>(false);
  const [collectionPrivacyLoading, setCollectionPrivacyLoading] =
    useState<boolean>(true);
  const [collectionPrivacySaving, setCollectionPrivacySaving] =
    useState<boolean>(false);
  const [wishlistPrivacyLoading, setWishlistPrivacyLoading] =
    useState<boolean>(true);
  const [wishlistPrivacySaving, setWishlistPrivacySaving] =
    useState<boolean>(false);
  const [listenedPrivacyLoading, setListenedPrivacyLoading] =
    useState<boolean>(true);
  const [listenedPrivacySaving, setListenedPrivacySaving] =
    useState<boolean>(false);
  const [clearingCollection, setClearingCollection] = useState(false);
  const [clearingTags, setClearingTags] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearDialogType, setClearDialogType] = useState<
    "collection" | "tags" | "wishlist" | null
  >(null);
  const [clearingWishlist, setClearingWishlist] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityMap>(
    () =>
      cachedRecordTablePreferences
        ? { ...cachedRecordTablePreferences.columnVisibility }
        : createDefaultColumnVisibility(),
  );
  const [defaultSortPref, setDefaultSortPref] =
    useState<RecordTableSortPreference>(() =>
      cachedRecordTablePreferences
        ? { ...cachedRecordTablePreferences.defaultSort }
        : createDefaultRecordTablePreferences().defaultSort,
    );
  const [prefsLoading, setPrefsLoading] = useState(!hadCachedPreferences);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const sampleRecords = useMemo(
    () => parsedRecords.slice(0, 5),
    [parsedRecords],
  );

  const applyDefaultPreferences = useCallback(() => {
    const defaults = createDefaultRecordTablePreferences();
    setColumnVisibility({ ...defaults.columnVisibility });
    setDefaultSortPref({ ...defaults.defaultSort });
  }, []);

  useEffect(() => {
    let active = true;

    loadRecordTablePreferences(!hadCachedPreferences)
      .then((prefs) => {
        if (!active) return;
        setColumnVisibility({ ...prefs.columnVisibility });
        setDefaultSortPref({ ...prefs.defaultSort });
      })
      .catch((err) => {
        if (active) {
          console.error("Failed to load record table preferences", err);
          applyDefaultPreferences();
        }
      })
      .finally(() => {
        if (active) setPrefsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyDefaultPreferences, hadCachedPreferences]);

  useEffect(() => {
    let active = true;

    setCollectionPrivacyLoading(true);
    setWishlistPrivacyLoading(true);
    setListenedPrivacyLoading(true);

    loadCollectionPrivacy()
      .then((privacy: CollectionPrivacyState) => {
        if (!active) return;
        setIsCollectionPrivate(Boolean(privacy.collection.isPrivate));
        setIsWishlistPrivate(Boolean(privacy.wishlist.isPrivate));
        setIsListenedPrivate(Boolean(privacy.listened.isPrivate));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load collection privacy";
        setIsCollectionPrivate(false);
        setIsWishlistPrivate(true);
        setIsListenedPrivate(false);
        setSnackbar({
          open: true,
          message,
          severity: "error",
        });
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setCollectionPrivacyLoading(false);
        setWishlistPrivacyLoading(false);
        setListenedPrivacyLoading(false);
      });

    return () => {
      active = false;
    };
  }, [setSnackbar]);

  const updatePrivacy = useCallback(
    async (
      tableName: string,
      checked: boolean,
      previousValue: boolean,
      setValue: (next: boolean) => void,
      setSaving: (next: boolean) => void,
      saving: boolean,
      successMessage: { private: string; public: string },
    ) => {
      if (saving) return;
      setValue(checked);
      setSaving(true);
      try {
        const res = await fetch(apiUrl("/api/collections/privacy"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tableName,
            isPrivate: checked,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          isPrivate?: unknown;
          tableName?: unknown;
        };
        if (!res.ok) {
          const message =
            (typeof payload.error === "string" && payload.error) ||
            "Failed to update privacy";
          throw new Error(message);
        }
        const resolvedTableName =
          typeof payload.tableName === "string" && payload.tableName.trim()
            ? payload.tableName.trim()
            : tableName;
        updateCollectionPrivacyCache(resolvedTableName, checked);
        clearCommunityCaches();
        setSnackbar({
          open: true,
          message: checked ? successMessage.private : successMessage.public,
          severity: "success",
        });
      } catch (err: unknown) {
        setValue(previousValue);
        const message =
          err instanceof Error ? err.message : "Failed to update privacy";
        setSnackbar({
          open: true,
          message,
          severity: "error",
        });
      } finally {
        setSaving(false);
      }
    },
    [setSnackbar],
  );

  const handleToggleCollectionPrivacy = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      const previous = isCollectionPrivate;
      await updatePrivacy(
        DEFAULT_COLLECTION,
        checked,
        previous,
        setIsCollectionPrivate,
        setCollectionPrivacySaving,
        collectionPrivacySaving,
        {
          private: "Your collection is now private.",
          public: "Your collection is now public.",
        },
      );
    },
    [collectionPrivacySaving, isCollectionPrivate, updatePrivacy],
  );

  const handleToggleWishlistPrivacy = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      const previous = isWishlistPrivate;
      await updatePrivacy(
        WISHLIST_COLLECTION,
        checked,
        previous,
        setIsWishlistPrivate,
        setWishlistPrivacySaving,
        wishlistPrivacySaving,
        {
          private: "Your wishlist is now private.",
          public: "Your wishlist is now public.",
        },
      );
    },
    [isWishlistPrivate, updatePrivacy, wishlistPrivacySaving],
  );

  const handleToggleListenedPrivacy = useCallback(
    async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      const previous = isListenedPrivate;
      await updatePrivacy(
        LISTENED_COLLECTION,
        checked,
        previous,
        setIsListenedPrivate,
        setListenedPrivacySaving,
        listenedPrivacySaving,
        {
          private: "Your listened collection is now private.",
          public: "Your listened collection is now public.",
        },
      );
    },
    [isListenedPrivate, listenedPrivacySaving, updatePrivacy],
  );

  const handleToggleColumn =
    (key: RecordTableColumnKey) => (event: ChangeEvent<HTMLInputElement>) => {
      if (key === "record") {
        setSnackbar({
          open: true,
          message: "The Record column is always shown.",
          severity: "info",
        });
        return;
      }
      const checked = event.target.checked;
      if (!checked) {
        const visibleCount =
          Object.values(columnVisibility).filter(Boolean).length;
        if (visibleCount <= 1) {
          setSnackbar({
            open: true,
            message: "At least one column must remain visible.",
            severity: "error",
          });
          return;
        }
      }
      setColumnVisibility((prev) => ({
        ...prev,
        [key]: checked,
      }));
    };

  const handleSortColumnChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value as RecordTableSortPreference["field"];
    if (!SORTABLE_RECORD_TABLE_COLUMNS.some((col) => col.key === value)) {
      return;
    }

    setDefaultSortPref((prev) => ({ field: value, order: prev.order }));

    if (!columnVisibility[value]) {
      setColumnVisibility((prev) => ({ ...prev, [value]: true }));
      const columnLabel =
        RECORD_TABLE_COLUMNS.find((col) => col.key === value)?.label || value;
      setSnackbar({
        open: true,
        message: `${columnLabel} was made visible so it can be used for sorting.`,
        severity: "info",
      });
    }
  };

  const handleSortOrderChange = (event: SelectChangeEvent<string>) => {
    const nextOrder = event.target.value === "asc" ? "asc" : "desc";
    setDefaultSortPref((prev) => ({ ...prev, order: nextOrder }));
  };

  const handleResetPreferences = () => {
    applyDefaultPreferences();
    setSnackbar({
      open: true,
      message: "Record table preferences reset to defaults.",
      severity: "info",
    });
  };

  const handleSavePreferences = async () => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    try {
      const payloadVisibility: ColumnVisibilityMap = {
        ...columnVisibility,
        record: true,
      };
      const res = await fetch(apiUrl("/api/preferences/record-table"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          columnVisibility: payloadVisibility,
          defaultSort: defaultSortPref,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error || "Failed to save preferences";
        setSnackbar({ open: true, message, severity: "error" });
        return;
      }

      if (data?.preferences) {
        const prefs = data.preferences as RecordTablePreferences;
        const newVisibility = createDefaultColumnVisibility();
        if (prefs.columnVisibility) {
          for (const column of RECORD_TABLE_COLUMNS) {
            const raw = (prefs.columnVisibility as ColumnVisibilityMap)[
              column.key
            ];
            if (typeof raw === "boolean") {
              newVisibility[column.key] = raw;
            }
          }
        }
        newVisibility.record = true;

        let newSort = { ...defaultSortPref };
        if (prefs.defaultSort) {
          newSort = { ...prefs.defaultSort };
        }

        setColumnVisibility(newVisibility);
        setDefaultSortPref(newSort);
        setCachedRecordTablePreferences({
          columnVisibility: newVisibility,
          defaultSort: newSort,
        });
      }

      setSnackbar({
        open: true,
        message: "Record table preferences saved",
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "Network error saving preferences",
        severity: "error",
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleFileParsed = useCallback((rows: DiscogsCsvRow[]) => {
    const parsed = parseDiscogsRows(rows);
    setParsedRecords(parsed);
    setImportSummary(null);
    if (parsed.length === 0) {
      setParseError("No valid records were found in the selected CSV file.");
    } else {
      setParseError(null);
      setSnackbar({
        open: true,
        message: `Loaded ${parsed.length} records from Discogs CSV`,
        severity: "info",
      });
    }
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      setParseError(null);
      Papa.parse<DiscogsCsvRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: ParseResult<DiscogsCsvRow>) => {
          if (results.errors && results.errors.length > 0) {
            setParseError("Failed to parse CSV file. Please check the format.");
            setParsedRecords([]);
            return;
          }
          handleFileParsed(results.data ?? []);
        },
        error: () => {
          setParseError("Failed to read CSV file. Please try again.");
          setParsedRecords([]);
        },
      });
    },
    [handleFileParsed],
  );

  const resetSelection = () => {
    setFileName(null);
    setParsedRecords([]);
    setParseError(null);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (parsedRecords.length === 0 || importing) return;
    setImporting(true);
    setImportSummary(null);
    setTagProgress(0);

    const payloadRecords = [];
    for (let i = 0; i < parsedRecords.length; i += 1) {
      const record = parsedRecords[i];
      let tags: string[] = [];
      if (includeWikiTags) {
        try {
          const fetched = await wikiGenres(record.record, record.artist, false);
          if (Array.isArray(fetched) && fetched.length > 0) {
            const unique = Array.from(
              new Set(fetched.map((tag) => tag.trim()).filter(Boolean)),
            );
            tags = unique.slice(0, 12);
          }
        } catch {
          // ignore tag fetch failures
        }
        setTagProgress(Math.round(((i + 1) / parsedRecords.length) * 100));
      }

      payloadRecords.push({
        record: record.record,
        artist: record.artist,
        rating: record.rating,
        release: record.release,
        tags,
        added: useDateAdded ? record.rawDateAdded : null,
        releaseId: record.releaseId,
      });
    }

    try {
      // Indicate we are now sending the assembled records to the server
      setSubmittingRecords(true);
      const res = await fetch(apiUrl("/api/import/discogs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tableName: DEFAULT_COLLECTION,
          records: payloadRecords,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data?.error || "Import failed";
        setSnackbar({ open: true, message, severity: "error" });
        return;
      }

      const summary: ImportResult = {
        created: Number(data.created) || 0,
        skipped: Number(data.skipped) || 0,
        withoutCover: Number(data.withoutCover) || 0,
      };
      setImportSummary(summary);
      const parts = [
        `${summary.created} records added`,
        summary.skipped ? `${summary.skipped} records skipped` : null,
        summary.withoutCover
          ? `${summary.withoutCover} records without cover art`
          : null,
      ].filter(Boolean);
      setSnackbar({
        open: true,
        message: `Import complete: ${parts.join(", ")}`,
        severity: "success",
      });
    } catch {
      setSnackbar({
        open: true,
        message: "Network error during import",
        severity: "error",
      });
    } finally {
      setImporting(false);
      setTagProgress(0);
      setSubmittingRecords(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Box>
        <Box>
          <Typography variant="h4" gutterBottom>
            Collection Settings
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Make your collection your own.
          </Typography>
        </Box>

        <Stack spacing={1.5}>
          <Typography variant="h6">Privacy</Typography>
          <Typography variant="body2" color="text.secondary">
            Control who can see your main collection or wishlist. Collection
            highlights remain visible even when these collections are private.
          </Typography>
          <Stack
            direction={"row"}
            spacing={0}
            alignItems={"center"}
            sx={{ flexWrap: "wrap" }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={isCollectionPrivate}
                    onChange={handleToggleCollectionPrivacy}
                    disabled={
                      collectionPrivacyLoading || collectionPrivacySaving
                    }
                  />
                }
                label="Private Collection"
                sx={{ pr: 1 }}
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={isListenedPrivate}
                    onChange={handleToggleListenedPrivacy}
                    disabled={listenedPrivacyLoading || listenedPrivacySaving}
                  />
                }
                label="Private Listened"
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexWrap: "wrap",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={isWishlistPrivate}
                    onChange={handleToggleWishlistPrivacy}
                    disabled={wishlistPrivacyLoading || wishlistPrivacySaving}
                  />
                }
                label="Private Wishlist"
                sx={{ pr: 1 }}
              />
            </Box>
            {(collectionPrivacyLoading ||
              collectionPrivacySaving ||
              wishlistPrivacyLoading ||
              wishlistPrivacySaving ||
              listenedPrivacyLoading ||
              listenedPrivacySaving) && (
              <CircularProgress size={22} sx={{ ml: { sm: 1 } }} />
            )}
          </Stack>
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Box sx={{ pb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Record Table Display
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose which columns appear by default when you open a collection,
            and pick the column that should be pre-sorted.
          </Typography>
        </Box>
        {prefsLoading && <LinearProgress />}
        <FormGroup row sx={{ flexWrap: "wrap", pb: 2 }}>
          {RECORD_TABLE_COLUMNS.filter((column) => column.hideable).map(
            (column) => (
              <FormControlLabel
                key={column.key}
                control={
                  <Switch
                    checked={columnVisibility[column.key]}
                    onChange={handleToggleColumn(column.key)}
                    disabled={prefsLoading || savingPrefs}
                  />
                }
                label={`${column.label}`}
                sx={{
                  minWidth: { xs: "33%", lg: "16.6%" },
                  m: 0,
                  mb: 1,
                }}
              />
            ),
          )}
        </FormGroup>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          pb={2}
          alignItems={{ xs: "stretch", sm: "flex-end" }}
        >
          <FormControl fullWidth size="small">
            <InputLabel id="default-sort-column-label">
              Default sort column
            </InputLabel>
            <Select
              labelId="default-sort-column-label"
              value={defaultSortPref.field}
              label="Default sort column"
              onChange={handleSortColumnChange}
              disabled={prefsLoading || savingPrefs}
            >
              {SORTABLE_RECORD_TABLE_COLUMNS.map((column) => (
                <MenuItem key={column.key} value={column.key}>
                  {column.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="default-sort-order-label">Sort order</InputLabel>
            <Select
              labelId="default-sort-order-label"
              value={defaultSortPref.order}
              label="Sort order"
              onChange={handleSortOrderChange}
              disabled={prefsLoading || savingPrefs}
            >
              <MenuItem value="asc">Ascending</MenuItem>
              <MenuItem value="desc">Descending</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Button
            variant="contained"
            onClick={handleSavePreferences}
            disabled={prefsLoading || savingPrefs}
          >
            {savingPrefs ? "Saving..." : "Save preferences"}
          </Button>
          <Button
            variant="outlined"
            onClick={handleResetPreferences}
            disabled={prefsLoading || savingPrefs}
          >
            Reset to defaults
          </Button>
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Import Discogs Collection
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Import your Discogs collection directly into My Record Collection.
            Export your{" "}
            <Link
              href="https://www.discogs.com/users/export"
              sx={{ color: "primary.main" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Discogs collection
            </Link>
            , choose your exported Discogs CSV file below, optionally enrich
            records with genre tags and date added values, and click import.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Note: Large collections may take some time to import. After your
            (optional) suggested tags have been added, you may leave the page
            while the server continues processing. Please remain on the page if
            you would like to see import results. Import can take 2 seconds per
            record if record is not already in our database.
          </Typography>
        </Box>
        <Paper
          sx={{
            p: 3,
            mb: 2,
            borderRadius: 2,
            backgroundColor: "background.paper",
          }}
        >
          <Stack direction="column" spacing={2} alignItems="stretch">
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Button
                variant="contained"
                startIcon={<CloudUploadIcon />}
                component="label"
                disabled={importing}
                sx={{ mb: 0 }}
              >
                {fileName ? "Replace CSV" : "Select Discogs CSV"}
                <input
                  hidden
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                />
              </Button>
              {fileName && (
                <Chip
                  label={fileName}
                  onDelete={importing ? undefined : resetSelection}
                  deleteIcon={<RestartAltIcon />}
                  color="primary"
                  variant="outlined"
                  sx={{ maxWidth: "100%" }}
                />
              )}
            </Box>

            <Box>
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={includeWikiTags}
                    onChange={(_, checked) => setIncludeWikiTags(checked)}
                    disabled={importing}
                  />
                }
                label="Add suggested tags from record genres"
                sx={{ mb: -2 }}
              />
            </Box>

            <Box>
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={useDateAdded}
                    onChange={(_, checked) => setUseDateAdded(checked)}
                    disabled={importing}
                  />
                }
                label="Import Discogs 'Date Added' values"
              />
            </Box>

            <Box>
              <Button
                variant="contained"
                color="success"
                onClick={handleImport}
                disabled={importing || parsedRecords.length === 0}
              >
                {importing
                  ? "Importing..."
                  : `Import ${parsedRecords.length || "0"} records`}
              </Button>
            </Box>
          </Stack>

          {importing && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress
                variant={
                  includeWikiTags && !submittingRecords
                    ? "determinate"
                    : "indeterminate"
                }
                value={
                  includeWikiTags && !submittingRecords
                    ? tagProgress
                    : undefined
                }
              />
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                {includeWikiTags && !submittingRecords
                  ? `Fetching wiki tags... ${tagProgress}% | Do not leave this page`
                  : "Submitted records to the server. Your import will continue in the background. You can leave this page."}
              </Typography>
            </Box>
          )}

          {parseError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {parseError}
            </Alert>
          )}

          {parsedRecords.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle1" gutterBottom>
                Preview ({parsedRecords.length} record
                {parsedRecords.length === 1 ? "" : "s"} found)
              </Typography>
              <List dense disablePadding>
                {sampleRecords.map((rec, idx) => (
                  <ListItem
                    key={`${rec.artist}-${rec.record}-${idx}`}
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={`${rec.artist} — ${rec.record}`}
                      secondary={`Year: ${rec.release} • Rating: ${rec.rating}${
                        useDateAdded && rec.rawDateAdded
                          ? ` • Added: ${rec.rawDateAdded}`
                          : ""
                      }`}
                    />
                  </ListItem>
                ))}
              </List>
              {parsedRecords.length > sampleRecords.length && (
                <Typography variant="caption" color="text.secondary">
                  Showing {sampleRecords.length} of {parsedRecords.length}{" "}
                  entries.
                </Typography>
              )}
            </Box>
          )}

          {importSummary && (
            <Alert severity="success" sx={{ mt: 3 }}>
              Imported {importSummary.created} record
              {importSummary.created === 1 ? "" : "s"}.
              {importSummary.skipped
                ? ` Skipped ${importSummary.skipped} duplicate${
                    importSummary.skipped === 1 ? "" : "s"
                  }.`
                : ""}
              {importSummary.withoutCover
                ? ` ${importSummary.withoutCover} record${
                    importSummary.withoutCover === 1 ? "" : "s"
                  } missing cover art.`
                : ""}
            </Alert>
          )}
        </Paper>
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForeverIcon />}
          onClick={() => {
            setClearDialogType("collection");
            setClearDialogOpen(true);
          }}
          disabled={importing || clearingCollection}
        >
          {clearingCollection ? "Clearing..." : `Clear ${DEFAULT_COLLECTION}`}
        </Button>

        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForeverIcon />}
          onClick={() => {
            setClearDialogType("wishlist");
            setClearDialogOpen(true);
          }}
          disabled={importing || clearingWishlist}
        >
          {clearingWishlist ? "Clearing..." : "Clear Wishlist"}
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<LocalOfferIcon />}
          onClick={() => {
            setClearDialogType("tags");
            setClearDialogOpen(true);
          }}
          disabled={importing || clearingTags}
        >
          {clearingTags ? "Clearing..." : "Clear Tags"}
        </Button>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setSnackbar((prev) => ({ ...prev, open: false }));
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          sx={{ width: "100%" }}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      <Dialog
        open={clearDialogOpen}
        onClose={() => {
          if (clearingCollection || clearingTags) return;
          setClearDialogOpen(false);
          setClearDialogType(null);
        }}
      >
        <DialogTitle sx={{ bgcolor: "background.paper" }}>
          {clearDialogType === "collection"
            ? "Delete Collection"
            : "Delete All Tags"}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: "background.paper" }}>
          <DialogContentText>
            {clearDialogType === "collection"
              ? `Are you sure you want to permanently delete all records in '${DEFAULT_COLLECTION}'? This action cannot be undone.`
              : "Are you sure you want to permanently delete all your tags? This will also remove tag associations from records."}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "background.paper" }}>
          <Button
            onClick={() => {
              setClearDialogOpen(false);
              setClearDialogType(null);
            }}
            disabled={clearingCollection || clearingTags}
            sx={{ fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              if (clearDialogType === "collection") {
                setClearingCollection(true);
                try {
                  const res = await fetch(apiUrl("/api/records/clear"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ tableName: DEFAULT_COLLECTION }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setSnackbar({
                      open: true,
                      message: data.error || "Failed to clear collection",
                      severity: "error",
                    });
                  } else {
                    setSnackbar({
                      open: true,
                      message: `Cleared ${
                        data.deleted || 0
                      } records from ${DEFAULT_COLLECTION}`,
                      severity: "success",
                    });
                    setParsedRecords([]);
                  }
                } catch {
                  setSnackbar({
                    open: true,
                    message: "Network error clearing collection",
                    severity: "error",
                  });
                } finally {
                  setClearingCollection(false);
                  setClearDialogOpen(false);
                  setClearDialogType(null);
                }
              } else if (clearDialogType === "tags") {
                setClearingTags(true);
                try {
                  const res = await fetch(apiUrl("/api/tags/clear"), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setSnackbar({
                      open: true,
                      message: data.error || "Failed to clear tags",
                      severity: "error",
                    });
                  } else {
                    setSnackbar({
                      open: true,
                      message: `Deleted ${
                        data.tagsDeleted || 0
                      } tags (removed ${data.taggedDeleted || 0} tag links)`,
                      severity: "success",
                    });
                    updateTagsCache([]);
                  }
                } catch {
                  setSnackbar({
                    open: true,
                    message: "Network error clearing tags",
                    severity: "error",
                  });
                } finally {
                  setClearingTags(false);
                  setClearDialogOpen(false);
                  setClearDialogType(null);
                }
              } else if (clearDialogType === "wishlist") {
                setClearingWishlist(true);
                try {
                  const res = await fetch(apiUrl("/api/collection/clear"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ tableName: "Wishlist" }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setSnackbar({
                      open: true,
                      message: data.error || "Failed to clear wishlist",
                      severity: "error",
                    });
                  } else {
                    setSnackbar({
                      open: true,
                      message: `Cleared ${
                        data.deleted || 0
                      } records from Wishlist`,
                      severity: "success",
                    });
                  }
                } catch {
                  setSnackbar({
                    open: true,
                    message: "Network error clearing wishlist",
                    severity: "error",
                  });
                } finally {
                  setClearingWishlist(false);
                  setClearDialogOpen(false);
                  setClearDialogType(null);
                }
              }
            }}
            disabled={clearingCollection || clearingTags || clearingWishlist}
            sx={{ fontWeight: 700 }}
          >
            {clearingCollection || clearingTags || clearingWishlist
              ? "Deleting..."
              : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
