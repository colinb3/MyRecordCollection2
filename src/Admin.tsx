import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
  Alert,
  TableContainer,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Pagination,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SecurityIcon from "@mui/icons-material/Security";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import TopBar from "./components/TopBar";
import { darkTheme } from "./theme";
import apiUrl from "./api";
import { getCachedUserInfo, setCachedUserInfo, loadUserInfo } from "./userInfo";
import { setUserId } from "./analytics";
import type { AdminPermissions } from "./types";
import { performLogout } from "./logout";

const USERS_PAGE_SIZE = 25;
const RECORDS_PAGE_SIZE = 25;
const MASTERS_PAGE_SIZE = 25;
const TAGS_PAGE_SIZE = 25;
const LISTS_PAGE_SIZE = 25;

type AdminTabKey =
  | "users"
  | "records"
  | "masters"
  | "tags"
  | "lists"
  | "reports"
  | "fixcovers";

const TAB_OPTIONS: { label: string; value: AdminTabKey }[] = [
  { label: "Users", value: "users" },
  { label: "Records", value: "records" },
  { label: "Masters", value: "masters" },
  { label: "Tags", value: "tags" },
  { label: "Lists", value: "lists" },
  { label: "Reports", value: "reports" },
  { label: "Fix Covers", value: "fixcovers" },
];

type AdminUser = {
  userUuid: string;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  joinedDate: string | null;
  followersCount: number;
  followingCount: number;
  isAdmin: boolean;
  adminPermissions: AdminPermissions;
};

type AdminRecordOwner = {
  username: string;
  displayName: string | null;
};

type AdminRecord = {
  id: number;
  record: string;
  artist: string | null;
  cover: string | null;
  rating: number | null;
  review: string | null;
  added: string | null;
  isCustom: boolean;
  masterId: number | null;
  releaseYear: number | null;
  owner: AdminRecordOwner;
  tableName: string | null;
};

type AdminMaster = {
  id: number;
  name: string;
  artist: string | null;
  cover: string | null;
  releaseYear: number | null;
  ratingAverage: number | null;
  genreCount: number;
  genres?: string[];
  styles?: string[];
};

type AdminTagOwner = {
  username: string;
  displayName: string | null;
};

type AdminTag = {
  id: number;
  name: string;
  owner: AdminTagOwner | null;
  usageCount: number;
};

type AdminListOwner = {
  username: string;
  displayName: string | null;
  profilePicUrl: string | null;
};

type AdminList = {
  id: number;
  name: string;
  description: string | null;
  isPrivate: boolean;
  likes: number;
  pictureUrl: string | null;
  recordCount: number;
  created: string | null;
  owner: AdminListOwner;
};

type AdminListRecord = {
  id: number;
  name: string;
  artist: string | null;
  cover: string | null;
  rating: number | null;
  releaseYear: number | null;
  added: string | null;
  isCustom: boolean;
  masterId: number | null;
  sortOrder: number | null;
};

type AdminReport = {
  id: number;
  type: "general" | "user" | "record" | "master" | "list";
  reportedByUsername: string | null;
  reason: string;
  userNotes: string | null;
  created: string | null;
  status: string;
  adminNotes: string | null;
  targetId: number | null;
  targetName: string | null;
  targetUsername: string | null;
};

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  return value.replace(" ", "T");
}

function fromDateTimeLocal(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("T");
  if (parts.length !== 2) {
    return null;
  }
  const [datePart, timePartRaw] = parts;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return null;
  }
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timePartRaw);
  if (!timeMatch) {
    return null;
  }
  const [, hh, mm, ss] = timeMatch;
  const seconds = ss ?? "00";
  return `${datePart} ${hh}:${mm}:${seconds}`;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && payload !== null) {
    const maybeError = (payload as { error?: unknown }).error;
    if (typeof maybeError === "string") {
      return maybeError;
    }
  }
  return fallback;
}

function FixCoversTab() {
  const [oldCoverUrl, setOldCoverUrl] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    masterCount?: number;
    recordCount?: number;
    listRecordCount?: number;
  } | null>(null);

  const handleReplaceCover = async () => {
    const trimmedOld = oldCoverUrl.trim();
    const trimmedNew = newCoverUrl.trim();

    if (!trimmedOld || !trimmedNew) {
      setResult({
        success: false,
        message: "Both old and new cover URLs are required",
      });
      return;
    }

    if (trimmedOld === trimmedNew) {
      setResult({
        success: false,
        message: "Old and new cover URLs cannot be the same",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(apiUrl("/api/admin/covers/replace"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldCoverUrl: trimmedOld,
          newCoverUrl: trimmedNew,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          message: data.error || "Failed to replace cover URLs",
        });
        return;
      }

      setResult({
        success: true,
        message: "Cover URLs replaced successfully",
        masterCount: data.masterCount || 0,
        recordCount: data.recordCount || 0,
        listRecordCount: data.listRecordCount || 0,
      });

      // Clear inputs on success
      setOldCoverUrl("");
      setNewCoverUrl("");
    } catch (error) {
      console.error("Failed to replace cover URLs:", error);
      setResult({
        success: false,
        message: "Network error: Failed to replace cover URLs",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Fix Cover URLs
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Replace cover URLs across all Master, Record, and ListRecord tables.
        This will update all instances of the old cover URL with the new one.
      </Typography>

      <Stack spacing={3} sx={{ maxWidth: 800 }}>
        <TextField
          label="Old Cover URL"
          fullWidth
          value={oldCoverUrl}
          onChange={(e) => setOldCoverUrl(e.target.value)}
          placeholder="Enter the cover URL to replace"
          disabled={loading}
          helperText="The exact cover URL currently in the database"
          size="small"
        />

        <TextField
          label="New Cover URL"
          fullWidth
          value={newCoverUrl}
          onChange={(e) => setNewCoverUrl(e.target.value)}
          placeholder="Enter the new cover URL"
          disabled={loading}
          helperText="The new cover URL to use as replacement"
          size="small"
        />

        <Box>
          <Button
            variant="contained"
            onClick={handleReplaceCover}
            disabled={loading || !oldCoverUrl.trim() || !newCoverUrl.trim()}
            sx={{ fontWeight: 600 }}
          >
            {loading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Replacing...
              </>
            ) : (
              "Replace Cover URLs"
            )}
          </Button>
        </Box>

        {result && (
          <Alert severity={result.success ? "success" : "error"}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {result.message}
            </Typography>
            {result.success && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                <li>Masters updated: {result.masterCount}</li>
                <li>Records updated: {result.recordCount}</li>
                <li>List records updated: {result.listRecordCount}</li>
                <li>
                  Total:{" "}
                  {(result.masterCount || 0) +
                    (result.recordCount || 0) +
                    (result.listRecordCount || 0)}
                </li>
              </Box>
            )}
          </Alert>
        )}
      </Stack>
    </Box>
  );
}

interface UsersTabProps {
  permissions: AdminPermissions;
  currentUserUuid: string | null;
}

function UsersTab({ permissions, currentUserUuid }: UsersTabProps) {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ search: "" });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);
  const [accessDialogUser, setAccessDialogUser] = useState<AdminUser | null>(
    null
  );
  const [editUserDialog, setEditUserDialog] = useState<AdminUser | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState<string | null>(null);
  const [bioInput, setBioInput] = useState<string | null>(null);
  const [joinedDateInput, setJoinedDateInput] = useState<string | null>(null);
  const [removeProfilePicInput, setRemoveProfilePicInput] = useState(false);
  const [savingUserEdit, setSavingUserEdit] = useState(false);
  const [userEditError, setUserEditError] = useState<string | null>(null);
  const [isAdminInput, setIsAdminInput] = useState(false);
  const [canManageAdminsInput, setCanManageAdminsInput] = useState(false);
  const [canDeleteUsersInput, setCanDeleteUsersInput] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (startOffset: number, append: boolean) => {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(USERS_PAGE_SIZE));
        params.set("offset", String(startOffset));
        if (filters.search) {
          params.set("q", filters.search);
        }

        const response = await fetch(
          apiUrl(`/api/admin/users?${params.toString()}`),
          {
            credentials: "include",
          }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = getErrorMessage(
            payload,
            `Failed to load users (${response.status})`
          );
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          users?: AdminUser[];
          total?: number;
        };
        const items = Array.isArray(body.users) ? body.users : [];
        setUsers((prev) => (append ? [...prev, ...items] : items));
        const nextOffset = startOffset + items.length;
        setOffset(nextOffset);
        setTotal(typeof body.total === "number" ? body.total : nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
        if (!append) {
          setUsers([]);
          setOffset(0);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchUsers(0, false);
  }, [fetchUsers]);

  const hasMore = offset < total;

  const applyFilters = useCallback(() => {
    setFilters({ search: searchInput.trim() });
  }, [searchInput]);

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  const handleRefresh = () => {
    fetchUsers(0, false);
  };

  const openAccessDialog = (user: AdminUser) => {
    setAccessDialogUser(user);
    setIsAdminInput(user.isAdmin);
    setCanManageAdminsInput(user.adminPermissions.canManageAdmins);
    setCanDeleteUsersInput(user.adminPermissions.canDeleteUsers);
    setDialogError(null);
  };

  const closeAccessDialog = () => {
    if (savingAccess) return;
    setAccessDialogUser(null);
    setDialogError(null);
  };

  const handleSaveAccess = async () => {
    if (!accessDialogUser) return;
    if (!permissions.canManageAdmins) {
      setDialogError("You do not have permission to manage admin roles.");
      return;
    }
    setSavingAccess(true);
    setDialogError(null);
    try {
      const payload: Record<string, unknown> = {
        isAdmin: isAdminInput,
        adminPermissions: {
          canManageAdmins: isAdminInput && canManageAdminsInput,
          canDeleteUsers: isAdminInput && canDeleteUsersInput,
        },
      };

      const response = await fetch(
        apiUrl(
          `/api/admin/users/${encodeURIComponent(accessDialogUser.userUuid)}`
        ),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          data,
          `Failed to update user (${response.status})`
        );
        throw new Error(message);
      }

      const updatedUser =
        data && typeof data === "object" && data !== null
          ? (data as { user?: AdminUser }).user
          : undefined;

      if (updatedUser) {
        setUsers((prev) =>
          prev.map((entry) =>
            entry.userUuid === updatedUser.userUuid ? updatedUser : entry
          )
        );
      } else {
        await fetchUsers(0, false);
      }
      setAccessDialogUser(null);
    } catch (err) {
      setDialogError(
        err instanceof Error ? err.message : "Failed to update user"
      );
    } finally {
      setSavingAccess(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!permissions.canDeleteUsers) {
      setError("You do not have permission to delete users.");
      return;
    }
    if (currentUserUuid && currentUserUuid === user.userUuid) {
      setError("You cannot delete your own account.");
      return;
    }
    const confirmed = window.confirm(
      `Delete user "${user.username}"? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }
    setMutatingUserId(user.userUuid);
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/admin/users/${encodeURIComponent(user.userUuid)}`),
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete user (${response.status})`
        );
        throw new Error(message);
      }

      await fetchUsers(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setMutatingUserId(null);
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Search users"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={handleSearchKey}
          size="small"
          sx={{ width: { xs: "100%", sm: 320 } }}
        />
        <Button variant="outlined" onClick={handleRefresh} disabled={loading}>
          Refresh
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ alignSelf: "center", opacity: 0.8 }}>
          {users.length} / {total} shown
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>Username</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Display Name</TableCell>
              <TableCell>Joined</TableCell>
              <TableCell>Followers</TableCell>
              <TableCell>Following</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Permissions</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow hover key={user.userUuid}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email ?? "—"}</TableCell>
                <TableCell>{user.displayName ?? "—"}</TableCell>
                <TableCell>{user.joinedDate ?? "—"}</TableCell>
                <TableCell>{user.followersCount}</TableCell>
                <TableCell>{user.followingCount}</TableCell>
                <TableCell>
                  {user.isAdmin ? (
                    <Chip label="Admin" color="primary" size="small" />
                  ) : (
                    "User"
                  )}
                </TableCell>
                <TableCell>
                  {user.isAdmin ? (
                    <Stack direction="row" spacing={1}>
                      {user.adminPermissions.canManageAdmins && (
                        <Chip
                          label="Manage admins"
                          size="small"
                          color="success"
                        />
                      )}
                      {user.adminPermissions.canDeleteUsers && (
                        <Chip
                          label="Delete users"
                          size="small"
                          color="success"
                        />
                      )}
                      {!user.adminPermissions.canManageAdmins &&
                        !user.adminPermissions.canDeleteUsers && (
                          <Chip label="Limited" size="small" />
                        )}
                    </Stack>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="Edit access">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => openAccessDialog(user)}
                          disabled={!permissions.canManageAdmins}
                        >
                          <SecurityIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="View profile">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            navigate(
                              `/community/${encodeURIComponent(user.username)}`
                            )
                          }
                        >
                          View
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Edit user info">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditUserDialog(user);
                            setDisplayNameInput(user.displayName ?? null);
                            setBioInput(user.bio ?? null);
                            setJoinedDateInput(user.joinedDate ?? null);
                            setRemoveProfilePicInput(false);
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Delete user">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteUser(user)}
                          disabled={
                            !permissions.canDeleteUsers ||
                            user.userUuid === currentUserUuid ||
                            mutatingUserId === user.userUuid
                          }
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && users.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => fetchUsers(offset, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )
      )}

      <Dialog open={Boolean(accessDialogUser)} onClose={closeAccessDialog}>
        <DialogTitle>Edit admin access</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          <FormControlLabel
            control={
              <Switch
                checked={isAdminInput}
                onChange={(event) => setIsAdminInput(event.target.checked)}
                disabled={!permissions.canManageAdmins}
              />
            }
            label="Administrator"
          />
          <FormControlLabel
            control={
              <Switch
                checked={canManageAdminsInput && isAdminInput}
                onChange={(event) =>
                  setCanManageAdminsInput(event.target.checked)
                }
                disabled={!permissions.canManageAdmins || !isAdminInput}
              />
            }
            label="Can manage admins"
          />
          <FormControlLabel
            control={
              <Switch
                checked={canDeleteUsersInput && isAdminInput}
                onChange={(event) =>
                  setCanDeleteUsersInput(event.target.checked)
                }
                disabled={!permissions.canManageAdmins || !isAdminInput}
              />
            }
            label="Can delete users"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={closeAccessDialog}
            disabled={savingAccess}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveAccess}
            disabled={savingAccess}
            variant="contained"
          >
            {savingAccess ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(editUserDialog)}
        onClose={() => (savingUserEdit ? undefined : setEditUserDialog(null))}
      >
        <DialogTitle>Edit user</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            mt: 1,
            minWidth: 360,
          }}
        >
          {userEditError && <Alert severity="error">{userEditError}</Alert>}
          <TextField
            label="Display name"
            value={displayNameInput ?? ""}
            onChange={(e) => setDisplayNameInput(e.target.value || null)}
            size="small"
          />
          <TextField
            label="Bio"
            value={bioInput ?? ""}
            onChange={(e) => setBioInput(e.target.value || null)}
            multiline
            minRows={2}
            maxRows={4}
            size="small"
            sx={{
              "& .MuiInputBase-root": {
                height: "auto",
              },
            }}
          />
          <TextField
            label="Joined date"
            type="date"
            value={joinedDateInput ?? ""}
            onChange={(e) => setJoinedDateInput(e.target.value || null)}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={removeProfilePicInput}
                onChange={(e) => setRemoveProfilePicInput(e.target.checked)}
              />
            }
            label="Remove profile picture"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditUserDialog(null)}
            disabled={savingUserEdit}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!editUserDialog) return;
              setSavingUserEdit(true);
              setUserEditError(null);
              try {
                const payload: Record<string, unknown> = {};
                // allow nulls
                payload.displayName =
                  displayNameInput === null
                    ? null
                    : String(displayNameInput).trim() || null;
                payload.bio =
                  bioInput === null ? null : String(bioInput).trim() || null;
                payload.joinedDate =
                  joinedDateInput === null ? null : String(joinedDateInput);
                if (removeProfilePicInput) payload.removeProfilePic = true;

                const res = await fetch(
                  apiUrl(
                    `/api/admin/users/${encodeURIComponent(
                      editUserDialog.userUuid
                    )}`
                  ),
                  {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  }
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  throw new Error(
                    data?.error || `Failed to save user (${res.status})`
                  );
                }
                const updated = data && data.user ? data.user : null;
                if (updated) {
                  setUsers((prev) =>
                    prev.map((u) =>
                      u.userUuid === updated.userUuid ? updated : u
                    )
                  );
                } else {
                  await fetchUsers(0, false);
                }
                setEditUserDialog(null);
              } catch (err) {
                setUserEditError(
                  err instanceof Error ? err.message : "Failed to save user"
                );
              } finally {
                setSavingUserEdit(false);
              }
            }}
            variant="contained"
            disabled={savingUserEdit}
          >
            {savingUserEdit ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function RecordsTab() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [masterIdInput, setMasterIdInput] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    owner: "",
    masterId: "",
  });
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [recordNameInput, setRecordNameInput] = useState("");
  const [artistEditInput, setArtistEditInput] = useState("");
  const [coverInput, setCoverInput] = useState("");
  const [ratingEditInput, setRatingEditInput] = useState("");
  const [reviewInput, setReviewInput] = useState("");
  const [masterIdEditInput, setMasterIdEditInput] = useState("");
  const [releaseYearInput, setReleaseYearInput] = useState("");
  const [addedInput, setAddedInput] = useState("");
  const [isCustomInput, setIsCustomInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRecords = useCallback(
    async (startOffset: number, append: boolean) => {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(RECORDS_PAGE_SIZE));
        params.set("offset", String(startOffset));
        if (filters.search) {
          params.set("q", filters.search);
        }
        if (filters.owner) {
          params.set("user", filters.owner);
        }
        if (filters.masterId) {
          params.set("masterId", filters.masterId);
        }

        const response = await fetch(
          apiUrl(`/api/admin/records?${params.toString()}`),
          { credentials: "include" }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message =
            (payload &&
            typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : null) || `Failed to load records (${response.status})`;
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          records?: AdminRecord[];
          total?: number;
        };
        const items = Array.isArray(body.records) ? body.records : [];
        setRecords((prev) => (append ? [...prev, ...items] : items));
        const nextOffset = startOffset + items.length;
        setOffset(nextOffset);
        setTotal(typeof body.total === "number" ? body.total : nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load records");
        if (!append) {
          setRecords([]);
          setOffset(0);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchRecords(0, false);
  }, [fetchRecords]);

  const hasMore = offset < total;

  const applyFilters = () => {
    setFilters({
      search: searchInput.trim(),
      owner: ownerInput.trim(),
      masterId: masterIdInput.trim(),
    });
  };

  const handleFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  useEffect(() => {
    if (!editing) {
      setRecordNameInput("");
      setArtistEditInput("");
      setCoverInput("");
      setRatingEditInput("");
      setReviewInput("");
      setMasterIdEditInput("");
      setReleaseYearInput("");
      setAddedInput("");
      setIsCustomInput(false);
      return;
    }
    setRecordNameInput(editing.record);
    setArtistEditInput(editing.artist ?? "");
    setCoverInput(editing.cover ?? "");
    setRatingEditInput(
      editing.rating !== null && editing.rating !== undefined
        ? String(editing.rating)
        : ""
    );
    setReviewInput(editing.review ?? "");
    setMasterIdEditInput(
      editing.masterId !== null && editing.masterId !== undefined
        ? String(editing.masterId)
        : ""
    );
    setReleaseYearInput(
      editing.releaseYear !== null && editing.releaseYear !== undefined
        ? String(editing.releaseYear)
        : ""
    );
    setAddedInput(toDateTimeLocal(editing.added));
    setIsCustomInput(Boolean(editing.isCustom));
  }, [editing]);

  const handleSave = async () => {
    if (!editing) return;
    if (!recordNameInput.trim()) {
      setError("Record name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      record: recordNameInput.trim(),
      artist: artistEditInput.trim() ? artistEditInput.trim() : null,
      cover: coverInput.trim() ? coverInput.trim() : null,
      isCustom: isCustomInput,
    };

    if (ratingEditInput.trim() === "") {
      body.rating = null;
    } else {
      const ratingValue = Number(ratingEditInput);
      if (!Number.isFinite(ratingValue)) {
        setError("Rating must be a number between 0 and 10.");
        setSaving(false);
        return;
      }
      body.rating = ratingValue;
    }

    const reviewTrimmed = reviewInput.trim();
    body.review = reviewTrimmed.length > 0 ? reviewTrimmed : null;

    if (masterIdEditInput.trim() === "") {
      body.masterId = null;
    } else {
      const masterValue = Number(masterIdEditInput);
      if (!Number.isInteger(masterValue) || masterValue <= 0) {
        setError("Master ID must be a positive integer.");
        setSaving(false);
        return;
      }
      body.masterId = masterValue;
    }

    if (releaseYearInput.trim() === "") {
      body.releaseYear = null;
    } else {
      const releaseValue = Number(releaseYearInput);
      if (
        !Number.isInteger(releaseValue) ||
        releaseValue < 1901 ||
        releaseValue > 2100
      ) {
        setError("Release year must be between 1901 and 2100.");
        setSaving(false);
        return;
      }
      body.releaseYear = releaseValue;
    }

    if (addedInput.trim()) {
      const formatted = fromDateTimeLocal(addedInput);
      if (!formatted) {
        setError(
          "Added timestamp must be valid and formatted as YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS."
        );
        setSaving(false);
        return;
      }
      body.added = formatted;
    }

    try {
      const response = await fetch(apiUrl(`/api/admin/records/${editing.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to update record (${response.status})`
        );
        throw new Error(message);
      }

      const updatedRecord =
        payload && typeof payload === "object" && payload !== null
          ? (payload as { record?: AdminRecord }).record
          : undefined;

      if (updatedRecord) {
        setRecords((prev) =>
          prev.map((entry) =>
            entry.id === updatedRecord.id ? updatedRecord : entry
          )
        );
      } else {
        await fetchRecords(0, false);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update record");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: AdminRecord) => {
    const confirmed = window.confirm(
      `Delete record "${record.record}" from ${record.owner.username}?`
    );
    if (!confirmed) return;
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/records/${record.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete record (${response.status})`
        );
        throw new Error(message);
      }

      await fetchRecords(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Search records"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 280 } }}
        />
        <TextField
          label="Owner username"
          value={ownerInput}
          onChange={(event) => setOwnerInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 220 } }}
        />
        <TextField
          label="Master ID"
          value={masterIdInput}
          onChange={(event) => setMasterIdInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 160 } }}
        />
        <Button
          variant="outlined"
          onClick={() => fetchRecords(0, false)}
          disabled={loading}
        >
          Refresh
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ alignSelf: "center", opacity: 0.8 }}>
          {records.length} / {total} shown
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Record</TableCell>
              <TableCell>Artist</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Collection</TableCell>
              <TableCell>Rating</TableCell>
              <TableCell>Master</TableCell>
              <TableCell>Release Year</TableCell>
              <TableCell>Added</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((record) => (
              <TableRow hover key={record.id}>
                <TableCell>{record.id}</TableCell>
                <TableCell>{record.record}</TableCell>
                <TableCell>{record.artist ?? "—"}</TableCell>
                <TableCell>
                  {record.owner.displayName
                    ? `${record.owner.displayName} (@${record.owner.username})`
                    : `@${record.owner.username}`}
                </TableCell>
                <TableCell>{record.tableName ?? "—"}</TableCell>
                <TableCell>
                  {record.rating !== null && record.rating !== undefined
                    ? record.rating
                    : "—"}
                </TableCell>
                <TableCell>{record.masterId ?? "—"}</TableCell>
                <TableCell>
                  {record.releaseYear !== null &&
                  record.releaseYear !== undefined
                    ? record.releaseYear
                    : "—"}
                </TableCell>
                <TableCell>{record.added ?? "—"}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="View record">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            navigate(
                              `/community/${record.owner.username}/record/${record.id}`
                            )
                          }
                        >
                          View
                        </Button>
                      </span>
                    </Tooltip>
                    <IconButton size="small" onClick={() => setEditing(record)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(record)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && records.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && records.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => fetchRecords(offset, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => (saving ? undefined : setEditing(null))}
      >
        <DialogTitle>Edit record</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            mt: 1,
            minWidth: 360,
          }}
        >
          <TextField
            label="Record name"
            value={recordNameInput}
            onChange={(event) => setRecordNameInput(event.target.value)}
            required
            size="small"
          />
          <TextField
            label="Artist"
            value={artistEditInput}
            onChange={(event) => setArtistEditInput(event.target.value)}
            size="small"
          />
          <TextField
            label="Cover URL"
            value={coverInput}
            onChange={(event) => setCoverInput(event.target.value)}
            size="small"
          />
          <TextField
            label="Rating"
            value={ratingEditInput}
            onChange={(event) => setRatingEditInput(event.target.value)}
            helperText="Leave blank to clear"
            size="small"
          />
          <TextField
            label="Review"
            multiline
            minRows={2}
            maxRows={4}
            value={reviewInput}
            onChange={(event) => setReviewInput(event.target.value)}
            size="small"
            sx={{
              "& .MuiInputBase-root": {
                height: "auto",
              },
            }}
          />
          <TextField
            label="Master ID"
            value={masterIdEditInput}
            onChange={(event) => setMasterIdEditInput(event.target.value)}
            helperText="Leave blank to clear"
            size="small"
          />
          <TextField
            label="Release year"
            value={releaseYearInput}
            onChange={(event) => setReleaseYearInput(event.target.value)}
            helperText="Leave blank to clear"
            size="small"
          />
          <TextField
            label="Added"
            type="datetime-local"
            value={addedInput}
            onChange={(event) => setAddedInput(event.target.value)}
            helperText="Optional"
            InputLabelProps={{ shrink: true }}
            size="small"
          />
          <FormControlLabel
            control={
              <Switch
                checked={isCustomInput}
                onChange={(event) => setIsCustomInput(event.target.checked)}
              />
            }
            label="Custom entry"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditing(null)}
            disabled={saving}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function MastersTab() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({ search: "" });
  const [masters, setMasters] = useState<AdminMaster[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMaster | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [artistInput, setArtistInput] = useState("");
  const [coverInput, setCoverInput] = useState("");
  const [releaseYearInput, setReleaseYearInput] = useState("");
  const [genresInput, setGenresInput] = useState<string[]>([]);
  const [stylesInput, setStylesInput] = useState<string[]>([]);
  const [genreInputText, setGenreInputText] = useState("");
  const [styleInputText, setStyleInputText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingGenres, setLoadingGenres] = useState(false);

  const fetchMasters = useCallback(
    async (startOffset: number, append: boolean) => {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(MASTERS_PAGE_SIZE));
        params.set("offset", String(startOffset));
        if (filters.search) {
          params.set("q", filters.search);
        }

        const response = await fetch(
          apiUrl(`/api/admin/masters?${params.toString()}`),
          { credentials: "include" }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message =
            (payload &&
            typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : null) || `Failed to load masters (${response.status})`;
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          masters?: AdminMaster[];
          total?: number;
        };
        const items = Array.isArray(body.masters) ? body.masters : [];
        setMasters((prev) => (append ? [...prev, ...items] : items));
        const nextOffset = startOffset + items.length;
        setOffset(nextOffset);
        setTotal(typeof body.total === "number" ? body.total : nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load masters");
        if (!append) {
          setMasters([]);
          setOffset(0);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchMasters(0, false);
  }, [fetchMasters]);

  const hasMore = offset < total;

  const applyFilters = () => {
    setFilters({ search: searchInput.trim() });
  };

  const handleSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  useEffect(() => {
    if (!editing) {
      setNameInput("");
      setArtistInput("");
      setCoverInput("");
      setReleaseYearInput("");
      setGenresInput([]);
      setStylesInput([]);
      setGenreInputText("");
      setStyleInputText("");
      return;
    }
    setNameInput(editing.name);
    setArtistInput(editing.artist ?? "");
    setCoverInput(editing.cover ?? "");
    setReleaseYearInput(
      editing.releaseYear !== null && editing.releaseYear !== undefined
        ? String(editing.releaseYear)
        : ""
    );

    // Load genres and styles
    const loadGenres = async () => {
      setLoadingGenres(true);
      try {
        const response = await fetch(
          apiUrl(`/api/admin/masters/${editing.id}/genres`),
          { credentials: "include" }
        );
        if (response.ok) {
          const data = await response.json();
          const genres = Array.isArray(data.genres) ? data.genres : [];
          const styles = Array.isArray(data.styles) ? data.styles : [];
          setGenresInput(genres);
          setStylesInput(styles);
        }
      } catch (err) {
        console.error("Failed to load genres", err);
      } finally {
        setLoadingGenres(false);
      }
    };
    loadGenres();
  }, [editing]);

  const handleSave = async () => {
    if (!editing) return;
    if (!nameInput.trim()) {
      setError("Master name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {
      name: nameInput.trim(),
      artist: artistInput.trim() ? artistInput.trim() : null,
      cover: coverInput.trim() ? coverInput.trim() : null,
    };

    if (releaseYearInput.trim() === "") {
      body.releaseYear = null;
    } else {
      const releaseValue = Number(releaseYearInput);
      if (
        !Number.isInteger(releaseValue) ||
        releaseValue < 1901 ||
        releaseValue > 2100
      ) {
        setError("Release year must be between 1901 and 2100.");
        setSaving(false);
        return;
      }
      body.releaseYear = releaseValue;
    }

    // Use genres and styles arrays directly
    body.genres = genresInput;
    body.styles = stylesInput;

    try {
      const response = await fetch(apiUrl(`/api/admin/masters/${editing.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to update master (${response.status})`
        );
        throw new Error(message);
      }

      const updatedMaster =
        payload && typeof payload === "object" && payload !== null
          ? (payload as { master?: AdminMaster }).master
          : undefined;

      if (updatedMaster) {
        setMasters((prev) =>
          prev.map((entry) =>
            entry.id === updatedMaster.id ? updatedMaster : entry
          )
        );
      } else {
        await fetchMasters(0, false);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update master");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (master: AdminMaster) => {
    const confirmed = window.confirm(
      `Delete master "${master.name}" (ID ${master.id})?`
    );
    if (!confirmed) return;
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/masters/${master.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete master (${response.status})`
        );
        throw new Error(message);
      }

      await fetchMasters(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete master");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          label="Search masters"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={handleSearchKey}
          size="small"
          sx={{ width: { xs: "100%", sm: 320 } }}
        />
        <Button
          variant="outlined"
          onClick={() => fetchMasters(0, false)}
          disabled={loading}
        >
          Refresh
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ alignSelf: "center", opacity: 0.8 }}>
          {masters.length} / {total} shown
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Artist</TableCell>
              <TableCell>Release Year</TableCell>
              <TableCell>Average Rating</TableCell>
              <TableCell>Genres</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {masters.map((master) => (
              <TableRow hover key={master.id}>
                <TableCell>{master.id}</TableCell>
                <TableCell>{master.name}</TableCell>
                <TableCell>{master.artist ?? "—"}</TableCell>
                <TableCell>
                  {master.releaseYear !== null &&
                  master.releaseYear !== undefined
                    ? master.releaseYear
                    : "—"}
                </TableCell>
                <TableCell>
                  {master.ratingAverage !== null &&
                  master.ratingAverage !== undefined
                    ? master.ratingAverage.toFixed(1)
                    : "—"}
                </TableCell>
                <TableCell>
                  {master.genreCount > 0 ? master.genreCount : "—"}
                </TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title="View master">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => navigate(`/master/${master.id}`)}
                        >
                          View
                        </Button>
                      </span>
                    </Tooltip>
                    <IconButton size="small" onClick={() => setEditing(master)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(master)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && masters.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No masters found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && masters.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => fetchMasters(offset, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => (saving ? undefined : setEditing(null))}
      >
        <DialogTitle>Edit master</DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            mt: 1,
            minWidth: 320,
          }}
        >
          <TextField
            label="Name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            required
            size="small"
          />
          <TextField
            label="Artist"
            value={artistInput}
            onChange={(event) => setArtistInput(event.target.value)}
            size="small"
          />
          <TextField
            label="Cover URL"
            value={coverInput}
            onChange={(event) => setCoverInput(event.target.value)}
            size="small"
          />
          <TextField
            label="Release year"
            value={releaseYearInput}
            onChange={(event) => setReleaseYearInput(event.target.value)}
            helperText="Leave blank to clear"
            size="small"
          />
          <Box>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              Genres
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {genresInput.map((genre, index) => (
                <Chip
                  key={index}
                  label={genre}
                  onDelete={() => {
                    setGenresInput(genresInput.filter((_, i) => i !== index));
                  }}
                  size="small"
                  disabled={loadingGenres}
                />
              ))}
            </Box>
            <TextField
              placeholder="Add genre and press Enter"
              value={genreInputText}
              onChange={(event) => setGenreInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && genreInputText.trim()) {
                  event.preventDefault();
                  const trimmed = genreInputText.trim();
                  if (!genresInput.includes(trimmed)) {
                    setGenresInput([...genresInput, trimmed]);
                  }
                  setGenreInputText("");
                }
              }}
              size="small"
              fullWidth
              disabled={loadingGenres}
            />
          </Box>
          <Box>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              Styles
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
              {stylesInput.map((style, index) => (
                <Chip
                  key={index}
                  label={style}
                  onDelete={() => {
                    setStylesInput(stylesInput.filter((_, i) => i !== index));
                  }}
                  size="small"
                  disabled={loadingGenres}
                />
              ))}
            </Box>
            <TextField
              placeholder="Add style and press Enter"
              value={styleInputText}
              onChange={(event) => setStyleInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && styleInputText.trim()) {
                  event.preventDefault();
                  const trimmed = styleInputText.trim();
                  if (!stylesInput.includes(trimmed)) {
                    setStylesInput([...stylesInput, trimmed]);
                  }
                  setStyleInputText("");
                }
              }}
              size="small"
              fullWidth
              disabled={loadingGenres}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditing(null)}
            disabled={saving}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ListsTab() {
  const [searchInput, setSearchInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [filters, setFilters] = useState({ search: "", owner: "" });
  const [lists, setLists] = useState<AdminList[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminList | null>(null);
  const [editNameInput, setEditNameInput] = useState("");
  const [editDescriptionInput, setEditDescriptionInput] = useState("");
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingRecords, setViewingRecords] = useState<AdminList | null>(null);
  const [records, setRecords] = useState<AdminListRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);

  const fetchLists = useCallback(
    async (startOffset: number, append: boolean) => {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(LISTS_PAGE_SIZE));
        params.set("offset", String(startOffset));
        if (filters.search) {
          params.set("q", filters.search);
        }
        if (filters.owner) {
          params.set("user", filters.owner);
        }

        const response = await fetch(
          apiUrl(`/api/admin/lists?${params.toString()}`),
          { credentials: "include" }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = getErrorMessage(
            payload,
            `Failed to load lists (${response.status})`
          );
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          lists?: AdminList[];
        };
        const items = Array.isArray(body.lists) ? body.lists : [];
        setLists((prev) => (append ? [...prev, ...items] : items));
        const nextOffset = startOffset + items.length;
        setOffset(nextOffset);
        setTotal(items.length < LISTS_PAGE_SIZE ? nextOffset : nextOffset + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lists");
        if (!append) {
          setLists([]);
          setOffset(0);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchLists(0, false);
  }, [fetchLists]);

  const hasMore = offset < total;

  const applyFilters = () => {
    setFilters({ search: searchInput.trim(), owner: ownerInput.trim() });
  };

  const handleFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  useEffect(() => {
    if (!editing) {
      setEditNameInput("");
      setEditDescriptionInput("");
      setEditIsPrivate(false);
      return;
    }
    setEditNameInput(editing.name);
    setEditDescriptionInput(editing.description ?? "");
    setEditIsPrivate(editing.isPrivate);
  }, [editing]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editNameInput.trim()) {
      setError("List name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/lists/${editing.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editNameInput.trim(),
          description: editDescriptionInput.trim() || null,
          isPrivate: editIsPrivate,
        }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to update list (${response.status})`
        );
        throw new Error(message);
      }

      const updatedList =
        payload && typeof payload === "object" && payload !== null
          ? (payload as { list?: AdminList }).list
          : undefined;

      if (updatedList) {
        setLists((prev) =>
          prev.map((entry) =>
            entry.id === updatedList.id ? updatedList : entry
          )
        );
      } else {
        await fetchLists(0, false);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update list");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePicture = async (list: AdminList) => {
    const confirmed = window.confirm(`Delete picture for list "${list.name}"?`);
    if (!confirmed) return;
    setError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/admin/lists/${list.id}/picture`),
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete picture (${response.status})`
        );
        throw new Error(message);
      }

      await fetchLists(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete picture");
    }
  };

  const handleViewRecords = async (list: AdminList) => {
    setViewingRecords(list);
    setLoadingRecords(true);
    setRecords([]);
    setError(null);

    try {
      const response = await fetch(
        apiUrl(`/api/admin/lists/${list.id}/records`),
        { credentials: "include" }
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to load records (${response.status})`
        );
        throw new Error(message);
      }

      const body = (payload ?? {}) as { records?: AdminListRecord[] };
      const items = Array.isArray(body.records) ? body.records : [];
      setRecords(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
      setRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  };

  const handleDeleteRecord = async (record: AdminListRecord) => {
    if (!viewingRecords) return;
    const confirmed = window.confirm(
      `Remove "${record.name}" from list "${viewingRecords.name}"?`
    );
    if (!confirmed) return;
    setError(null);

    try {
      const response = await fetch(
        apiUrl(`/api/admin/lists/${viewingRecords.id}/records/${record.id}`),
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete record (${response.status})`
        );
        throw new Error(message);
      }

      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      await fetchLists(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete record");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Search lists"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 280 } }}
        />
        <TextField
          label="Owner username"
          value={ownerInput}
          onChange={(event) => setOwnerInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 220 } }}
        />
        <Button
          variant="outlined"
          onClick={() => fetchLists(0, false)}
          disabled={loading}
        >
          Refresh
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ alignSelf: "center", opacity: 0.8 }}>
          {lists.length} shown
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Records</TableCell>
              <TableCell>Likes</TableCell>
              <TableCell>Privacy</TableCell>
              <TableCell>Picture</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lists.map((list) => (
              <TableRow hover key={list.id}>
                <TableCell>{list.id}</TableCell>
                <TableCell>
                  <Tooltip title={list.description || "No description"}>
                    <span>{list.name}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  {list.owner.displayName
                    ? `${list.owner.displayName} (@${list.owner.username})`
                    : `@${list.owner.username}`}
                </TableCell>
                <TableCell>
                  <Chip
                    label={list.recordCount}
                    size="small"
                    onClick={() => handleViewRecords(list)}
                    clickable
                  />
                </TableCell>
                <TableCell>{list.likes}</TableCell>
                <TableCell>
                  <Chip
                    label={list.isPrivate ? "Private" : "Public"}
                    size="small"
                    color={list.isPrivate ? "default" : "primary"}
                  />
                </TableCell>
                <TableCell>
                  {list.pictureUrl ? (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeletePicture(list)}
                    >
                      Delete
                    </Button>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => setEditing(list)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!loading && lists.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No lists found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && lists.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => fetchLists(offset, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => (saving ? undefined : setEditing(null))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit list</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          <TextField
            label="Name"
            value={editNameInput}
            onChange={(event) => setEditNameInput(event.target.value)}
            required
            size="small"
          />
          <TextField
            label="Description"
            value={editDescriptionInput}
            onChange={(event) => setEditDescriptionInput(event.target.value)}
            multiline
            minRows={2}
            maxRows={4}
            size="small"
            sx={{
              "& .MuiInputBase-root": {
                height: "auto",
              },
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={editIsPrivate}
                onChange={(event) => setEditIsPrivate(event.target.checked)}
              />
            }
            label="Private"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditing(null)}
            disabled={saving}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(viewingRecords)}
        onClose={() => setViewingRecords(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Records in "{viewingRecords?.name || ""}" ({records.length})
        </DialogTitle>
        <DialogContent>
          {loadingRecords ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : records.length === 0 ? (
            <Typography variant="body2" sx={{ py: 2, textAlign: "center" }}>
              No records in this list.
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Artist</TableCell>
                    <TableCell>Year</TableCell>
                    <TableCell>Rating</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map((record) => (
                    <TableRow hover key={record.id}>
                      <TableCell>{record.name}</TableCell>
                      <TableCell>{record.artist ?? "—"}</TableCell>
                      <TableCell>{record.releaseYear ?? "—"}</TableCell>
                      <TableCell>{record.rating ?? "—"}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteRecord(record)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewingRecords(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

const REPORT_STATUS_OPTIONS = ["Pending", "Reviewed", "Resolved", "Dismissed"];
const REPORT_TYPE_OPTIONS = [
  { label: "All Types", value: "" },
  { label: "General", value: "general" },
  { label: "User", value: "user" },
  { label: "Record", value: "record" },
  { label: "Master", value: "master" },
  { label: "List", value: "list" },
];

function ReportsTab() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters - input is for the text field, filter is the committed value
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [reportedByInput, setReportedByInput] = useState<string>("");
  const [reportedByFilter, setReportedByFilter] = useState<string>("");

  // Edit dialog
  const [editing, setEditing] = useState<AdminReport | null>(null);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editAdminNotes, setEditAdminNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(
    async (pageNum: number) => {
      setError(null);
      setLoading(true);

      try {
        const params = new URLSearchParams();
        params.set("page", String(pageNum));
        if (typeFilter) params.set("type", typeFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (reportedByFilter) params.set("reportedBy", reportedByFilter);

        const response = await fetch(
          apiUrl(`/api/admin/reports?${params.toString()}`),
          { credentials: "include" }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = getErrorMessage(
            payload,
            `Failed to load reports (${response.status})`
          );
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          reports?: AdminReport[];
          total?: number;
          page?: number;
          totalPages?: number;
        };
        setReports(Array.isArray(body.reports) ? body.reports : []);
        setTotal(typeof body.total === "number" ? body.total : 0);
        setPage(typeof body.page === "number" ? body.page : 1);
        setTotalPages(
          typeof body.totalPages === "number" ? body.totalPages : 1
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports");
        setReports([]);
      } finally {
        setLoading(false);
      }
    },
    [typeFilter, statusFilter, reportedByFilter]
  );

  useEffect(() => {
    fetchReports(1);
  }, [fetchReports]);

  const applyReportedByFilter = useCallback(() => {
    setReportedByFilter(reportedByInput.trim());
  }, [reportedByInput]);

  const handlePageChange = (
    _event: React.ChangeEvent<unknown>,
    value: number
  ) => {
    fetchReports(value);
  };

  useEffect(() => {
    if (!editing) {
      setEditStatus("");
      setEditAdminNotes("");
      return;
    }
    setEditStatus(editing.status);
    setEditAdminNotes(editing.adminNotes ?? "");
  }, [editing]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        apiUrl(`/api/admin/reports/${editing.type}/${editing.id}`),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: editStatus,
            adminNotes: editAdminNotes.trim() || null,
          }),
        }
      );

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to update report (${response.status})`
        );
        throw new Error(message);
      }

      // Update hasPendingReports in cached user info
      const responseBody = payload as { hasPendingReports?: boolean } | null;
      if (responseBody && typeof responseBody.hasPendingReports === "boolean") {
        const cachedInfo = getCachedUserInfo();
        if (cachedInfo) {
          setCachedUserInfo({
            ...cachedInfo,
            hasPendingReports: responseBody.hasPendingReports,
          });
        }
      }

      // Update the report in the list
      setReports((prev) =>
        prev.map((r) =>
          r.id === editing.id && r.type === editing.type
            ? {
                ...r,
                status: editStatus,
                adminNotes: editAdminNotes.trim() || null,
              }
            : r
        )
      );
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report");
    } finally {
      setSaving(false);
    }
  };

  const getTargetLink = (report: AdminReport): string | null => {
    if (report.type === "user" && report.targetUsername) {
      return `/community/${encodeURIComponent(report.targetUsername)}`;
    }
    if (report.type === "record" && report.targetId && report.targetUsername) {
      return `/community/${encodeURIComponent(report.targetUsername)}/record/${
        report.targetId
      }`;
    }
    if (report.type === "master" && report.targetId) {
      return `/master/${report.targetId}`;
    }
    if (report.type === "list" && report.targetId) {
      return `/list/${report.targetId}`;
    }
    return null;
  };

  const getStatusColor = (
    status: string
  ): "default" | "warning" | "success" | "error" => {
    switch (status) {
      case "Pending":
        return "warning";
      case "Resolved":
        return "success";
      case "Dismissed":
        return "error";
      default:
        return "default";
    }
  };

  const getTypeLabel = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
      >
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Type</InputLabel>
          <Select
            value={typeFilter}
            label="Type"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {REPORT_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            label="Status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="">All Statuses</MenuItem>
            {REPORT_STATUS_OPTIONS.map((status) => (
              <MenuItem key={status} value={status}>
                {status}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Reported By"
          value={reportedByInput}
          onChange={(e) => setReportedByInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyReportedByFilter();
            }
          }}
          size="small"
          sx={{ width: { xs: "100%", md: 200 } }}
        />

        <Button
          variant="outlined"
          onClick={() => {
            setReportedByFilter(reportedByInput.trim());
          }}
          disabled={loading}
        >
          Refresh
        </Button>

        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {total} report{total !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Reported By</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reports.map((report) => {
              const targetLink = getTargetLink(report);
              return (
                <TableRow hover key={`${report.type}-${report.id}`}>
                  <TableCell>{report.id}</TableCell>
                  <TableCell>
                    <Chip
                      label={getTypeLabel(report.type)}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {report.reportedByUsername ? (
                      <Button
                        size="small"
                        onClick={() =>
                          navigate(
                            `/community/${encodeURIComponent(
                              report.reportedByUsername!
                            )}`
                          )
                        }
                        sx={{ textTransform: "none", p: 0, minWidth: 0 }}
                      >
                        @{report.reportedByUsername}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {report.type === "general" ? (
                      "—"
                    ) : targetLink ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Button
                          size="small"
                          onClick={() => navigate(targetLink)}
                          sx={{ textTransform: "none", p: 0, minWidth: 0 }}
                          endIcon={<OpenInNewIcon fontSize="inherit" />}
                        >
                          {report.targetName ||
                            report.targetUsername ||
                            `ID: ${report.targetId}`}
                        </Button>
                      </Stack>
                    ) : (
                      report.targetName ||
                      report.targetUsername ||
                      `ID: ${report.targetId}` ||
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{report.reason}</TableCell>
                  <TableCell>
                    {report.userNotes ? (
                      <Tooltip title={report.userNotes}>
                        <span style={{ cursor: "help" }}>
                          {report.userNotes.length > 30
                            ? report.userNotes.slice(0, 30) + "…"
                            : report.userNotes}
                        </span>
                      </Tooltip>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {report.created
                      ? new Date(report.created).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={report.status}
                      size="small"
                      color={getStatusColor(report.status)}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => setEditing(report)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && reports.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  No reports found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
            />
          </Box>
        )
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => (saving ? undefined : setEditing(null))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Update Report</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          {editing && (
            <>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Typography variant="body2">
                  <strong>Type:</strong> {getTypeLabel(editing.type)}
                </Typography>
                <Typography variant="body2">
                  <strong>Reported by:</strong> @
                  {editing.reportedByUsername || "Unknown"}
                </Typography>
              </Box>
              <Typography variant="body2">
                <strong>Reason:</strong> {editing.reason}
              </Typography>
              {editing.userNotes && (
                <Typography variant="body2">
                  <strong>User notes:</strong> {editing.userNotes}
                </Typography>
              )}
              {editing.targetName && (
                <Typography variant="body2">
                  <strong>Target:</strong> {editing.targetName}
                </Typography>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={editStatus}
                  label="Status"
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {REPORT_STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Admin Notes"
                value={editAdminNotes}
                onChange={(e) => setEditAdminNotes(e.target.value)}
                multiline
                minRows={2}
                maxRows={4}
                size="small"
                sx={{
                  "& .MuiInputBase-root": {
                    height: "auto",
                  },
                }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditing(null)}
            disabled={saving}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TagsTab() {
  const [searchInput, setSearchInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [filters, setFilters] = useState({ search: "", owner: "" });
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminTag | null>(null);
  const [tagNameInput, setTagNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTags = useCallback(
    async (startOffset: number, append: boolean) => {
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", String(TAGS_PAGE_SIZE));
        params.set("offset", String(startOffset));
        if (filters.search) {
          params.set("q", filters.search);
        }
        if (filters.owner) {
          params.set("user", filters.owner);
        }

        const response = await fetch(
          apiUrl(`/api/admin/tags?${params.toString()}`),
          { credentials: "include" }
        );

        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (!response.ok) {
          const message = getErrorMessage(
            payload,
            `Failed to load tags (${response.status})`
          );
          throw new Error(message);
        }

        const body = (payload ?? {}) as {
          tags?: AdminTag[];
          total?: number;
        };
        const items = Array.isArray(body.tags) ? body.tags : [];
        setTags((prev) => (append ? [...prev, ...items] : items));
        const nextOffset = startOffset + items.length;
        setOffset(nextOffset);
        setTotal(typeof body.total === "number" ? body.total : nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tags");
        if (!append) {
          setTags([]);
          setOffset(0);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    fetchTags(0, false);
  }, [fetchTags]);

  const hasMore = offset < total;

  const applyFilters = () => {
    setFilters({ search: searchInput.trim(), owner: ownerInput.trim() });
  };

  const handleFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyFilters();
    }
  };

  useEffect(() => {
    if (!editing) {
      setTagNameInput("");
      return;
    }
    setTagNameInput(editing.name);
  }, [editing]);

  const handleSave = async () => {
    if (!editing) return;
    if (!tagNameInput.trim()) {
      setError("Tag name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/tags/${editing.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tagNameInput.trim() }),
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to update tag (${response.status})`
        );
        throw new Error(message);
      }

      const updatedTag =
        payload && typeof payload === "object" && payload !== null
          ? (payload as { tag?: AdminTag }).tag
          : undefined;

      if (updatedTag) {
        setTags((prev) =>
          prev.map((entry) => (entry.id === updatedTag.id ? updatedTag : entry))
        );
      } else {
        await fetchTags(0, false);
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tag");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: AdminTag) => {
    const confirmed = window.confirm(`Delete tag "${tag.name}"?`);
    if (!confirmed) return;
    setError(null);
    try {
      const response = await fetch(apiUrl(`/api/admin/tags/${tag.id}`), {
        method: "DELETE",
        credentials: "include",
      });

      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = getErrorMessage(
          payload,
          `Failed to delete tag (${response.status})`
        );
        throw new Error(message);
      }

      await fetchTags(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tag");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Search tags"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 280 } }}
        />
        <TextField
          label="Owner username"
          value={ownerInput}
          onChange={(event) => setOwnerInput(event.target.value)}
          onKeyDown={handleFieldKey}
          size="small"
          sx={{ width: { xs: "100%", md: 220 } }}
        />
        <Button
          variant="outlined"
          onClick={() => fetchTags(0, false)}
          disabled={loading}
        >
          Refresh
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="body2" sx={{ alignSelf: "center", opacity: 0.8 }}>
          {tags.length} / {total} shown
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper} sx={{ maxHeight: 420 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Usage</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tags.map((tag) => (
              <TableRow hover key={tag.id}>
                <TableCell>{tag.id}</TableCell>
                <TableCell>{tag.name}</TableCell>
                <TableCell>
                  {tag.owner
                    ? tag.owner.displayName
                      ? `${tag.owner.displayName} (@${tag.owner.username})`
                      : `@${tag.owner.username}`
                    : "—"}
                </TableCell>
                <TableCell>{tag.usageCount}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <IconButton size="small" onClick={() => setEditing(tag)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(tag)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && tags.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No tags found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && tags.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        hasMore && (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button
              variant="contained"
              onClick={() => fetchTags(offset, true)}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </Box>
        )
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => (saving ? undefined : setEditing(null))}
      >
        <DialogTitle>Edit tag</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          <TextField
            label="Name"
            value={tagNameInput}
            onChange={(event) => setTagNameInput(event.target.value)}
            required
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setEditing(null)}
            disabled={saving}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const location = useLocation();
  const cached = getCachedUserInfo();
  const [username, setUsername] = useState(cached?.username ?? "");
  const [displayName, setDisplayName] = useState(cached?.displayName ?? "");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cached?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cached);
  const [userUuid, setUserUuid] = useState<string>(cached?.userUuid ?? "");
  const [adminPermissions, setAdminPermissions] = useState<AdminPermissions>(
    cached?.adminPermissions ?? {
      canManageAdmins: false,
      canDeleteUsers: false,
    }
  );
  const [tab, setTab] = useState<AdminTabKey>("users");

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
          navigate(`/login?next=${next}`, { replace: true });
        }
        return;
      }
      if (!info.isAdmin) {
        navigate("/mycollection", { replace: true });
        return;
      }
      setUsername(info.username);
      setDisplayName(info.displayName ?? "");
      setProfilePicUrl(info.profilePicUrl ?? null);
      setUserUuid(info.userUuid);
      setAdminPermissions(info.adminPermissions);
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

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const tabContent = useMemo(() => {
    switch (tab) {
      case "users":
        return (
          <UsersTab
            permissions={adminPermissions}
            currentUserUuid={userUuid || null}
          />
        );
      case "records":
        return <RecordsTab />;
      case "masters":
        return <MastersTab />;
      case "lists":
        return <ListsTab />;
      case "reports":
        return <ReportsTab />;
      case "fixcovers":
        return <FixCoversTab />;
      case "tags":
      default:
        return <TagsTab />;
    }
  }, [tab, adminPermissions, userUuid]);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <TopBar
          onLogout={handleLogout}
          title="Admin Panel"
          username={username}
          displayName={displayName}
          profilePicUrl={profilePicUrl ?? undefined}
          isAdmin
          loading={userLoading}
        />

        <Paper
          sx={{
            borderRadius: 2,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Tabs
            value={tab}
            onChange={(_event, value) => setTab(value as AdminTabKey)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {TAB_OPTIONS.map((option) => (
              <Tab
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </Tabs>
          <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>{tabContent}</Box>
        </Paper>
      </Box>
    </ThemeProvider>
  );
}
