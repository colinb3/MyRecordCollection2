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
  ButtonBase,
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Slider,
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ShareButton from "./components/ShareButton";
import ReportDialog from "./components/ReportDialog";
import FlagIcon from "@mui/icons-material/Flag";
import CoverImage from "./components/CoverImage";
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
import { useNavigate, useParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import apiUrl from "./api";
import { darkTheme } from "./theme";
import { getCachedUserInfo, loadUserInfo } from "./userInfo";
import { optimizeProfileImageFile } from "./profileImageOptimizer";
import { formatLocalDate } from "./dateUtils";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import AddIcon from "@mui/icons-material/Add";
import { performLogout } from "./logout";

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
  created: string | null;
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
  masterId: number | null;
  added: string | null;
  sortOrder?: number;
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info";
  action?: React.ReactNode;
}

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif";

interface SortableRecordItemProps {
  record: ListRecordEntry;
  isOwner: boolean;
  removing: boolean;
  renderCover: (cover: string | null, name: string) => React.ReactElement;
  onRemove: (record: ListRecordEntry) => void;
  onViewMaster: (masterId: number) => void;
  onEdit: (record: ListRecordEntry) => void;
}

function SortableRecordItem({
  record,
  isOwner,
  removing,
  renderCover,
  onRemove,
  onViewMaster,
  onEdit,
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

  const canViewMaster =
    typeof record.masterId === "number" && record.masterId > 0;

  const handleMasterNavigate = useCallback(() => {
    if (!canViewMaster) {
      return;
    }
    onViewMaster(record.masterId!);
  }, [canViewMaster, onViewMaster, record.masterId]);

  const actionStackVisible = isOwner;

  return (
    <Paper ref={setNodeRef} style={style} variant="outlined">
      <Stack direction="row" alignItems="center">
        <ButtonBase
          component={canViewMaster ? "button" : "div"}
          onClick={canViewMaster ? handleMasterNavigate : undefined}
          tabIndex={canViewMaster ? 0 : -1}
          aria-disabled={!canViewMaster}
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            textAlign: "left",
            borderRadius: 1,
            p: 1,
            minWidth: 0,
            transition: "background-color 0.2s ease",
            cursor: canViewMaster ? "pointer" : "default",
            "&:hover": canViewMaster
              ? {
                  bgcolor: "action.hover",
                }
              : undefined,
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
                // Ensure the drag handle receives pointer events even when
                // the parent ButtonBase is disabled so dragging still works.
                pointerEvents: "auto",
              }}
            >
              <DragIndicatorIcon />
            </Box>
          )}
          <Box pl={1}>{renderCover(record.cover, record.name)}</Box>
          <Stack flex={1} minWidth={0} sx={{ gap: 0, ml: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {record.name}
            </Typography>
            {record.artist && (
              <Typography color="text.secondary" noWrap>
                {record.artist}
              </Typography>
            )}
            <Stack direction="row" spacing={1} mt={1} flexWrap="wrap">
              {record.releaseYear !== null && (
                <Chip size="small" label={`${record.releaseYear}`} />
              )}
              {record.rating !== null && record.rating > 0 && (
                <Chip size="small" label={`${record.rating}/10`} />
              )}
            </Stack>
            {/* list records no longer store freeform review text */}
          </Stack>
          {actionStackVisible && (
            <Stack
              spacing={0.5}
              alignItems="center"
              direction={{ xs: "column", sm: "row" }}
            >
              <span style={{ pointerEvents: "auto", display: "inline-flex" }}>
                <IconButton
                  color="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onEdit(record);
                  }}
                  disabled={removing}
                >
                  <EditIcon />
                </IconButton>
              </span>
              <span style={{ pointerEvents: "auto", display: "inline-flex" }}>
                <IconButton
                  color="error"
                  onClick={(e) => {
                    // prevent the ButtonBase parent from receiving this click
                    e.stopPropagation();
                    e.preventDefault();
                    onRemove(record);
                  }}
                  disabled={removing}
                >
                  <DeleteIcon />
                </IconButton>
              </span>
            </Stack>
          )}
        </ButtonBase>
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
  const [userLoading, setUserLoading] = useState(!cachedUser);

  const navigate = useNavigate();
  const params = useParams();
  const listId = Number(params.listId);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
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
  const [saving, setSaving] = useState(false);
  const [editState, setEditState] = useState<{
    open: boolean;
    name: string;
    description: string;
    isPrivate: boolean;
    pictureUrl: string | null;
  }>({
    open: false,
    name: "",
    description: "",
    isPrivate: false,
    pictureUrl: null,
  });
  const [editPictureFile, setEditPictureFile] = useState<File | null>(null);
  const [editPicturePreview, setEditPicturePreview] = useState<string | null>(
    null
  );
  const [removePictureFlag, setRemovePictureFlag] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    open: boolean;
  }>({ open: false });
  const [editRecordState, setEditRecordState] = useState<{
    open: boolean;
    record: ListRecordEntry | null;
    rating: number;
    releaseYear: number | null;
    cover: string;
  }>({ open: false, record: null, rating: 0, releaseYear: null, cover: "" });
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await loadUserInfo();
      if (cancelled) return;
      setUserLoading(false);
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
    (
      message: string,
      severity: SnackbarState["severity"] = "success",
      action?: React.ReactNode
    ) => {
      setSnackbar({ open: true, message, severity, action });
    },
    []
  );

  const closeSnackbar = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const parseList = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        created:
          typeof input.created === "string" && input.created.trim()
            ? input.created.trim()
            : null,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseRecords = useCallback((input: any): ListRecordEntry[] => {
    if (!Array.isArray(input)) return [];
    return (
      input
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any): ListRecordEntry | null => {
          const id = Number(row?.id);
          if (!Number.isInteger(id) || id <= 0) {
            return null;
          }
          const masterId = Number(row?.masterId);
          const rating = Number(row?.rating);
          const releaseYear = Number(row?.releaseYear);
          const sortOrder = Number(row?.sortOrder);
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
            masterId:
              Number.isInteger(masterId) && masterId > 0 ? masterId : null,
            added:
              typeof row?.added === "string" && row.added.trim()
                ? row.added.trim()
                : null,
            sortOrder:
              Number.isInteger(sortOrder) && sortOrder > 0
                ? sortOrder
                : undefined,
            // isCustom column was removed from ListRecord; determine custom status by absence of masterId when needed
          };
        })
        .filter((entry): entry is ListRecordEntry => entry !== null)
    );
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

  const handleUndoRemove = useCallback(
    async (removedRecord: ListRecordEntry) => {
      if (!list?.id) return;
      try {
        const body = {
          masterId: removedRecord.masterId,
          recordName: removedRecord.name,
          artist: removedRecord.artist,
          cover: removedRecord.cover,
          releaseYear: removedRecord.releaseYear,
          rating: removedRecord.rating,
          sortOrder: removedRecord.sortOrder, // Preserve original position
        };
        const response = await fetch(apiUrl(`/api/lists/${list.id}/records`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to restore record");
        }
        // Reload the entire list to get correct ordering from server
        await loadList();
        showMessage("Record restored", "success");
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to restore record",
          "error"
        );
      }
    },
    [list, loadList, showMessage]
  );

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

        // Show message with undo action
        showMessage(
          "Record removed",
          "success",
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              closeSnackbar();
              handleUndoRemove(record);
            }}
          >
            UNDO
          </Button>
        );
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
    [list, showMessage, handleUndoRemove, closeSnackbar]
  );

  const handleEditRecord = useCallback((record: ListRecordEntry) => {
    setEditRecordState({
      open: true,
      record,
      rating: record.rating ?? 0,
      releaseYear: record.releaseYear ?? null,
      cover: record.cover ?? "",
    });
  }, []);

  const handleCloseEditRecord = useCallback(() => {
    setEditRecordState({
      open: false,
      record: null,
      rating: 0,
      releaseYear: null,
      cover: "",
    });
  }, []);

  const handleSaveEditRecord = useCallback(async () => {
    if (!list || !editRecordState.record) return;

    const rating = editRecordState.rating;
    const releaseYear = editRecordState.releaseYear;
    const cover = editRecordState.cover?.trim() || null;

    try {
      const response = await fetch(
        apiUrl(`/api/lists/${list.id}/records/${editRecordState.record.id}`),
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, releaseYear, cover }),
        }
      );

      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to update record");
      }

      const data = await response.json();
      const updatedRecord = data?.record;

      if (updatedRecord) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === editRecordState.record!.id
              ? {
                  ...r,
                  rating: updatedRecord.rating ?? null,
                  releaseYear: updatedRecord.releaseYear ?? null,
                  cover: updatedRecord.cover ?? null,
                }
              : r
          )
        );
      }

      showMessage("Record updated", "success");
      handleCloseEditRecord();
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to update record",
        "error"
      );
    }
  }, [list, editRecordState, showMessage, handleCloseEditRecord]);

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

  const handleOpenEdit = useCallback(() => {
    if (!list) return;
    setEditState({
      open: true,
      name: list.name,
      description: list.description ?? "",
      isPrivate: list.isPrivate,
      pictureUrl: list.pictureUrl,
    });
    setEditPictureFile(null);
    setEditPicturePreview(null);
    setRemovePictureFlag(false);
  }, [list]);

  const handleCloseEdit = useCallback(() => {
    setEditState({
      open: false,
      name: "",
      description: "",
      isPrivate: false,
      pictureUrl: null,
    });
    setEditPictureFile(null);
    setEditPicturePreview(null);
    setRemovePictureFlag(false);
  }, []);

  const handleEditPictureChange = useCallback(async (file: File | null) => {
    if (!file) {
      setEditPictureFile(null);
      setEditPicturePreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }
    try {
      const optimized = await optimizeProfileImageFile(file);
      setEditPictureFile(optimized);
      setEditPicturePreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(optimized);
      });
      setRemovePictureFlag(false);
    } catch (error) {
      console.error("Failed to optimize image:", error);
      // Fall back to original file on error
      setEditPictureFile(file);
      setEditPicturePreview((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return URL.createObjectURL(file);
      });
      setRemovePictureFlag(false);
    }
  }, []);

  const handleRemoveEditPicture = useCallback(() => {
    if (editPicturePreview) {
      URL.revokeObjectURL(editPicturePreview);
    }
    setEditPictureFile(null);
    setEditPicturePreview(null);
    setRemovePictureFlag(true);
  }, [editPicturePreview]);

  const handleSaveEdit = useCallback(async () => {
    if (!list) return;
    const name = editState.name.trim();
    if (!name) {
      showMessage("List name is required", "error");
      return;
    }
    setSaving(true);
    try {
      // First update the list metadata
      const response = await fetch(apiUrl(`/api/lists/${list.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description: editState.description.trim() || null,
          isPrivate: editState.isPrivate,
        }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to update list");
      }

      // Handle picture removal if flagged
      if (removePictureFlag) {
        const removeResponse = await fetch(
          apiUrl(`/api/lists/${list.id}/picture`),
          {
            method: "DELETE",
            credentials: "include",
          }
        );
        if (!removeResponse.ok) {
          console.error("Failed to remove picture");
        }
      }

      // Handle new picture upload
      if (editPictureFile) {
        const formData = new FormData();
        formData.append("picture", editPictureFile);
        const uploadResponse = await fetch(
          apiUrl(`/api/lists/${list.id}/picture`),
          {
            method: "POST",
            credentials: "include",
            body: formData,
          }
        );
        if (!uploadResponse.ok) {
          console.error("Failed to upload new picture");
        }
      }

      showMessage("List updated", "success");
      handleCloseEdit();
      await loadList();
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to update list",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }, [
    list,
    editState,
    editPictureFile,
    removePictureFlag,
    showMessage,
    handleCloseEdit,
    loadList,
  ]);

  const handleOpenDeleteConfirmation = useCallback(() => {
    setDeleteConfirmation({ open: true });
  }, []);

  const handleCloseDeleteConfirmation = useCallback(() => {
    setDeleteConfirmation({ open: false });
  }, []);

  const handleDeleteList = useCallback(async () => {
    if (!list) return;
    setSaving(true);
    handleCloseDeleteConfirmation();
    try {
      const response = await fetch(apiUrl(`/api/lists/${list.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to delete list");
      }
      showMessage("List deleted", "success");
      navigate("/lists");
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to delete list",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }, [list, showMessage, handleCloseDeleteConfirmation, navigate]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const renderCover = useCallback((cover: string | null, name: string) => {
    return (
      <CoverImage
        src={cover}
        alt={name}
        variant="rounded"
        sx={{ width: 72, height: 72, borderRadius: 2 }}
      />
    );
  }, []);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleNavigateToMaster = useCallback(
    (masterId: number | null) => {
      if (!masterId || !Number.isInteger(masterId) || masterId <= 0) return;

      // Just navigate - browser history will handle the back button
      navigate(`/master/${masterId}`);
    },
    [navigate]
  );

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
          px: { md: 1.5, xs: 1 },
          pt: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar
          title="Lists"
          onLogout={handleLogout}
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          searchPlaceholder="Search..."
          loading={userLoading}
        />
        <Box sx={{ flex: 1, overflowY: "auto", pb: 4, px: 1 }}>
          <Box maxWidth={860} mx="auto" sx={{ mt: 1 }}>
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
                        <Stack direction={{ xs: "row", sm: "row" }} spacing={2}>
                          <Box>
                            <CoverImage
                              src={
                                list.pictureUrl
                                  ? list.pictureUrl.startsWith("http")
                                    ? list.pictureUrl
                                    : apiUrl(list.pictureUrl)
                                  : null
                              }
                              alt={list.name}
                              variant="rounded"
                              sx={{
                                width: { xs: 120, sm: 140 },
                                height: { xs: 120, sm: 140 },
                                borderRadius: 2,
                              }}
                              iconSize="large"
                            />
                          </Box>
                          <Box flex={1} minWidth={0}>
                            <Stack
                              direction={"row"}
                              justifyContent={"space-between"}
                            >
                              <Typography
                                variant="h5"
                                fontWeight={700}
                                mr={1}
                                textOverflow={"ellipsis"}
                                overflow={"hidden"}
                              >
                                {list.name}{" "}
                                {list.isOwner ? (
                                  list.isPrivate ? (
                                    <Tooltip title="Private list">
                                      <LockIcon
                                        fontSize="medium"
                                        sx={{ mb: -0.5 }}
                                      />
                                    </Tooltip>
                                  ) : (
                                    <Tooltip title="Public list">
                                      <PublicIcon
                                        fontSize="medium"
                                        sx={{ mb: -0.5 }}
                                      />
                                    </Tooltip>
                                  )
                                ) : null}
                              </Typography>
                              <Box>
                                {!list.isOwner && (
                                  <Stack
                                    direction="row"
                                    spacing={0}
                                    alignItems="center"
                                  >
                                    <Tooltip
                                      title={
                                        list.likedByCurrentUser
                                          ? "Unlike"
                                          : "Like"
                                      }
                                    >
                                      <span>
                                        <IconButton
                                          color={
                                            list.likedByCurrentUser
                                              ? "error"
                                              : "default"
                                          }
                                          size="small"
                                          onClick={() =>
                                            void handleToggleLike()
                                          }
                                          disabled={likeBusy}
                                        >
                                          {list.likedByCurrentUser ? (
                                            <FavoriteIcon />
                                          ) : (
                                            <FavoriteBorderIcon />
                                          )}
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Typography
                                      variant="body1"
                                      color="text.secondary"
                                      sx={{}}
                                    >
                                      {list.likes}
                                    </Typography>
                                  </Stack>
                                )}
                                {list.isOwner && (
                                  <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={handleOpenEdit}
                                    >
                                      <EditIcon />
                                    </IconButton>
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={handleOpenDeleteConfirmation}
                                      disabled={saving}
                                    >
                                      <DeleteIcon />
                                    </IconButton>
                                  </Stack>
                                )}
                              </Box>
                            </Stack>
                            {list.owner && (
                              <ButtonBase
                                onClick={() =>
                                  navigate(
                                    `/community/${encodeURIComponent(
                                      list.owner!.username
                                    )}`
                                  )
                                }
                                sx={{
                                  mt: 1,
                                  ml: -0.5,
                                  borderRadius: 1,
                                  px: 0.5,
                                  py: 0.25,
                                  "&:hover": {
                                    bgcolor: "action.hover",
                                  },
                                }}
                              >
                                <Typography color="text.secondary">
                                  Curated by{" "}
                                  {list.owner.displayName ??
                                    list.owner.username}
                                </Typography>
                              </ButtonBase>
                            )}
                            {list.description && (
                              <Typography sx={{ mt: 1 }}>
                                {list.description}
                              </Typography>
                            )}
                            <Stack
                              direction="row"
                              alignItems="center"
                              flexWrap="wrap"
                              mt={1.5}
                              sx={{ gap: 1 }}
                            >
                              {list.created && (
                                <Chip
                                  size="small"
                                  color="primary"
                                  label={
                                    formatLocalDate(list.created) ??
                                    list.created
                                  }
                                />
                              )}
                              {list.isOwner && (
                                <Chip
                                  size="small"
                                  label={
                                    list.likes === 1
                                      ? `${list.likes} like`
                                      : `${list.likes} likes`
                                  }
                                />
                              )}
                              {!list.isPrivate && (
                                <ShareButton
                                  size="small"
                                  title={list.name}
                                  text={`Check out this list: ${list.name}`}
                                />
                              )}
                              {!list.isOwner && username && (
                                <Tooltip title="Report list">
                                  <IconButton
                                    size="small"
                                    color="inherit"
                                    onClick={() => setReportDialogOpen(true)}
                                  >
                                    <FlagIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </Box>
                        </Stack>
                      </Box>

                      <Paper
                        sx={{
                          px: { xs: 2, md: 3 },
                          pb: { xs: 2, md: 3 },
                          pt: 1.5,
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1}
                          alignItems="center"
                          mb={1.5}
                          px={1}
                          justifyContent={"space-between"}
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                          >
                            <Typography variant="h6" fontWeight={700}>
                              Records
                            </Typography>
                            <Chip size="small" label={safeRecords.length} />
                          </Stack>
                          <Box>
                            {list.isOwner && (
                              <Tooltip title="Add to List">
                                <IconButton
                                  aria-label="add record"
                                  onClick={() => navigate("/search")}
                                  size="small"
                                >
                                  <AddIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
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
                              <Stack spacing={0.75}>
                                {safeRecords.map((record) => (
                                  <SortableRecordItem
                                    key={record.id}
                                    record={record}
                                    isOwner={list?.isOwner ?? false}
                                    removing={removingIds.has(record.id)}
                                    renderCover={renderCover}
                                    onRemove={handleRemoveRecord}
                                    onViewMaster={(masterId) =>
                                      handleNavigateToMaster(masterId)
                                    }
                                    onEdit={handleEditRecord}
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
            action={snackbar.action}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* Edit List Dialog */}
        <Dialog
          open={editState.open}
          onClose={handleCloseEdit}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ bgcolor: "background.paper" }}>
            Edit list
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: "background.paper" }}>
            <Stack direction={"row"} spacing={2} alignItems="center" mb={1}>
              {editPicturePreview ? (
                <Avatar
                  src={editPicturePreview}
                  variant="rounded"
                  alt={editState.name}
                  sx={{ width: 96, height: 96, borderRadius: 2 }}
                />
              ) : (
                <CoverImage
                  src={
                    editState.pictureUrl && !removePictureFlag
                      ? editState.pictureUrl.startsWith("http")
                        ? editState.pictureUrl
                        : apiUrl(editState.pictureUrl)
                      : null
                  }
                  variant="rounded"
                  alt={editState.name}
                  sx={{ width: 96, height: 96, borderRadius: 2 }}
                />
              )}
              <Stack spacing={1}>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<PhotoCameraIcon />}
                  disabled={saving}
                  size="small"
                >
                  {editPicturePreview ||
                  (editState.pictureUrl && !removePictureFlag)
                    ? "Change Image"
                    : "Upload Image"}
                  <input
                    type="file"
                    hidden
                    accept={ACCEPTED_IMAGE_TYPES}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      handleEditPictureChange(file);
                      event.target.value = "";
                    }}
                  />
                </Button>
                {(editPicturePreview ||
                  (editState.pictureUrl && !removePictureFlag)) && (
                  <Button
                    variant="text"
                    size="small"
                    onClick={handleRemoveEditPicture}
                    disabled={saving}
                  >
                    Remove Image
                  </Button>
                )}
                <Typography variant="caption" color="text.secondary">
                  JPG, PNG, WEBP, or AVIF (3 MB)
                </Typography>
              </Stack>
            </Stack>
            <Stack sx={{ mt: 2 }}>
              <TextField
                label="List name"
                value={editState.name}
                onChange={(event) =>
                  setEditState((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
                sx={{ mb: 2 }}
              />
              <TextField
                label="Description"
                value={editState.description}
                size="small"
                onChange={(event) =>
                  setEditState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                multiline
                minRows={2}
                maxRows={4}
                sx={{
                  "& .MuiInputBase-root": {
                    height: "auto",
                  },
                  mb: 1,
                }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editState.isPrivate}
                    onChange={(event) =>
                      setEditState((prev) => ({
                        ...prev,
                        isPrivate: event.target.checked,
                      }))
                    }
                  />
                }
                label="Private"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ bgcolor: "background.paper" }}>
            <Button onClick={handleCloseEdit}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => void handleSaveEdit()}
              disabled={saving}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={deleteConfirmation.open}
          onClose={handleCloseDeleteConfirmation}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Delete List?</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete the list "{list?.name}"?
              {list && list.recordCount > 0 && (
                <>
                  {" "}
                  This list contains {list.recordCount} record
                  {list.recordCount !== 1 ? "s" : ""}.
                </>
              )}
            </Typography>
            <Typography sx={{ mt: 2, color: "text.secondary" }}>
              This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDeleteConfirmation}>Cancel</Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => void handleDeleteList()}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Record Dialog */}
        <Dialog
          open={editRecordState.open}
          onClose={handleCloseEditRecord}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ bgcolor: "background.paper" }}>
            Edit Record
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: "background.paper" }}>
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ pb: 0.5 }}>
                {editRecordState.record?.name} -{" "}
                {editRecordState.record?.artist}
              </Typography>
              <TextField
                label="Cover URL"
                size="small"
                value={editRecordState.cover}
                onChange={(e) =>
                  setEditRecordState((prev) => ({
                    ...prev,
                    cover: e.target.value,
                  }))
                }
                sx={{ pb: 1 }}
              />
              <TextField
                label="Release Year"
                type="number"
                size="small"
                value={editRecordState.releaseYear ?? ""}
                onChange={(e) =>
                  setEditRecordState((prev) => ({
                    ...prev,
                    releaseYear: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                slotProps={{
                  input: {
                    inputProps: { min: 1901, max: 2100 },
                  },
                }}
              />
              <Box>
                <Typography gutterBottom>
                  Rating: {editRecordState.rating}/10
                </Typography>
                <Box
                  sx={{
                    justifySelf: "center",
                    width: "94%",
                  }}
                >
                  <Slider
                    value={editRecordState.rating}
                    onChange={(_, newValue) =>
                      setEditRecordState((prev) => ({
                        ...prev,
                        rating: newValue as number,
                      }))
                    }
                    min={0}
                    max={10}
                    step={1}
                    valueLabelDisplay="auto"
                    sx={{
                      "& .MuiSlider-rail, & .MuiSlider-track": { height: 6 },
                      height: 0,
                      "& .MuiSlider-thumb": {
                        width: 18,
                        height: 18,
                      },
                    }}
                  />
                </Box>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ bgcolor: "background.paper" }}>
            <Button onClick={handleCloseEditRecord}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => void handleSaveEditRecord()}
            >
              Save
            </Button>
          </DialogActions>
        </Dialog>

        <ReportDialog
          open={reportDialogOpen}
          onClose={() => setReportDialogOpen(false)}
          type="list"
          targetId={listId ?? undefined}
          targetName={list?.name || "Unknown List"}
        />
      </Box>
    </ThemeProvider>
  );
}
