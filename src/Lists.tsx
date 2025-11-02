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
  Divider,
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
import RefreshIcon from "@mui/icons-material/Refresh";
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
  }>({ id: null, name: "", description: "", isPrivate: false, open: false });

  const [likeBusyIds, setLikeBusyIds] = useState<Set<number>>(new Set());
  const [pictureBusyIds, setPictureBusyIds] = useState<Set<number>>(new Set());

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

  const loadMine = useCallback(async () => {
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
          }))
        : [];
      setMyLists(lists);
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error ? error.message : "Failed to load your lists",
        "error"
      );
    } finally {
      setLoadingMine(false);
    }
  }, [showMessage]);

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
      await loadMine();
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
    });
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditState({
      id: null,
      name: "",
      description: "",
      isPrivate: false,
      open: false,
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editState.id) return;
    const name = editState.name.trim();
    if (!name) {
      showMessage("List name is required", "error");
      return;
    }
    setSaving(true);
    try {
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
      const data = await response.json();
      const updated: ListSummary | null = data?.list
        ? {
            id: Number(data.list.id) || editState.id,
            name: typeof data.list.name === "string" ? data.list.name : name,
            description:
              typeof data.list.description === "string" &&
              data.list.description.trim()
                ? data.list.description.trim()
                : null,
            isPrivate:
              data.list.isPrivate === true || Number(data.list.isPrivate) === 1,
            likes:
              Number(data.list.likes) >= 0 ? Math.trunc(data.list.likes) : 0,
            pictureUrl:
              typeof data.list.pictureUrl === "string" &&
              data.list.pictureUrl.trim()
                ? data.list.pictureUrl
                : null,
            created:
              typeof data.list.created === "string" && data.list.created.trim()
                ? data.list.created.trim()
                : null,
            recordCount:
              Number(data.list.recordCount) >= 0
                ? Math.trunc(data.list.recordCount)
                : 0,
          }
        : null;
      if (updated) {
        setMyLists((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        setPopularLists((prev) =>
          prev.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item
          )
        );
      } else {
        await loadMine();
        await loadPopular();
      }
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
  }, [editState, handleCloseEdit, loadMine, loadPopular, showMessage]);

  const handleTogglePrivacy = useCallback(
    async (list: ListSummary) => {
      setSaving(true);
      try {
        const response = await fetch(apiUrl(`/api/lists/${list.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isPrivate: !list.isPrivate }),
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to update privacy");
        }
        setMyLists((prev) =>
          prev.map((item) =>
            item.id === list.id ? { ...item, isPrivate: !list.isPrivate } : item
          )
        );
        setPopularLists((prev) =>
          prev.map((item) =>
            item.id === list.id ? { ...item, isPrivate: !list.isPrivate } : item
          )
        );
        showMessage(
          !list.isPrivate ? "List set to private" : "List is now public",
          "success"
        );
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to update privacy",
          "error"
        );
      } finally {
        setSaving(false);
      }
    },
    [showMessage]
  );

  const handleDeleteList = useCallback(
    async (list: ListSummary) => {
      const confirmed = window.confirm(
        `Delete list "${list.name}"? This will remove all of its records.`
      );
      if (!confirmed) return;
      setSaving(true);
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
    },
    [showMessage]
  );

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

  const handlePictureChange = useCallback(
    async (list: ListSummary, file: File | null) => {
      if (!file) return;
      withBusySet(setPictureBusyIds, list.id, true);
      try {
        const formData = new FormData();
        formData.append("picture", file);
        const response = await fetch(apiUrl(`/api/lists/${list.id}/picture`), {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to upload image");
        }
        const data = await response.json();
        const updated = data?.list;
        const nextUrl =
          typeof updated?.pictureUrl === "string" && updated.pictureUrl.trim()
            ? updated.pictureUrl
            : null;
        setMyLists((prev) =>
          prev.map((item) =>
            item.id === list.id
              ? {
                  ...item,
                  pictureUrl: nextUrl,
                  name:
                    typeof updated?.name === "string" && updated.name.trim()
                      ? updated.name.trim()
                      : item.name,
                  description:
                    typeof updated?.description === "string" &&
                    updated.description.trim()
                      ? updated.description.trim()
                      : item.description,
                }
              : item
          )
        );
        setPopularLists((prev) =>
          prev.map((item) =>
            item.id === list.id
              ? {
                  ...item,
                  pictureUrl: nextUrl,
                  name:
                    typeof updated?.name === "string" && updated.name.trim()
                      ? updated.name.trim()
                      : item.name,
                  description:
                    typeof updated?.description === "string" &&
                    updated.description.trim()
                      ? updated.description.trim()
                      : item.description,
                }
              : item
          )
        );
        showMessage("List picture updated", "success");
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to upload image",
          "error"
        );
      } finally {
        withBusySet(setPictureBusyIds, list.id, false);
      }
    },
    [showMessage, withBusySet]
  );

  const handleRemovePicture = useCallback(
    async (list: ListSummary) => {
      withBusySet(setPictureBusyIds, list.id, true);
      try {
        const response = await fetch(apiUrl(`/api/lists/${list.id}/picture`), {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok) {
          const problem = await response.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to remove image");
        }
        setMyLists((prev) =>
          prev.map((item) =>
            item.id === list.id ? { ...item, pictureUrl: null } : item
          )
        );
        setPopularLists((prev) =>
          prev.map((item) =>
            item.id === list.id ? { ...item, pictureUrl: null } : item
          )
        );
        showMessage("List picture removed", "success");
      } catch (error) {
        console.error(error);
        showMessage(
          error instanceof Error ? error.message : "Failed to remove image",
          "error"
        );
      } finally {
        withBusySet(setPictureBusyIds, list.id, false);
      }
    },
    [showMessage, withBusySet]
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
        return (
          <Avatar
            src={pictureUrl}
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
          minHeight: "100vh",
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
          searchPlaceholder="Search records"
        />
        <Box
          component="main"
          sx={{
            flex: 1,
            overflowY: { xs: "auto", md: "auto" },
            mt: 1,
            px: 1,
          }}
        >
          <Box
            maxWidth={800}
            mx="auto"
            sx={{ height: { md: "100%" }, pb: { xs: 4, sm: 0 } }}
          >
            <Box
              sx={{
                display: "grid",
                gap: 3,
                alignItems: "stretch",
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "7fr 5fr",
                  lg: "8fr 4fr",
                },
              }}
            >
              <Box>
                <Paper sx={{ p: 3, mb: 3 }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                    <Typography variant="h6" fontWeight={700}>
                      Create a new list
                    </Typography>
                    <Tooltip title="Refresh">
                      <span>
                        <IconButton
                          onClick={() => {
                            void loadMine();
                            void loadPopular();
                          }}
                          size="small"
                          disabled={loadingMine || loadingPopular}
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
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
                    />
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={2}
                      alignItems="center"
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
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.5}
                      >
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
                      </Stack>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Optional image — JPG, PNG, WEBP, or AVIF
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={() => void handleCreateList()}
                      disabled={saving || !createForm.name.trim()}
                    >
                      Create List
                    </Button>
                  </Stack>
                </Paper>

                <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                  My lists
                </Typography>
                {loadingMine ? (
                  <Box display="flex" justifyContent="center" py={4}>
                    <CircularProgress />
                  </Box>
                ) : sortedMyLists.length === 0 ? (
                  <Paper sx={{ p: 3 }}>
                    <Typography color="text.secondary">
                      You have not created any lists yet.
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={2.5}>
                    {sortedMyLists.map((list) => {
                      const pictureBusy = pictureBusyIds.has(list.id);
                      return (
                        <Paper key={list.id} sx={{ p: 3 }}>
                          <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={2}
                          >
                            {renderListPicture(list.pictureUrl, list.name)}
                            <Box flex={1}>
                              <Stack
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ xs: "flex-start", sm: "center" }}
                              >
                                <Typography variant="h6" fontWeight={700}>
                                  {list.name}
                                </Typography>
                                <Chip
                                  size="small"
                                  color={list.isPrivate ? "default" : "primary"}
                                  icon={
                                    list.isPrivate ? (
                                      <LockIcon fontSize="small" />
                                    ) : (
                                      <PublicIcon fontSize="small" />
                                    )
                                  }
                                  label={list.isPrivate ? "Private" : "Public"}
                                />
                                <Chip
                                  size="small"
                                  icon={<FavoriteIcon fontSize="small" />}
                                  label={`${list.likes} likes`}
                                />
                                <Chip
                                  size="small"
                                  label={`${list.recordCount} records`}
                                />
                              </Stack>
                              {list.description && (
                                <Typography
                                  color="text.secondary"
                                  sx={{ mt: 1 }}
                                >
                                  {list.description}
                                </Typography>
                              )}
                              <Stack
                                direction={{ xs: "column", md: "row" }}
                                spacing={1}
                                sx={{ mt: 2 }}
                              >
                                <Button
                                  variant="contained"
                                  size="small"
                                  startIcon={<VisibilityIcon />}
                                  onClick={() => navigate(`/lists/${list.id}`)}
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
                                  variant="outlined"
                                  size="small"
                                  onClick={() => void handleTogglePrivacy(list)}
                                  disabled={saving}
                                >
                                  {list.isPrivate
                                    ? "Make Public"
                                    : "Make Private"}
                                </Button>
                                <Button
                                  variant="outlined"
                                  size="small"
                                  component="label"
                                  startIcon={<PhotoCameraIcon />}
                                  disabled={pictureBusy}
                                >
                                  Upload Image
                                  <input
                                    type="file"
                                    hidden
                                    accept={ACCEPTED_IMAGE_TYPES}
                                    onChange={(event) => {
                                      const file =
                                        event.target.files?.[0] ?? null;
                                      void handlePictureChange(list, file);
                                      event.target.value = "";
                                    }}
                                  />
                                </Button>
                                {list.pictureUrl && (
                                  <Button
                                    variant="text"
                                    size="small"
                                    onClick={() =>
                                      void handleRemovePicture(list)
                                    }
                                    disabled={pictureBusy}
                                  >
                                    Remove Image
                                  </Button>
                                )}
                                <Button
                                  variant="text"
                                  size="small"
                                  color="error"
                                  startIcon={<DeleteIcon />}
                                  onClick={() => void handleDeleteList(list)}
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

              <Box>
                <Paper sx={{ p: 3, height: "100%" }}>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    Popular lists
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
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
                        return (
                          <Paper key={list.id} variant="outlined" sx={{ p: 2 }}>
                            <Stack
                              direction="row"
                              spacing={2}
                              alignItems="center"
                            >
                              {renderListPicture(list.pictureUrl, list.name)}
                              <Box flex={1} minWidth={0}>
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
                                >
                                  <Chip
                                    size="small"
                                    label={`${list.recordCount} records`}
                                  />
                                  <Chip
                                    size="small"
                                    label={`${list.likes} likes`}
                                  />
                                </Stack>
                              </Box>
                              <Stack spacing={1} alignItems="center">
                                <Tooltip title={liked ? "Unlike" : "Like"}>
                                  <span>
                                    <IconButton
                                      color={liked ? "error" : "default"}
                                      onClick={() =>
                                        void handleToggleLike(list.id, liked)
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
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() => navigate(`/lists/${list.id}`)}
                                >
                                  View
                                </Button>
                              </Stack>
                            </Stack>
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}
                </Paper>
              </Box>
            </Box>
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
            <Stack spacing={2} sx={{ mt: 1 }}>
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
              />
              <TextField
                label="Description"
                value={editState.description}
                onChange={(event) =>
                  setEditState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                multiline
                minRows={2}
                maxRows={4}
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
      </Box>
    </ThemeProvider>
  );
}
