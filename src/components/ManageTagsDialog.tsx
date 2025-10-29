import { useState, useEffect } from "react";
import apiUrl from "../api";
import { updateTagsCache } from "../userTags";
import { removeTagFromCache } from "../collectionRecords";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Box,
  Alert,
  Snackbar,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";

interface ManageTagsDialogProps {
  open: boolean;
  onClose: () => void;
  tags: string[];
  onTagsUpdated: (tags: string[]) => void;
  onTagRenamed?: (oldName: string, newName: string) => void;
  onTagDeleted?: (deletedName: string) => void;
}

export default function ManageTagsDialog({
  open,
  onClose,
  tags,
  onTagsUpdated,
  onTagRenamed,
  onTagDeleted,
}: ManageTagsDialogProps) {
  const [newTag, setNewTag] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);
  // map of tag name -> id for id-based operations
  const [tagMap, setTagMap] = useState<Record<string, number> | null>(null);

  const openSnack = (
    message: string,
    severity: "success" | "error" = "success"
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  const resetTransient = () => {
    setNewTag("");
    setRenaming(null);
    setRenameValue("");
  };

  const handleCreate = async () => {
    if (!newTag.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/tags/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newTag }),
      });
      const data = await res.json();
      if (res.ok) {
        onTagsUpdated(data.tags);
        updateTagsCache(data.tags);
        setNewTag("");
        openSnack("Tag added");
      } else {
        openSnack(data.error || "Failed to add tag", "error");
      }
    } catch {
      openSnack("Network error while adding tag", "error");
    } finally {
      setLoading(false);
    }
  };

  const startRenaming = (tag: string) => {
    setRenaming(tag);
    setRenameValue(tag);
  };

  const handleRename = async () => {
    if (!renaming) return;
    if (!renameValue.trim()) return openSnack("New name required");
    if (renameValue.trim() === renaming) {
      setRenaming(null);
      return;
    }
    setLoading(true);
    try {
      // Prefer sending tagId when available to avoid ambiguity with case-insensitive DB collations
      const payload: any = { newName: renameValue };
      if (tagMap && Object.prototype.hasOwnProperty.call(tagMap, renaming)) {
        payload.tagId = tagMap[renaming];
      } else {
        payload.oldName = renaming;
      }

      const res = await fetch(apiUrl("/api/tags/rename"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        onTagsUpdated(data.tags);
        updateTagsCache(data.tags);
        setRenaming(null);
        if (onTagRenamed) {
          onTagRenamed(renaming, renameValue.trim());
        }
        openSnack("Tag renamed");
      } else {
        openSnack(data.error || "Failed to rename tag", "error");
      }
    } catch {
      openSnack("Network error while renaming tag", "error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch full tag list (id + name) when dialog opens so we can use tag ids for renames
  useEffect(() => {
    let mounted = true;
    if (!open) return;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/tags/full"), {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        const map: Record<string, number> = {};
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && typeof item.name === "string" && item.id) {
              map[item.name] = Number(item.id);
            }
          }
        }
        setTagMap(map);
      } catch (err) {
        // ignore errors - fallback to name-based rename
        setTagMap(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open]);

  const triggerDelete = (tag: string) => {
    setConfirmDeleteTag(tag);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteTag) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/tags/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: confirmDeleteTag }),
      });
      const data = await res.json();
      if (res.ok) {
        onTagsUpdated(data.tags);
        updateTagsCache(data.tags);
        if (renaming === confirmDeleteTag) setRenaming(null);
        if (onTagDeleted) {
          try {
            onTagDeleted(confirmDeleteTag!);
          } catch {
            /* ignore handler errors */
          }
        }
        try {
          // keep cached collection records in sync
          removeTagFromCache(confirmDeleteTag!);
        } catch {
          /* ignore errors */
        }
        openSnack("Tag deleted");
      } else {
        openSnack(data.error || "Failed to delete tag", "error");
      }
    } catch {
      openSnack("Network error while deleting tag", "error");
    } finally {
      setLoading(false);
      setConfirmDeleteTag(null);
    }
  };

  const handleClose = () => {
    resetTransient();
    onClose();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={() => !loading && handleClose()}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ bgcolor: "background.paper" }}>
          Manage Tags
        </DialogTitle>
        <DialogContent sx={{ bgcolor: "background.paper" }} dividers>
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <TextField
              label="New Tag"
              size="small"
              fullWidth
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              disabled={loading}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreate}
              disabled={!newTag.trim() || loading}
              sx={{ fontWeight: 700 }}
            >
              Add
            </Button>
          </Box>
          <List
            dense
            sx={{
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid #555",
              borderRadius: 1,
            }}
          >
            {tags.map((t) => (
              <ListItem
                key={t}
                secondaryAction={
                  renaming === t ? (
                    <Button
                      onClick={handleRename}
                      disabled={loading || !renameValue.trim()}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    >
                      Save
                    </Button>
                  ) : (
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => startRenaming(t)}
                        size="small"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => triggerDelete(t)}
                        size="small"
                        color="error"
                        sx={{ mr: 1 }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )
                }
                disableGutters
              >
                {renaming === t ? (
                  <TextField
                    size="small"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleRename();
                      }
                      if (e.key === "Escape") {
                        setRenaming(null);
                      }
                    }}
                    autoFocus
                    disabled={loading}
                  />
                ) : (
                  <ListItemButton
                    onClick={() => startRenaming(t)}
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={t}
                      primaryTypographyProps={{ variant: "body2" }}
                    />
                  </ListItemButton>
                )}
              </ListItem>
            ))}
            {tags.length === 0 && (
              <ListItem>
                <ListItemText primary="No tags yet" />
              </ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "background.paper" }}>
          <Button
            onClick={handleClose}
            disabled={loading}
            sx={{ fontWeight: 700 }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* Delete confirmation dialog */}
      <Dialog
        open={!!confirmDeleteTag}
        onClose={() => !loading && setConfirmDeleteTag(null)}
      >
        <DialogTitle>Delete Tag</DialogTitle>
        <DialogContent>
          Are you sure you want to delete tag "{confirmDeleteTag}"? This will
          remove it from all records.
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDeleteTag(null)}
            disabled={loading}
            sx={{ fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDelete}
            color="error"
            variant="contained"
            disabled={loading}
            sx={{ fontWeight: 700 }}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={(_, r) => {
          if (r !== "clickaway") setSnackbar((s) => ({ ...s, open: false }));
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snackbar.severity}
          variant="filled"
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ fontWeight: 500 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
