import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Stack,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";
import LockIcon from "@mui/icons-material/Lock";
import PublicIcon from "@mui/icons-material/Public";
import { useNavigate } from "react-router-dom";
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
import {
  setCachedUserLists,
  removeCachedList,
  clearUserListsCache,
} from "./userLists";

interface OwnerInfo {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
}

interface ListSummary {
  id: number;
  name: string;
  description: string | null;
  isPrivate: boolean;
  likes: number;
  pictureUrl: string | null;
  created: string | null;
  recordCount: number;
}

interface PopularList extends ListSummary {
  owner: OwnerInfo | null;
  likedByCurrentUser?: boolean;
}

interface SnackbarState {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info";
}

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/avif";

export default function Lists() {
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );

  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await fetch(apiUrl("/api/logout"), {
      method: "POST",
      credentials: "include",
    });
    clearRecordTablePreferencesCache();
    clearUserInfoCache();
    clearCommunityCaches();
    clearUserListsCache();
    try {
      setUserId(undefined);
    } catch {
      /* ignore analytics cleanup */
    }
    navigate("/login");
  }, [navigate]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [myLists, setMyLists] = useState<ListSummary[]>([]);
  const [popularLists, setPopularLists] = useState<PopularList[]>([]);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    isPrivate: false,
  });
  const [createPictureFile, setCreatePictureFile] = useState<File | null>(null);
  const [createPicturePreview, setCreatePicturePreview] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: "",
    severity: "success",
  });
  const [editState, setEditState] = useState<{
    id: number | null;
    name: string;
    description: string;
    isPrivate: boolean;
    open: boolean;
    pictureUrl: string | null;
  }>({
    id: null,
    name: "",
    description: "",
    isPrivate: false,
    open: false,
    pictureUrl: null,
  });
  const [editPictureFile, setEditPictureFile] = useState<File | null>(null);
  const [editPicturePreview, setEditPicturePreview] = useState<string | null>(
    null
  );
  const [removePictureFlag, setRemovePictureFlag] = useState(false);

  const [likeBusyIds, setLikeBusyIds] = useState<Set<number>>(new Set());
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    open: boolean;
    list: ListSummary | null;
  }>({ open: false, list: null });

  useEffect(() => {
    return () => {
      if (createPicturePreview) {
        URL.revokeObjectURL(createPicturePreview);
      }
    };
  }, [createPicturePreview]);

  const handleCreatePictureChange = useCallback((file: File | null) => {
    setCreatePictureFile(file);
    setCreatePicturePreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  const handleClearCreatePicture = useCallback(() => {
    handleCreatePictureChange(null);
  }, [handleCreatePictureChange]);

  const handleEditPictureChange = useCallback((file: File | null) => {
    setEditPictureFile(file);
    setEditPicturePreview((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return file ? URL.createObjectURL(file) : null;
    });
    if (file) {
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

  const loadMine = useCallback(
    async () => {
      // Always fetch from server (no cache on Lists page)
      setLoadingMine(true);
      try {
        const response = await fetch(apiUrl("/api/lists/mine"), {
          credentials: "include",
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to load your lists");
        }
        const data = await response.json();
        const lists: ListSummary[] = Array.isArray(data?.lists)
          ? data.lists.map((entry: any) => ({
              id: Number(entry?.id) || 0,
              name: typeof entry?.name === "string" ? entry.name : "",
              description:
                typeof entry?.description === "string" &&
                entry.description.trim()
                  ? entry.description.trim()
                  : null,
              isPrivate:
                entry?.isPrivate === true || Number(entry?.isPrivate) === 1,
              likes: Number(entry?.likes) >= 0 ? Math.trunc(entry.likes) : 0,
              pictureUrl:
                typeof entry?.pictureUrl === "string" && entry.pictureUrl.trim()
                  ? entry.pictureUrl
                  : null,
              created:
                typeof entry?.created === "string" && entry.created.trim()
                  ? entry.created.trim()
                  : null,
              recordCount:
                Number(entry?.recordCount) >= 0
                  ? Math.trunc(entry.recordCount)
                  : 0,
            }))
          : [];
        setMyLists(lists);

        // Update cache with just names and IDs for MasterRecord page
        const cacheEntries = lists.map((list) => ({
          id: list.id,
          name: list.name,
        }));
        setCachedUserLists(cacheEntries);
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to load your lists",
          "error"
        );
      } finally {
        setLoadingMine(false);
      }
    },
    [showMessage]
  );

  const loadPopular = useCallback(async () => {
    setLoadingPopular(true);
    try {
      const response = await fetch(apiUrl("/api/lists/popular"), {
        credentials: "include",
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to load popular lists");
      }
      const data = await response.json();
      const lists: PopularList[] = Array.isArray(data?.lists)
        ? data.lists.map((entry: any) => ({
            id: Number(entry?.id) || 0,
            name: typeof entry?.name === "string" ? entry.name : "",
            description:
              typeof entry?.description === "string" && entry.description.trim()
                ? entry.description.trim()
                : null,
            isPrivate:
              entry?.isPrivate === true || Number(entry?.isPrivate) === 1,
            likes: Number(entry?.likes) >= 0 ? Math.trunc(entry.likes) : 0,
            pictureUrl:
              typeof entry?.pictureUrl === "string" && entry.pictureUrl.trim()
                ? entry.pictureUrl
                : null,
            created:
              typeof entry?.created === "string" && entry.created.trim()
                ? entry.created.trim()
                : null,
            recordCount:
              Number(entry?.recordCount) >= 0
                ? Math.trunc(entry.recordCount)
                : 0,
            owner: entry?.owner
              ? {
                  username: String(entry.owner?.username ?? ""),
                  displayName:
                    typeof entry.owner?.displayName === "string" &&
                    entry.owner.displayName.trim()
                      ? entry.owner.displayName.trim()
                      : null,
                  profilePicUrl:
                    typeof entry.owner?.profilePicUrl === "string" &&
                    entry.owner.profilePicUrl.trim()
                      ? entry.owner.profilePicUrl
                      : null,
                }
              : null,
            likedByCurrentUser: entry?.likedByCurrentUser === true,
          }))
        : [];
      setPopularLists(lists);
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to load popular lists",
        "error"
      );
    } finally {
      setLoadingPopular(false);
    }
  }, [showMessage]);

  useEffect(() => {
    void loadMine();
    void loadPopular();
  }, [loadMine, loadPopular]);

  const sortedMyLists = useMemo(
    () =>
      [...myLists].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      ),
    [myLists]
  );

  const handleCreateList = useCallback(async () => {
    const name = createForm.name.trim();
    if (!name) {
      showMessage("List name is required", "error");
      return;
    }
    const description = createForm.description.trim();
    const wasPrivate = createForm.isPrivate;
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("isPrivate", wasPrivate ? "true" : "false");
      if (description) {
        formData.append("description", description);
      }
      if (createPictureFile) {
        formData.append("picture", createPictureFile);
      }

      const response = await fetch(apiUrl("/api/lists"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || "Failed to create list");
      }
      showMessage("List created", "success");
      setCreateForm({ name: "", description: "", isPrivate: false });
      handleCreatePictureChange(null);
      await loadMine(); // Refresh to get newly created list
      if (!wasPrivate) {
        await loadPopular();
      }
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to create list",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }, [
    createForm,
    createPictureFile,
    handleCreatePictureChange,
    loadMine,
    loadPopular,
    showMessage,
  ]);

  const handleOpenEdit = useCallback((list: ListSummary) => {
    setEditState({
      id: list.id,
      name: list.name,
      description: list.description ?? "",
      isPrivate: list.isPrivate,
      open: true,
      pictureUrl: list.pictureUrl,
    });
    setEditPictureFile(null);
    setEditPicturePreview(null);
    setRemovePictureFlag(false);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditState({
      id: null,
      name: "",
      description: "",
      isPrivate: false,
      open: false,
      pictureUrl: null,
    });
    if (editPicturePreview) {
      URL.revokeObjectURL(editPicturePreview);
    }
    setEditPictureFile(null);
    setEditPicturePreview(null);
    setRemovePictureFlag(false);
  }, [editPicturePreview]);

  const handleSaveEdit = useCallback(async () => {
    if (!editState.id) return;
    const name = editState.name.trim();
    if (!name) {
      showMessage("List name is required", "error");
      return;
    }
    setSaving(true);
    try {
      // First update the list metadata
      const response = await fetch(apiUrl(`/api/lists/${editState.id}`), {
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
          apiUrl(`/api/lists/${editState.id}/picture`),
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
          apiUrl(`/api/lists/${editState.id}/picture`),
          {
            method: "POST",
            credentials: "include",
            body: formData,
          }
        );
        if (!uploadResponse.ok) {
          console.error("Failed to upload picture");
        }
      }

      // Reload lists to get updated data
      await loadMine(); // Refresh to get updated list data
      await loadPopular();
      showMessage("List updated", "success");
      handleCloseEdit();
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
    editState,
    editPictureFile,
    removePictureFlag,
    handleCloseEdit,
    loadMine,
    loadPopular,
    showMessage,
  ]);

  const handleOpenDeleteConfirmation = useCallback((list: ListSummary) => {
    setDeleteConfirmation({ open: true, list });
  }, []);

  const handleCloseDeleteConfirmation = useCallback(() => {
    setDeleteConfirmation({ open: false, list: null });
  }, []);

  const handleDeleteList = useCallback(async () => {
    const list = deleteConfirmation.list;
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
      setMyLists((prev) => prev.filter((item) => item.id !== list.id));
      setPopularLists((prev) => prev.filter((item) => item.id !== list.id));
      removeCachedList(list.id);
      showMessage("List deleted", "success");
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to delete list",
        "error"
      );
    } finally {
      setSaving(false);
    }
  }, [deleteConfirmation.list, handleCloseDeleteConfirmation, showMessage]);

  const withBusySet = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<Set<number>>>,
      listId: number,
      active: boolean
    ) => {
      setter((prev) => {
        const next = new Set(prev);
        if (active) {
          next.add(listId);
        } else {
          next.delete(listId);
        }
        return next;
      });
    },
    []
  );

  const handleToggleLike = useCallback(
    async (listId: number, currentlyLiked: boolean) => {
      withBusySet(setLikeBusyIds, listId, true);
      try {
        const response = await fetch(apiUrl(`/api/lists/${listId}/like`), {
          method: currentlyLiked ? "DELETE" : "POST",
          credentials: "include",
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to update like");
        }
        setPopularLists((prev) =>
          prev.map((item) =>
            item.id === listId
              ? {
                  ...item,
                  likedByCurrentUser: !currentlyLiked,
                  likes: Math.max(0, item.likes + (currentlyLiked ? -1 : 1)),
                }
              : item
          )
        );
        setMyLists((prev) =>
          prev.map((item) =>
            item.id === listId
              ? {
                  ...item,
                  likes: Math.max(0, item.likes + (currentlyLiked ? -1 : 1)),
                }
              : item
          )
        );
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to update like",
          "error"
        );
      } finally {
        withBusySet(setLikeBusyIds, listId, false);
      }
    },
    [showMessage, withBusySet]
  );

  const renderListPicture = useCallback(
    (pictureUrl: string | null, name: string) => {
      if (pictureUrl) {
        // Use apiUrl to ensure proper domain when deployed
        const imageUrl = pictureUrl.startsWith("http")
          ? pictureUrl
          : apiUrl(pictureUrl);
        return (
          <Avatar
            src={imageUrl}
            variant="rounded"
            alt={name}
            sx={{ width: 96, height: 96, borderRadius: 2 }}
          />
        );
      }
      return (
        <Avatar
          variant="rounded"
          sx={{
            width: 96,
            height: 96,
            borderRadius: 2,
            bgcolor: "grey.800",
          }}
        >
          <ImageNotSupportedIcon />
        </Avatar>
      );
    },
    []
  );

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
          title="Lists"
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
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    alignItems: "start",
                    gridTemplateColumns: {
                      xs: "minmax(0, 1fr)",
                      md: "minmax(0, 1fr) minmax(0, 1fr)",
                    },
                    gridAutoRows: "min-content",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                    }}
                  >
                    <Paper
                      sx={{
                        p: 2,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        minWidth: 0,
                      }}
                    >
                      <Box>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                          Popular lists
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                        {loadingPopular ? (
                          <Box display="flex" justifyContent="center" py={4}>
                            <CircularProgress />
                          </Box>
                        ) : popularLists.length === 0 ? (
                          <Typography color="text.secondary">
                            No public lists yet.
                          </Typography>
                        ) : (
                          <Stack spacing={2}>
                            {popularLists.map((list) => {
                              const liked = list.likedByCurrentUser === true;
                              const likeBusy = likeBusyIds.has(list.id);
                              const isOwner = list.owner?.username === username;
                              return (
                                <Paper
                                  key={list.id}
                                  variant="outlined"
                                  sx={{ p: 2 }}
                                >
                                  <Stack direction="row" spacing={2}>
                                    {renderListPicture(
                                      list.pictureUrl,
                                      list.name
                                    )}
                                    <Box
                                      sx={{
                                        ml: { xs: 2, md: 0 },
                                        minWidth: 0,
                                        flex: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="subtitle1"
                                        fontWeight={700}
                                        noWrap
                                      >
                                        {list.name}
                                      </Typography>
                                      {list.owner && (
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                          noWrap
                                        >
                                          by{" "}
                                          {list.owner.displayName ??
                                            list.owner.username}
                                        </Typography>
                                      )}
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        mt={1}
                                        flexWrap="wrap"
                                      >
                                        <Chip
                                          size="small"
                                          label={`${list.recordCount} records`}
                                        />
                                        <Chip
                                          size="small"
                                          label={
                                            list.likes === 1
                                              ? "1 like"
                                              : `${list.likes} likes`
                                          }
                                        />
                                      </Stack>
                                      <Stack
                                        direction="row"
                                        spacing={1}
                                        alignItems="center"
                                        mt={1.5}
                                      >
                                        {!isOwner && (
                                          <Tooltip
                                            title={liked ? "Unlike" : "Like"}
                                          >
                                            <span>
                                              <IconButton
                                                color={
                                                  liked ? "error" : "default"
                                                }
                                                size="small"
                                                onClick={() =>
                                                  void handleToggleLike(
                                                    list.id,
                                                    liked
                                                  )
                                                }
                                                disabled={likeBusy}
                                              >
                                                {liked ? (
                                                  <FavoriteIcon />
                                                ) : (
                                                  <FavoriteBorderIcon />
                                                )}
                                              </IconButton>
                                            </span>
                                          </Tooltip>
                                        )}
                                        <Button
                                          variant="text"
                                          size="small"
                                          onClick={() =>
                                            navigate(`/lists/${list.id}`)
                                          }
                                        >
                                          View
                                        </Button>
                                      </Stack>
                                    </Box>
                                  </Stack>
                                </Paper>
                              );
                            })}
                          </Stack>
                        )}
                      </Box>
                    </Paper>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      minWidth: 0,
                    }}
                  >
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                      Create a new list
                    </Typography>
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={2}
                        mb={2}
                      >
                        {createPicturePreview ? (
                          <Avatar
                            src={createPicturePreview}
                            variant="rounded"
                            sx={{ width: 96, height: 96, borderRadius: 2 }}
                          />
                        ) : (
                          <Avatar
                            variant="rounded"
                            sx={{
                              width: 96,
                              height: 96,
                              borderRadius: 2,
                              bgcolor: "grey.800",
                            }}
                          >
                            <ImageNotSupportedIcon />
                          </Avatar>
                        )}
                        <Stack direction={"column"} spacing={1.5}>
                          <Button
                            variant="outlined"
                            component="label"
                            startIcon={<PhotoCameraIcon />}
                            disabled={saving}
                          >
                            Choose Image
                            <input
                              type="file"
                              hidden
                              accept={ACCEPTED_IMAGE_TYPES}
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                handleCreatePictureChange(file);
                                event.target.value = "";
                              }}
                            />
                          </Button>
                          {createPicturePreview && (
                            <Button
                              variant="text"
                              onClick={() => handleClearCreatePicture()}
                              disabled={saving}
                            >
                              Remove Image
                            </Button>
                          )}
                          <Typography variant="body2" color="text.secondary">
                            JPG, PNG, WEBP, or AVIF (3 MB)
                          </Typography>
                        </Stack>
                      </Stack>
                      <Stack spacing={2}>
                        <TextField
                          label="List name"
                          value={createForm.name}
                          size="small"
                          onChange={(event) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                          required
                          sx={{ mb: 2 }}
                        />
                        <TextField
                          label="Description"
                          value={createForm.description}
                          size="small"
                          onChange={(event) =>
                            setCreateForm((prev) => ({
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
                              checked={createForm.isPrivate}
                              onChange={(event) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  isPrivate: event.target.checked,
                                }))
                              }
                            />
                          }
                          label="Private"
                          sx={{ mb: 1 }}
                        />

                        <Button
                          variant="contained"
                          onClick={() => void handleCreateList()}
                          disabled={saving || !createForm.name.trim()}
                        >
                          Create List
                        </Button>
                      </Stack>
                    </Paper>
                    <Typography variant="h6" fontWeight={700} mb={1}>
                      My lists
                    </Typography>
                    {loadingMine ? (
                      <Box display="flex" justifyContent="center" py={4}>
                        <CircularProgress />
                      </Box>
                    ) : sortedMyLists.length === 0 ? (
                      <Paper sx={{ p: 2 }}>
                        <Typography color="text.secondary">
                          You have not created any lists yet.
                        </Typography>
                      </Paper>
                    ) : (
                      <Stack spacing={2}>
                        {sortedMyLists.map((list) => {
                          return (
                            <Paper key={list.id} sx={{ p: 2 }}>
                              <Stack
                                direction={{ xs: "row", sm: "row" }}
                                spacing={2}
                              >
                                {renderListPicture(list.pictureUrl, list.name)}
                                <Box flex={1} minWidth={0}>
                                  <Stack direction={"column"}>
                                    <Typography variant="h6" fontWeight={700}>
                                      {list.name}
                                    </Typography>
                                    {list.description && (
                                      <Typography color="text.secondary">
                                        {list.description}
                                      </Typography>
                                    )}
                                    <Stack
                                      direction="row"
                                      spacing={0.01}
                                      mt={1}
                                      flexWrap="wrap"
                                      sx={{ gap: 1 }}
                                    >
                                      <Chip
                                        size="small"
                                        color={
                                          list.isPrivate ? "default" : "primary"
                                        }
                                        icon={
                                          list.isPrivate ? (
                                            <LockIcon fontSize="small" />
                                          ) : (
                                            <PublicIcon fontSize="small" />
                                          )
                                        }
                                        label={
                                          list.isPrivate ? "Private" : "Public"
                                        }
                                      />
                                      <Chip
                                        size="small"
                                        icon={<FavoriteIcon fontSize="small" />}
                                        label={
                                          list.likes === 1
                                            ? "1 like"
                                            : `${list.likes} likes`
                                        }
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
                                        sx={{ mt: 3 }}
                                      />
                                    </Stack>
                                  </Stack>
                                  <Stack
                                    direction={"row"}
                                    spacing={0.01}
                                    flexWrap="wrap"
                                    sx={{ mt: 2, gap: 1 }}
                                  >
                                    <Button
                                      variant="contained"
                                      size="small"
                                      startIcon={<VisibilityIcon />}
                                      onClick={() =>
                                        navigate(`/lists/${list.id}`)
                                      }
                                    >
                                      View
                                    </Button>
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      startIcon={<EditIcon />}
                                      onClick={() => handleOpenEdit(list)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="text"
                                      size="small"
                                      color="error"
                                      startIcon={<DeleteIcon />}
                                      onClick={() =>
                                        handleOpenDeleteConfirmation(list)
                                      }
                                      disabled={saving}
                                    >
                                      Delete
                                    </Button>
                                  </Stack>
                                </Box>
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </Box>
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
        <Dialog
          open={editState.open}
          onClose={handleCloseEdit}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Edit list</DialogTitle>
          <DialogContent dividers>
            <Stack direction={"row"} spacing={2} alignItems="center" mb={1}>
              {editPicturePreview ? (
                <Avatar
                  src={editPicturePreview}
                  variant="rounded"
                  alt={editState.name}
                  sx={{ width: 96, height: 96, borderRadius: 2 }}
                />
              ) : editState.pictureUrl && !removePictureFlag ? (
                <Avatar
                  src={
                    editState.pictureUrl.startsWith("http")
                      ? editState.pictureUrl
                      : apiUrl(editState.pictureUrl)
                  }
                  variant="rounded"
                  alt={editState.name}
                  sx={{ width: 96, height: 96, borderRadius: 2 }}
                />
              ) : (
                <Avatar
                  variant="rounded"
                  sx={{
                    width: 96,
                    height: 96,
                    borderRadius: 2,
                    bgcolor: "grey.800",
                  }}
                >
                  <ImageNotSupportedIcon />
                </Avatar>
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
          <DialogActions>
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
              Are you sure you want to delete the list "
              {deleteConfirmation.list?.name}"?
              {deleteConfirmation.list &&
                deleteConfirmation.list.recordCount > 0 && (
                  <>
                    {" "}
                    This list contains {
                      deleteConfirmation.list.recordCount
                    }{" "}
                    record{deleteConfirmation.list.recordCount !== 1 ? "s" : ""}
                    .
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
      </Box>
    </ThemeProvider>
  );
}
