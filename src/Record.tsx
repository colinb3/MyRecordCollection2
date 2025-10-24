import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Chip,
  Button,
  Avatar,
  Stack,
  Paper,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  ButtonBase,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LaunchIcon from "@mui/icons-material/Launch";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import placeholderCover from "./assets/missingImg.jpg";
import apiUrl from "./api";
import {
  clearUserInfoCache,
  getCachedUserInfo,
  loadUserInfo,
} from "./userInfo";
import { loadUserTags, clearTagsCache } from "./userTags";
import { setUserId } from "./analytics";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCollectionRecordsCache } from "./collectionRecords";
import { clearCommunityCaches } from "./communityUsers";
import { clearProfileHighlightsCache } from "./profileHighlights";
import type { Record as MrcRecord, RecordOwnerInfo } from "./types";
import EditRecordDialog from "./components/EditRecordDialog";
import MoveRecordDialog from "./components/MoveRecordDialog";
import { formatLocalDate } from "./dateUtils";

const DEFAULT_COLLECTION_NAME = "My Collection";

export default function RecordDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ recordId: string; username?: string }>();
  const ownerUsername = params.username ?? null;
  const recordIdParam = params.recordId ?? "";
  const recordIdNumber = Number(recordIdParam);
  const isValidRecordId =
    Number.isInteger(recordIdNumber) && recordIdNumber > 0;

  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const [record, setRecord] = useState<MrcRecord | null>(null);
  const [owner, setOwner] = useState<RecordOwnerInfo | null>(null);
  const [loadingRecord, setLoadingRecord] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [info, tags] = await Promise.all([
        loadUserInfo(),
        loadUserTags(),
      ]);

      if (cancelled) return;
      if (!info && !ownerUsername) {
        // Only require login if viewing own records, not community records
        navigate("/login");
        return;
      }
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

      if (Array.isArray(tags)) {
        const seen = new Map<string, string>();
        for (const tag of tags) {
          const lower = tag.toLowerCase();
          if (!seen.has(lower)) {
            seen.set(lower, tag);
          }
        }
        setAvailableTags(
          Array.from(seen.values()).sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" })
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Fetch the record from the API
  useEffect(() => {
    if (!isValidRecordId) {
      setError("Invalid record id.");
      setLoadingRecord(false);
      return;
    }

    let cancelled = false;
    setLoadingRecord(true);
    setError(null);

    const fetchRecord = async () => {
      try {
        const url = ownerUsername
          ? apiUrl(
              `/api/records/${recordIdNumber}?username=${encodeURIComponent(
                ownerUsername
              )}`
            )
          : apiUrl(`/api/records/${recordIdNumber}`);

        const res = await fetch(url, { credentials: "include" });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to load record");
        }

        const data = await res.json();

        if (cancelled) return;

        setRecord(data.record);
        setOwner(data.owner);
      } catch (err: unknown) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load record.";
        setError(message);
      } finally {
        if (!cancelled) {
          setLoadingRecord(false);
        }
      }
    };

    void fetchRecord();

    return () => {
      cancelled = true;
    };
  }, [isValidRecordId, recordIdNumber, ownerUsername]);

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
    clearTagsCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore analytics cleanup */
    }
    navigate("/login");
  }, [navigate]);

  const handleBack = useCallback(() => {
    if (ownerUsername) {
      navigate(`/community/${encodeURIComponent(ownerUsername)}/collection`);
      return;
    }
    navigate("/mycollection");
  }, [navigate, ownerUsername]);

  const handleOpenMasterRecord = useCallback(() => {
    if (!record) return;
    const masterId = record.masterId ?? null;
    const originPath = `${location.pathname}${location.search}${location.hash}`;
    const ownerDisplay = owner?.displayName?.trim()
      ? owner.displayName
      : ownerUsername
      ? `@${ownerUsername}`
      : null;
    const fromTitle = ownerDisplay
      ? `${ownerDisplay}'s Collection`
      : record.collectionName || record.tableName || DEFAULT_COLLECTION_NAME;

    const albumPayload = {
      id: `record-${record.id}`,
      record: record.record,
      artist: record.artist,
      cover: record.cover ?? "",
    };

    if (masterId) {
      navigate(`/master/${masterId}`, {
        state: {
          album: albumPayload,
          masterId,
          query: record.record,
          fromCollection: {
            path: originPath,
            title: fromTitle,
            tableName: record.collectionName ?? record.tableName,
          },
        },
      });
    } else {
      navigate("/search", {
        state: {
          album: albumPayload,
          query: `${record.artist} ${record.record}`.trim(),
          fromCollection: {
            path: originPath,
            title: fromTitle,
            tableName: record.collectionName ?? record.tableName,
          },
        },
      });
    }
  }, [location, navigate, owner, ownerUsername, record]);

  const handleOpenOwnerProfile = useCallback(() => {
    if (!ownerUsername) return;
    navigate(`/community/${encodeURIComponent(ownerUsername)}`);
  }, [navigate, ownerUsername]);

  const isOwnerView = ownerUsername
    ? ownerUsername === username
    : Boolean(username);
  const ownerDisplayName = owner?.displayName?.trim() || null;
  const ownerHandle = ownerUsername ? `@${ownerUsername}` : null;
  const ownerInitial = useMemo(() => {
    if (ownerDisplayName) return ownerDisplayName.charAt(0).toUpperCase();
    if (ownerUsername) return ownerUsername.charAt(0).toUpperCase();
    return "?";
  }, [ownerDisplayName, ownerUsername]);
  const ownerProfileAlt = ownerDisplayName ?? ownerHandle ?? "Record owner";
  const currentCollectionName =
    record?.collectionName ?? record?.tableName ?? null;

  const tagOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const addTags = (tags?: string[] | null) => {
      if (!Array.isArray(tags)) return;
      for (const tag of tags) {
        if (typeof tag !== "string") continue;
        const trimmed = tag.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        if (!seen.has(lower)) {
          seen.set(lower, trimmed);
        }
      }
    };
    addTags(availableTags);
    addTags(record?.tags ?? null);
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [availableTags, record?.tags]);

  const handleOpenEditDialog = () => {
    if (!record) return;
    setEditDialogOpen(true);
  };

  const handleSaveRecordChanges = async (updatedRecord: MrcRecord) => {
    if (!record) return;
    try {
      const res = await fetch(apiUrl("/api/records/update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatedRecord),
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        setSnackbar({
          open: true,
          message: problem.error || "Failed to save record",
          severity: "error",
        });
        return;
      }

      const saved = (await res.json().catch(() => updatedRecord)) as MrcRecord;
      setRecord((prev) =>
        prev
          ? {
              ...prev,
              ...saved,
            }
          : saved
      );
      setAvailableTags((prev) => {
        const seen = new Map<string, string>();
        const addTags = (tags?: string[] | null) => {
          if (!Array.isArray(tags)) return;
          for (const tag of tags) {
            if (typeof tag !== "string") continue;
            const trimmed = tag.trim();
            if (!trimmed) continue;
            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) {
              seen.set(lower, trimmed);
            }
          }
        };
        addTags(prev);
        addTags(saved.tags);
        return Array.from(seen.values()).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" })
        );
      });

      setEditDialogOpen(false);
      setSnackbar({
        open: true,
        message: "Record saved",
        severity: "success",
      });
      clearCollectionRecordsCache();
      clearProfileHighlightsCache();
      clearCommunityCaches();
    } catch {
      setSnackbar({
        open: true,
        message: "Failed to save record",
        severity: "error",
      });
    }
  };

  const handleRequestDelete = () => {
    if (!record) return;
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!record) return;
    setDeleteLoading(true);
    const successMessage = "Record deleted";
    let navigateTo: string | null = null;

    try {
      const res = await fetch(apiUrl("/api/records/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: record.id }),
      });

      if (!res.ok) {
        const problem = await res.json().catch(() => ({}));
        setSnackbar({
          open: true,
          message: problem.error || "Failed to delete record",
          severity: "error",
        });
        return;
      }

      clearCollectionRecordsCache();
      clearProfileHighlightsCache();
      clearCommunityCaches();
      navigateTo = ownerUsername
        ? `/community/${encodeURIComponent(ownerUsername)}/collection`
        : "/mycollection";
    } catch {
      setSnackbar({
        open: true,
        message: "Network error deleting record",
        severity: "error",
      });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      if (navigateTo) {
        navigate(navigateTo, {
          state: { message: successMessage },
        });
      }
    }
  };

  const handleOpenMoveDialog = () => {
    if (!record) return;
    setMoveDialogOpen(true);
  };

  const handleRecordMoved = (
    targetCollection: string,
    serverMessage?: string
  ) => {
    // Update the record with new collection and current date
    setRecord((prev) =>
      prev
        ? {
            ...prev,
            collectionName: targetCollection,
            tableName: targetCollection,
            added: new Date().toISOString(),
          }
        : prev
    );

    setMoveDialogOpen(false);
    setSnackbar({
      open: true,
      message: serverMessage || `Record moved to ${targetCollection}`,
      severity: "success",
    });
    clearCollectionRecordsCache();
    clearProfileHighlightsCache();
    clearCommunityCaches();
  };
  const handleSnackbarClose = (_: unknown, reason?: string) => {
    if (reason === "clickaway") return;
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const collectionLabel = useMemo(() => {
    if (record?.collectionName) return record.collectionName;
    if (record?.tableName) return record.tableName;
    if (ownerUsername) {
      const ownerDisplay = owner?.displayName?.trim()
        ? owner.displayName
        : `@${ownerUsername}`;
      return `${ownerDisplay}'s Collection`;
    }
    return DEFAULT_COLLECTION_NAME;
  }, [record, ownerUsername, owner]);

  const ratingText =
    record && record.rating > 0 ? `${record.rating}/10` : "Not rated";
  const releaseText =
    record && record.release > 0 ? `${record.release}` : "Unknown";
  const addedText = record
    ? formatLocalDate(record.added, dateFormatter) ?? "Unknown"
    : "Unknown";
  const showMasterButton = Boolean(record?.masterId);
  const showOwnerActions = isOwnerView && Boolean(record);
  const showActionRow = showMasterButton || showOwnerActions;
  const hasReview = Boolean(record?.review && record.review.trim());
  const tags = record?.tags ?? [];

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <TopBar
          title="Record Details"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          onLogout={handleLogout}
        />
        <Box
          component="main"
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: { xs: "auto", md: "auto" },
            mt: 1,
            pb: 2,
            px: 1,
          }}
        >
          <Box
            maxWidth={800}
            mx="auto"
            sx={{ height: { md: "100%" }, pb: { xs: 4, sm: 0 } }}
          >
            <Stack spacing={3}>
              {loadingRecord ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 240,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : record ? (
                <Stack spacing={3}>
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      display: "flex",
                      flexDirection: { xs: "column", md: "row" },
                      height: { md: "100%" },
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        flexBasis: { md: "45%" },
                        flexGrow: 1,
                        p: { xs: 2, md: 3 },
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ width: "100%" }}
                      >
                        <Button
                          variant="outlined"
                          startIcon={<ArrowBackIcon />}
                          onClick={handleBack}
                          sx={{ alignSelf: "flex-start", mb: 1.5, px: 1.9 }}
                        >
                          Back
                        </Button>
                        {ownerUsername && (
                          <Box sx={{ ml: 2, minWidth: 0, mb: 1.5 }}>
                            <ButtonBase
                              onClick={handleOpenOwnerProfile}
                              sx={{
                                borderRadius: 1,
                                px: 1,
                                py: 0.5,
                                textAlign: "right",
                                "&:hover": {
                                  bgcolor: "action.hover",
                                },
                                minWidth: 0,
                                maxWidth: "100%",
                              }}
                              aria-label={`View ${ownerDisplayName}'s profile`}
                            >
                              <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                sx={{ minWidth: 0 }}
                              >
                                <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="body1"
                                    fontWeight={600}
                                    sx={{
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      minWidth: 0,
                                    }}
                                  >
                                    {ownerDisplayName ?? ownerHandle}
                                  </Typography>
                                </Stack>
                                <Avatar
                                  src={owner?.profilePicUrl ?? undefined}
                                  alt={ownerProfileAlt}
                                  sx={{ width: 40, height: 40, flexShrink: 0 }}
                                >
                                  {ownerInitial}
                                </Avatar>
                              </Stack>
                            </ButtonBase>
                          </Box>
                        )}
                      </Stack>
                      <Stack
                        spacing={{ xs: 1, md: 2 }}
                        direction={{ xs: "column", md: "row" }}
                        alignItems={{ xs: "stretch", md: "flex-start" }}
                      >
                        <Box
                          sx={{
                            flexShrink: 0,
                            alignSelf: "flex-start",
                          }}
                        >
                          <Box
                            component="img"
                            src={record.cover || placeholderCover}
                            alt={record.record}
                            sx={{
                              width: { xs: 150, sm: 175, md: 200 },
                              height: { xs: 150, sm: 175, md: 200 },
                              borderRadius: 2,
                              objectFit: "cover",
                              aspectRatio: "1 / 1",
                            }}
                          />
                        </Box>
                        <Stack spacing={2} sx={{ flex: 1 }}>
                          <Stack spacing={0.5}>
                            <Typography variant="h4" component="h1">
                              {record.record}
                            </Typography>
                            <Typography variant="h6" color="text.secondary">
                              {record.artist}
                            </Typography>
                          </Stack>

                          <Divider flexItem />

                          <Stack>
                            <Stack direction="row" flexWrap="wrap" useFlexGap>
                              <Box mr={2.5} mb={1.5}>
                                <Typography
                                  variant="overline"
                                  color="text.secondary"
                                  sx={{ letterSpacing: 0.6 }}
                                >
                                  Collection
                                </Typography>
                                <Typography variant="body1">
                                  {collectionLabel}
                                </Typography>
                              </Box>
                              <Box mr={2.5} mb={1.5}>
                                <Typography
                                  variant="overline"
                                  color="text.secondary"
                                  sx={{ letterSpacing: 0.6 }}
                                >
                                  Rating
                                </Typography>
                                <Typography variant="body1">
                                  {ratingText}
                                </Typography>
                              </Box>
                              <Box mr={2.5} mb={1.5}>
                                <Typography
                                  variant="overline"
                                  color="text.secondary"
                                  sx={{ letterSpacing: 0.6 }}
                                >
                                  Release Year
                                </Typography>
                                <Typography variant="body1">
                                  {releaseText}
                                </Typography>
                              </Box>
                              <Box mr={2.5} mb={1.5}>
                                <Typography
                                  variant="overline"
                                  color="text.secondary"
                                  sx={{ letterSpacing: 0.6 }}
                                >
                                  Added
                                </Typography>
                                <Typography variant="body1">
                                  {addedText}
                                </Typography>
                              </Box>
                              {record.isCustom ? (
                                <Box mr={2.5} mb={1.5}>
                                  <Typography
                                    variant="overline"
                                    color="text.secondary"
                                    sx={{ letterSpacing: 0.6 }}
                                  >
                                    Entry Type
                                  </Typography>
                                  <Typography variant="body1">
                                    Custom
                                  </Typography>
                                </Box>
                              ) : null}
                            </Stack>

                            <Box mb={2}>
                              <Typography
                                variant="overline"
                                color="text.secondary"
                                sx={{ letterSpacing: 0.6 }}
                              >
                                Tags
                              </Typography>
                              {tags.length > 0 ? (
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  flexWrap="wrap"
                                  useFlexGap
                                >
                                  {tags.map((tag) => (
                                    <Chip
                                      key={tag}
                                      label={tag}
                                      sx={{ fontSize: "0.9rem" }}
                                    />
                                  ))}
                                </Stack>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  No tags added yet.
                                </Typography>
                              )}
                            </Box>

                            {hasReview ? (
                              <Box pb={1}>
                                <Typography
                                  variant="overline"
                                  color="text.secondary"
                                  sx={{ letterSpacing: 0.6 }}
                                >
                                  Review
                                </Typography>

                                <Typography
                                  variant="body1"
                                  sx={{ whiteSpace: "pre-line" }}
                                >
                                  {record.review}
                                </Typography>
                              </Box>
                            ) : null}
                          </Stack>

                          {showActionRow && (
                            <Stack
                              direction={{ xs: "column", sm: "row" }}
                              spacing={1.5}
                              useFlexGap
                              flexWrap="wrap"
                              alignItems={{
                                xs: "stretch",
                                sm: "flex-start",
                              }}
                            >
                              <Stack
                                direction={{ xs: "row", sm: "row" }}
                                spacing={1.5}
                                useFlexGap
                                flexWrap="wrap"
                                alignItems={{
                                  xs: "stretch",
                                  sm: "flex-start",
                                }}
                              >
                                {showMasterButton && (
                                  <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<LaunchIcon />}
                                    onClick={handleOpenMasterRecord}
                                  >
                                    Master
                                  </Button>
                                )}
                                {showOwnerActions && (
                                  <>
                                    <Button
                                      variant="outlined"
                                      startIcon={<EditOutlinedIcon />}
                                      onClick={handleOpenEditDialog}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      startIcon={<DriveFileMoveOutlinedIcon />}
                                      onClick={handleOpenMoveDialog}
                                    >
                                      Move
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      color="error"
                                      startIcon={<DeleteOutlineIcon />}
                                      onClick={handleRequestDelete}
                                    >
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </Stack>
                            </Stack>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  </Paper>
                </Stack>
              ) : (
                <Alert severity="info">Record not available.</Alert>
              )}
            </Stack>
          </Box>
        </Box>
      </Box>
      <EditRecordDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleSaveRecordChanges}
        record={record}
        tagOptions={tagOptions}
      />
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleteLoading && setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: "background.paper" }}>
          Delete Record
        </DialogTitle>
        <DialogContent sx={{ bgcolor: "background.paper" }}>
          <DialogContentText>
            {`Are you sure you want to permanently delete "${
              record?.record || "this record"
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
            onClick={handleDeleteConfirmed}
            disabled={deleteLoading}
            sx={{ fontWeight: 700 }}
          >
            {deleteLoading ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
      <MoveRecordDialog
        open={moveDialogOpen}
        recordId={record?.id ?? null}
        currentCollection={currentCollectionName}
        onClose={() => setMoveDialogOpen(false)}
        onMoved={handleRecordMoved}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
