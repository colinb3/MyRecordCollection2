import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Avatar,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate, useParams, Link as RouterLink } from "react-router-dom";
import TopBar from "./components/TopBar";
import apiUrl from "./api";
import { darkTheme } from "./theme";
import {
  getCachedUserInfo,
  loadUserInfo,
  clearUserInfoCache,
} from "./userInfo";
import { clearRecordTablePreferencesCache } from "./preferences";
import { clearCommunityCaches } from "./communityUsers";
import { setUserId } from "./analytics";

interface OwnerInfo {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
}

interface ListDetailData {
  id: number;
  name: string;
  description: string | null;
  isPrivate: boolean;
  likes: number;
  pictureUrl: string | null;
  recordCount: number;
  likedByCurrentUser?: boolean;
  owner: OwnerInfo | null;
  isOwner: boolean;
}

interface ListRecordEntry {
  id: number;
  name: string;
  artist: string | null;
  cover: string | null;
  rating: number | null;
  releaseYear: number | null;
  review: string | null;
  masterId: number | null;
  added: string | null;
  isCustom: boolean;
  sortOrder?: number;
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info";
}

interface SortableRecordItemProps {
  record: ListRecordEntry;
  isOwner: boolean;
  removing: boolean;
  renderCover: (cover: string | null, name: string) => React.ReactElement;
  onRemove: (record: ListRecordEntry) => void;
  onViewMaster: (masterId: number) => void;
}

function SortableRecordItem({
  record,
  isOwner,
  removing,
  renderCover,
  onRemove,
  onViewMaster,
}: SortableRecordItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: record.id, disabled: !isOwner });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Paper ref={setNodeRef} style={style} variant="outlined" sx={{ p: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{
          xs: "flex-start",
          sm: "center",
        }}
      >
        {isOwner && (
          <Box
            {...attributes}
            {...listeners}
            sx={{
              cursor: isDragging ? "grabbing" : "grab",
              display: "flex",
              alignItems: "center",
              color: "text.secondary",
              touchAction: "none",
            }}
          >
            <DragIndicatorIcon />
          </Box>
        )}
        {renderCover(record.cover, record.name)}
        <Box flex={1} minWidth={0}>
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {record.name}
          </Typography>
          {record.artist && (
            <Typography color="text.secondary" noWrap>
              {record.artist}
            </Typography>
          )}
          <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
            {record.rating !== null && (
              <Chip size="small" label={`Rating ${record.rating}/10`} />
            )}
            {record.releaseYear !== null && (
              <Chip size="small" label={`Released ${record.releaseYear}`} />
            )}
          </Stack>
          {record.review && (
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {record.review}
            </Typography>
          )}
        </Box>
        <Stack spacing={1} alignItems="center">
          {record.masterId && (
            <Button
              variant="text"
              size="small"
              onClick={() => onViewMaster(record.masterId!)}
            >
              View master
            </Button>
          )}
          {isOwner && (
            <Tooltip title="Remove from list">
              <span>
                <IconButton
                  color="error"
                  onClick={() => onRemove(record)}
                  disabled={removing}
                >
                  <DeleteIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
}

export default function ListDetail() {
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const navigate = useNavigate();
  const params = useParams();
  const listId = Number(params.listId);

  const handleLogout = useCallback(async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    clearCommunityCaches();
    try {
      setUserId(undefined);
    } catch {
      /* ignore analytics cleanup */
    }
    navigate("/login");
  }, [navigate]);

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<ListDetailData | null>(null);
  const [records, setRecords] = useState<ListRecordEntry[]>([]);
  const [likeBusy, setLikeBusy] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set());
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      if (info) {
        setUsername(info.username ?? "");
        setDisplayName(info.displayName ?? "");
        setProfilePicUrl(info.profilePicUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showMessage = useCallback(
    (message: string, severity: SnackbarState["severity"] = "success") => {
      setSnackbar({ open: true, message, severity });
    },
    []
  );

  const closeSnackbar = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const parseList = useCallback(
    (input: any): ListDetailData | null => {
      if (!input) return null;
      const id = Number(input.id) || listId;
      const likes =
        Number.isFinite(Number(input.likes)) && Number(input.likes) >= 0
          ? Math.trunc(Number(input.likes))
          : 0;
      return {
        id,
        name: typeof input.name === "string" ? input.name : "Untitled list",
        description:
          typeof input.description === "string" && input.description.trim()
            ? input.description.trim()
            : null,
        isPrivate: input.isPrivate === true || Number(input.isPrivate) === 1,
        likes,
        pictureUrl:
          typeof input.pictureUrl === "string" && input.pictureUrl.trim()
            ? input.pictureUrl
            : null,
        recordCount:
          Number.isFinite(Number(input.recordCount)) &&
          Number(input.recordCount) >= 0
            ? Math.trunc(Number(input.recordCount))
            : 0,
        likedByCurrentUser: input.likedByCurrentUser === true,
        owner: input.owner
          ? {
              username: String(input.owner.username ?? ""),
              displayName:
                typeof input.owner.displayName === "string" &&
                input.owner.displayName.trim()
                  ? input.owner.displayName.trim()
                  : null,
              profilePicUrl:
                typeof input.owner.profilePicUrl === "string" &&
                input.owner.profilePicUrl.trim()
                  ? input.owner.profilePicUrl
                  : null,
            }
          : null,
        isOwner: input.isOwner === true,
      };
    },
    [listId]
  );

  const parseRecords = useCallback((input: any): ListRecordEntry[] => {
    if (!Array.isArray(input)) return [];
    return input
      .map((row: any): ListRecordEntry | null => {
        const id = Number(row?.id);
        if (!Number.isInteger(id) || id <= 0) {
          return null;
        }
        const masterId = Number(row?.masterId);
        const rating = Number(row?.rating);
        const releaseYear = Number(row?.releaseYear);
        return {
          id,
          name: typeof row?.name === "string" ? row.name : "Unknown record",
          artist:
            typeof row?.artist === "string" && row.artist.trim()
              ? row.artist.trim()
              : null,
          cover:
            typeof row?.cover === "string" && row.cover.trim()
              ? row.cover.trim()
              : null,
          rating:
            Number.isFinite(rating) && rating >= 0 && rating <= 10
              ? Math.trunc(rating)
              : null,
          releaseYear:
            Number.isInteger(releaseYear) && releaseYear >= 1000
              ? releaseYear
              : null,
          review:
            typeof row?.review === "string" && row.review.trim()
              ? row.review.trim()
              : null,
          masterId:
            Number.isInteger(masterId) && masterId > 0 ? masterId : null,
          added:
            typeof row?.added === "string" && row.added.trim()
              ? row.added.trim()
              : null,
          isCustom: row?.isCustom === true || Number(row?.isCustom) === 1,
        };
      })
      .filter((entry): entry is ListRecordEntry => entry !== null);
  }, []);

  const loadList = useCallback(async () => {
    if (!Number.isInteger(listId) || listId <= 0) {
      showMessage("Invalid list id", "error");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/lists/${listId}`), {
        credentials: "include",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to load list");
      }
      const data = await response.json();
      const parsedList = parseList(data?.list);
      const parsedRecords = parseRecords(data?.records);
      setList(parsedList);
      setRecords(parsedRecords);
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to load list",
        "error"
      );
      setList(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [listId, parseList, parseRecords, showMessage]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const safeRecords = useMemo(() => records, [records]);

  const handleToggleLike = useCallback(async () => {
    if (!list) return;
    setLikeBusy(true);
    try {
      const response = await fetch(apiUrl(`/api/lists/${list.id}/like`), {
        method: list.likedByCurrentUser ? "DELETE" : "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to update like");
      }
      setList((prev) =>
        prev
          ? {
              ...prev,
              likedByCurrentUser: !prev.likedByCurrentUser,
              likes: Math.max(
                0,
                prev.likes + (prev.likedByCurrentUser ? -1 : 1)
              ),
            }
          : prev
      );
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to update like",
        "error"
      );
    } finally {
      setLikeBusy(false);
    }
  }, [list, showMessage]);

  const handleRemoveRecord = useCallback(
    async (record: ListRecordEntry) => {
      if (!list?.isOwner) return;
      setRemovingIds((prev) => new Set(prev).add(record.id));
      try {
        const response = await fetch(
          apiUrl(`/api/lists/${list.id}/records/${record.id}`),
          {
            method: "DELETE",
            credentials: "include",
          }
        );
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to remove record");
        }
        setRecords((prev) => prev.filter((item) => item.id !== record.id));
        setList((prev) =>
          prev
            ? {
                ...prev,
                recordCount: Math.max(0, prev.recordCount - 1),
              }
            : prev
        );
        showMessage("Record removed", "success");
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to remove record",
          "error"
        );
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(record.id);
          return next;
        });
      }
    },
    [list, showMessage]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id || !list?.isOwner) return;

      const oldIndex = records.findIndex((r) => r.id === active.id);
      const newIndex = records.findIndex((r) => r.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistically update the UI
      const reorderedRecords = arrayMove(records, oldIndex, newIndex);
      setRecords(reorderedRecords);

      // Prepare updates with new sortOrder values
      const updates = reorderedRecords.map((record, index) => ({
        id: record.id,
        sortOrder: index + 1,
      }));

      try {
        const response = await fetch(
          apiUrl(`/api/lists/${list.id}/records/reorder`),
          {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates }),
          }
        );

        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to reorder records");
        }

        showMessage("Order updated", "success");
      } catch (error) {
        console.error(error);
        // Revert on error
        setRecords(records);
        showMessage(
          error instanceof Error ? error.message : "Failed to reorder records",
          "error"
        );
      }
    },
    [records, list, showMessage]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const renderCover = useCallback((cover: string | null, name: string) => {
    if (cover) {
      return (
        <Avatar
          src={cover}
          alt={name}
          variant="rounded"
          sx={{ width: 72, height: 72, borderRadius: 2 }}
        />
      );
    }
    return (
      <Avatar
        variant="rounded"
        sx={{ width: 72, height: 72, borderRadius: 2, bgcolor: "grey.800" }}
      >
        <ImageNotSupportedIcon />
      </Avatar>
    );
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (!Number.isInteger(listId) || listId <= 0) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          minHeight="100vh"
        >
          <Typography color="text.secondary">
            Invalid list identifier.
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

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
          title="List"
          onLogout={handleLogout}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          searchPlaceholder="Search..."
        />
        <Box
          sx={{
            flex: 1,
            overflowY: { xs: "auto", md: "auto" },
            mt: 1,
            px: 1,
          }}
        >
          <Box
            maxWidth={860}
            mx="auto"
            sx={{ height: { md: "100%" }, pb: { xs: 4, sm: 0 } }}
          >
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                height: { md: "100%" },
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: { xs: 2, md: 3 },
                }}
              >
                <Stack spacing={2}>
                  <Button
                    startIcon={<ArrowBackIcon />}
                    variant="outlined"
                    onClick={handleBack}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Back
                  </Button>
                  {loading ? (
                    <Paper sx={{ p: 4, textAlign: "center" }}>
                      <CircularProgress />
                    </Paper>
                  ) : !list ? (
                    <Paper sx={{ p: 4 }}>
                      <Typography color="text.secondary">
                        List not available or you do not have access.
                      </Typography>
                    </Paper>
                  ) : (
                    <>
                      <Box>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={3}
                        >
                          <Box>
                            {list.pictureUrl ? (
                              <Avatar
                                src={
                                  list.pictureUrl.startsWith("http")
                                    ? list.pictureUrl
                                    : apiUrl(list.pictureUrl)
                                }
                                alt={list.name}
                                variant="rounded"
                                sx={{
                                  width: 140,
                                  height: 140,
                                  borderRadius: 2,
                                }}
                              />
                            ) : (
                              <Avatar
                                variant="rounded"
                                sx={{
                                  width: 140,
                                  height: 140,
                                  borderRadius: 2,
                                  bgcolor: "grey.800",
                                }}
                              >
                                <ImageNotSupportedIcon fontSize="large" />
                              </Avatar>
                            )}
                          </Box>
                          <Box flex={1} minWidth={0}>
                            <Typography variant="h5" fontWeight={700} mr={1}>
                              {list.name}
                            </Typography>
                            {list.owner && (
                              <Typography color="text.secondary" sx={{ mt: 1 }}>
                                Curated by{" "}
                                {list.owner.displayName ?? list.owner.username}
                              </Typography>
                            )}
                            {list.description && (
                              <Typography sx={{ mt: 1 }}>
                                {list.description}
                              </Typography>
                            )}
                            <Stack
                              direction="row"
                              spacing={1}
                              alignItems="center"
                              flexWrap="wrap"
                              mt={1.5}
                            >
                              <Chip
                                size="small"
                                color={list.isPrivate ? "default" : "primary"}
                                label={list.isPrivate ? "Private" : "Public"}
                              />
                              <Chip
                                size="small"
                                label={`${list.likes} likes`}
                              />
                              <Chip
                                size="small"
                                label={
                                  list.recordCount === 0
                                    ? "No records"
                                    : list.recordCount === 1
                                    ? `${list.recordCount} record`
                                    : `${list.recordCount} records`
                                }
                              />
                            </Stack>
                            <Stack
                              direction="row"
                              spacing={1.5}
                              mt={2}
                              flexWrap="wrap"
                            >
                              {!list.isOwner && (
                                <Button
                                  variant="contained"
                                  startIcon={
                                    list.likedByCurrentUser ? (
                                      <FavoriteIcon />
                                    ) : (
                                      <FavoriteBorderIcon />
                                    )
                                  }
                                  onClick={() => void handleToggleLike()}
                                  disabled={likeBusy}
                                >
                                  {list.likedByCurrentUser ? "Unlike" : "Like"}
                                </Button>
                              )}
                              {list.isOwner && (
                                <Button
                                  component={RouterLink}
                                  to="/lists"
                                  variant="text"
                                >
                                  Manage lists
                                </Button>
                              )}
                            </Stack>
                          </Box>
                        </Stack>
                      </Box>

                      <Paper sx={{ p: 3 }}>
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          mb={2}
                        >
                          <Typography variant="h6" fontWeight={700}>
                            Records
                          </Typography>
                          <Chip size="small" label={safeRecords.length} />
                        </Stack>
                        {safeRecords.length === 0 ? (
                          <Typography color="text.secondary">
                            This list does not contain any records yet.
                          </Typography>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                          >
                            <SortableContext
                              items={safeRecords.map((r) => r.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              <Stack spacing={2.5}>
                                {safeRecords.map((record) => (
                                  <SortableRecordItem
                                    key={record.id}
                                    record={record}
                                    isOwner={list?.isOwner ?? false}
                                    removing={removingIds.has(record.id)}
                                    renderCover={renderCover}
                                    onRemove={handleRemoveRecord}
                                    onViewMaster={(masterId) =>
                                      navigate(`/master/${masterId}`)
                                    }
                                  />
                                ))}
                              </Stack>
                            </SortableContext>
                          </DndContext>
                        )}
                      </Paper>
                    </>
                  )}
                </Stack>
              </Box>
            </Paper>
          </Box>
        </Box>
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={closeSnackbar}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={closeSnackbar}
            severity={snackbar.severity}
            variant="filled"
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}
