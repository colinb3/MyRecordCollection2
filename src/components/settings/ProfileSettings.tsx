import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiUrl from "../../api";
import {
  Box,
  Typography,
  TextField,
  Button,
  Stack,
  Divider,
  Alert,
  Snackbar,
  InputAdornment,
  IconButton,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import placeholderCover from "../../assets/missingImg.jpg";
import {
  DEFAULT_COLLECTION_NAME,
  loadCollectionRecords,
} from "../../collectionRecords";
import {
  loadProfileHighlights,
  setCachedProfileHighlights,
} from "../../profileHighlights";
import type { Record as MrcRecord } from "../../types";
import { optimizeProfileImageFile } from "../../profileImageOptimizer";

interface ProfileSettingsProps {
  username: string;
  displayName: string;
  bio: string;
  profilePicUrl: string | null;
  onProfileUpdated?: (user: {
    username: string;
    displayName: string;
    bio: string | null;
    profilePicUrl: string | null;
  }) => void;
}

const usernameRegex = /^[a-zA-Z0-9_]+$/;
const passwordRegex = /(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
const MAX_PROFILE_HIGHLIGHTS = 4;
const PROFILE_PIC_MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ALLOWED_PROFILE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export default function ProfileSettings({
  username,
  displayName,
  bio,
  profilePicUrl,
  onProfileUpdated,
}: ProfileSettingsProps) {
  const [usernameValue, setUsernameValue] = useState(username);
  const [displayNameValue, setDisplayNameValue] = useState(displayName);
  const [bioValue, setBioValue] = useState(bio);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string | null>(
    profilePicUrl
  );
  const [profilePicError, setProfilePicError] = useState<string | null>(null);
  const [profilePicUploading, setProfilePicUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizeProfilePicUrl = useCallback((raw: unknown): string | null => {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return apiUrl(normalizedPath);
  }, []);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<
    string | null
  >(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null);
  const [passwordAlert, setPasswordAlert] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [highlightRecords, setHighlightRecords] = useState<MrcRecord[]>([]);
  const [initialHighlightIds, setInitialHighlightIds] = useState<number[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(true);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const [highlightSuccess, setHighlightSuccess] = useState<string | null>(null);
  const [savingHighlights, setSavingHighlights] = useState(false);

  const [availableRecords, setAvailableRecords] = useState<MrcRecord[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [hasLoadedCandidates, setHasLoadedCandidates] = useState(false);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    setUsernameValue(username);
  }, [username]);

  useEffect(() => {
    setDisplayNameValue(displayName);
  }, [displayName]);

  useEffect(() => {
    setBioValue(bio);
  }, [bio]);

  useEffect(() => {
    setProfilePicPreview(normalizeProfilePicUrl(profilePicUrl));
  }, [profilePicUrl, normalizeProfilePicUrl]);

  useEffect(() => {
    let cancelled = false;

    const loadHighlights = async () => {
      setHighlightsLoading(true);
      setHighlightError(null);
      try {
        const data = await loadProfileHighlights();
        if (cancelled) return;

        if (data) {
          const trimmedRecords = data.records.slice(0, MAX_PROFILE_HIGHLIGHTS);
          setHighlightRecords(trimmedRecords);
          setInitialHighlightIds(trimmedRecords.map((record) => record.id));
        } else {
          setHighlightRecords([]);
          setInitialHighlightIds([]);
          setHighlightError("Failed to load highlights");
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Failed to load highlights", error);
          setHighlightRecords([]);
          setInitialHighlightIds([]);
          setHighlightError("Failed to load highlights");
        }
      } finally {
        if (!cancelled) {
          setHighlightsLoading(false);
        }
      }
    };

    loadHighlights();

    return () => {
      cancelled = true;
    };
  }, []);

  const ensureCandidatesLoaded = useCallback(async () => {
    setCandidatesLoading(true);
    setCandidateError(null);
    try {
      const records = await loadCollectionRecords(
        DEFAULT_COLLECTION_NAME,
        true
      );
      setAvailableRecords(records);
      setHasLoadedCandidates(true);
    } catch (error) {
      console.warn("Failed to load available records", error);
      setAvailableRecords([]);
      setCandidateError("Failed to load records. Please try again.");
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const handleCandidatePickerOpen = useCallback(() => {
    if (hasLoadedCandidates || candidatesLoading) {
      return;
    }
    void ensureCandidatesLoaded();
  }, [candidatesLoading, ensureCandidatesLoaded, hasLoadedCandidates]);

  const highlightIds = useMemo(
    () => highlightRecords.map((record) => record.id),
    [highlightRecords]
  );

  const highlightsDirty = useMemo(() => {
    if (highlightsLoading) return false;
    if (highlightIds.length !== initialHighlightIds.length) return true;
    for (let i = 0; i < highlightIds.length; i += 1) {
      if (highlightIds[i] !== initialHighlightIds[i]) {
        return true;
      }
    }
    return false;
  }, [highlightIds, initialHighlightIds, highlightsLoading]);

  const highlightLimitReached =
    highlightRecords.length >= MAX_PROFILE_HIGHLIGHTS;

  const filteredCandidates = useMemo(() => {
    const selectedIds = new Set(highlightRecords.map((record) => record.id));
    const query = searchInput.trim().toLowerCase();
    return availableRecords.filter((record) => {
      if (selectedIds.has(record.id)) {
        return false;
      }
      if (!query) return true;
      const title = record.record.toLowerCase();
      const artist = record.artist.toLowerCase();
      return title.includes(query) || artist.includes(query);
    });
  }, [availableRecords, highlightRecords, searchInput]);

  const handleAddHighlight = useCallback(
    (record: MrcRecord | null) => {
      if (!record) return;
      setHighlightSuccess(null);
      setHighlightError(null);
      if (highlightRecords.some((item) => item.id === record.id)) {
        setHighlightError("That record is already selected.");
        return;
      }
      if (highlightRecords.length >= MAX_PROFILE_HIGHLIGHTS) {
        setHighlightError(
          `You can feature up to ${MAX_PROFILE_HIGHLIGHTS} records.`
        );
        return;
      }
      setHighlightRecords((prev) => [
        ...prev,
        { ...record, tags: [...record.tags] },
      ]);
    },
    [highlightRecords]
  );

  const handleRemoveHighlight = useCallback((id: number) => {
    setHighlightError(null);
    setHighlightSuccess(null);
    setHighlightRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  const handleMoveHighlight = useCallback(
    (index: number, direction: -1 | 1) => {
      setHighlightError(null);
      setHighlightSuccess(null);
      setHighlightRecords((prev) => {
        const target = index + direction;
        if (target < 0 || target >= prev.length) {
          return prev;
        }
        const next = [...prev];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return next;
      });
    },
    []
  );

  const handleClearHighlights = useCallback(() => {
    setHighlightError(null);
    setHighlightSuccess(null);
    setHighlightRecords([]);
  }, []);

  const handleSaveHighlights = useCallback(async () => {
    setHighlightError(null);
    setHighlightSuccess(null);
    setSavingHighlights(true);
    try {
      const res = await fetch(apiUrl("/api/profile/highlights"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recordIds: highlightRecords.map((record) => record.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHighlightError(data?.error || "Failed to update highlights");
        return;
      }
      const nextHighlightIds = highlightRecords.map((record) => record.id);
      setInitialHighlightIds(nextHighlightIds);
      setHighlightSuccess("Highlights updated");
      setCachedProfileHighlights({
        recordIds: nextHighlightIds,
        records: highlightRecords.map((record) => ({
          ...record,
          tags: [...record.tags],
        })),
      });
    } catch (error) {
      setHighlightError("Network error");
    } finally {
      setSavingHighlights(false);
    }
  }, [highlightRecords]);

  const profileDirty = useMemo(() => {
    const normalizedUsername = usernameValue.trim();
    const normalizedDisplayName = displayNameValue.trim();
    const normalizedBio = bioValue.trim();
    const initialBio = (bio || "").trim();
    return (
      normalizedUsername !== username ||
      normalizedDisplayName !== displayName ||
      normalizedBio !== initialBio
    );
  }, [usernameValue, displayNameValue, bioValue, username, displayName, bio]);

  const validateProfile = () => {
    let hasError = false;
    const trimmedUsername = usernameValue.trim();
    const trimmedDisplayName = displayNameValue.trim();
    const trimmedBio = bioValue.trim();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      setUsernameError("Username must be between 3 and 30 characters");
      hasError = true;
    } else if (!usernameRegex.test(trimmedUsername)) {
      setUsernameError(
        "Username may only contain letters, numbers, and underscores"
      );
      hasError = true;
    } else {
      setUsernameError(null);
    }

    if (!trimmedDisplayName) {
      setDisplayNameError("Display name is required");
      hasError = true;
    } else if (trimmedDisplayName.length > 50) {
      setDisplayNameError("Display name must be 50 characters or fewer");
      hasError = true;
    } else {
      setDisplayNameError(null);
    }

    if (trimmedBio.length > 255) {
      setBioError("Bio must be 255 characters or fewer");
      hasError = true;
    } else {
      setBioError(null);
    }

    return !hasError;
  };

  const handleSaveProfile = async () => {
    setProfileSuccess(null);
    setProfileError(null);
    setProfilePicError(null);
    if (!profileDirty) {
      setProfileError("No changes to save");
      return;
    }
    if (!validateProfile()) return;

    const payload: Record<string, string | null> = {};
    if (usernameValue.trim() !== username) {
      payload.username = usernameValue.trim();
    }
    if (displayNameValue.trim() !== displayName) {
      payload.displayName = displayNameValue.trim();
    }
    const normalizedBio = bioValue.trim();
    const formattedBio = normalizedBio.length > 0 ? normalizedBio : null;
    const initialBioValue = (bio || "").trim();
    const initialBioNormalized =
      initialBioValue.length > 0 ? initialBioValue : null;
    if (formattedBio !== initialBioNormalized) {
      payload.bio = formattedBio;
    }
    if (Object.keys(payload).length === 0) {
      setProfileError("No changes to save");
      return;
    }

    setProfileLoading(true);
    try {
      const res = await fetch(apiUrl("/api/profile"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setProfileError(data.error || "Failed to update profile");
        return;
      }
      setProfileSuccess("Profile updated successfully");
      const updated = data.user ?? {
        username: payload.username ?? username,
        displayName: payload.displayName ?? displayName,
        bio: formattedBio,
        profilePicUrl: profilePicPreview,
      };
      setUsernameValue(updated.username);
      setDisplayNameValue(updated.displayName ?? "");
      setBioValue(updated.bio ?? "");
      const nextProfilePic =
        typeof updated.profilePicUrl === "string"
          ? normalizeProfilePicUrl(updated.profilePicUrl)
          : profilePicPreview;
      setProfilePicPreview(nextProfilePic ?? null);
      if (onProfileUpdated) {
        onProfileUpdated({
          username: updated.username,
          displayName: updated.displayName ?? "",
          bio: updated.bio ?? null,
          profilePicUrl: nextProfilePic ?? null,
        });
      }
    } catch (err) {
      setProfileError("Network error");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleTriggerProfilePicSelect = useCallback(() => {
    if (profilePicUploading) return;
    fileInputRef.current?.click();
  }, [profilePicUploading]);

  const handleProfilePicInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setProfileSuccess(null);
    setProfilePicError(null);

    if (!ALLOWED_PROFILE_MIME_TYPES.includes(file.type)) {
      setProfilePicError("Please choose a JPG, PNG, WEBP, or AVIF image.");
      event.target.value = "";
      return;
    }

    setProfilePicUploading(true);
    try {
      const optimizedFile = await optimizeProfileImageFile(file).catch(
        (error) => {
          console.warn("Client-side image optimization failed", error);
          throw new Error(
            "Could not process that image. Please choose a different file."
          );
        }
      );

      if (optimizedFile.size > PROFILE_PIC_MAX_SIZE) {
        setProfilePicError(
          "Optimized image is still larger than 3 MB. Please choose a smaller image."
        );
        return;
      }

      const formData = new FormData();
      formData.append("avatar", optimizedFile);
      const res = await fetch(apiUrl("/api/profile/avatar"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfilePicError(data.error || "Failed to upload profile picture");
        return;
      }
      const absoluteUrl = normalizeProfilePicUrl(data.profilePicUrl);
      setProfilePicPreview(absoluteUrl ?? null);
      setProfileSuccess("Profile picture updated");
      onProfileUpdated?.({
        username: usernameValue.trim(),
        displayName: displayNameValue.trim(),
        bio: bioValue.trim().length > 0 ? bioValue.trim() : null,
        profilePicUrl: absoluteUrl ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to upload profile picture";
      setProfilePicError(message);
    } finally {
      setProfilePicUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveProfilePic = useCallback(async () => {
    setProfileSuccess(null);
    setProfilePicError(null);
    setProfilePicUploading(true);
    try {
      const res = await fetch(apiUrl("/api/profile/avatar"), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfilePicError(data.error || "Failed to remove profile picture");
        return;
      }
      setProfilePicPreview(null);
      setProfileSuccess("Profile picture removed");
      onProfileUpdated?.({
        username: usernameValue.trim(),
        displayName: displayNameValue.trim(),
        bio: bioValue.trim().length > 0 ? bioValue.trim() : null,
        profilePicUrl: null,
      });
    } catch (error) {
      setProfilePicError("Failed to remove profile picture");
    } finally {
      setProfilePicUploading(false);
    }
  }, [bio, displayName, onProfileUpdated, username]);

  const validatePasswordFields = () => {
    let hasError = false;

    if (!currentPassword) {
      setCurrentPasswordError("Current password is required");
      hasError = true;
    } else {
      setCurrentPasswordError(null);
    }

    if (newPassword.length < 8) {
      setNewPasswordError("Password must be at least 8 characters");
      hasError = true;
    } else if (!passwordRegex.test(newPassword)) {
      setNewPasswordError(
        "Password must include a letter, a number, and a special character"
      );
      hasError = true;
    } else {
      setNewPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please retype the new password");
      hasError = true;
    } else if (confirmPassword !== newPassword) {
      setConfirmPasswordError("Passwords do not match");
      hasError = true;
    } else {
      setConfirmPasswordError(null);
    }

    return !hasError;
  };

  const handleChangePassword = async () => {
    setPasswordSuccess(null);
    setPasswordAlert(null);

    if (!validatePasswordFields()) {
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch(apiUrl("/api/profile/password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setCurrentPasswordError(
            data.error || "Current password is incorrect."
          );
        } else {
          setPasswordAlert(data.error || "Failed to change password");
        }
        return;
      }
      setPasswordSuccess("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPasswordError(null);
      setNewPasswordError(null);
      setConfirmPasswordError(null);
    } catch (err) {
      setPasswordAlert("Network error");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Profile Settings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Update everything about your profile.
        </Typography>
        <Stack
          direction={{ xs: "row", sm: "row" }}
          spacing={3}
          alignItems={{ xs: "center", sm: "center" }}
          sx={{ mb: 3 }}
        >
          <Avatar
            variant="rounded"
            src={profilePicPreview ?? undefined}
            alt={displayNameValue || usernameValue}
            sx={{ width: 112, height: 112, bgcolor: "grey.700" }}
          >
            {!profilePicPreview &&
              (displayNameValue || usernameValue || "").charAt(0).toUpperCase()}
          </Avatar>
          <Stack spacing={1} width="100%">
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Button
                variant="contained"
                onClick={handleTriggerProfilePicSelect}
                disabled={profilePicUploading}
                sx={{ alignSelf: "flex-start" }}
              >
                {profilePicUploading ? "Uploading..." : "Upload new photo"}
              </Button>
              {profilePicPreview && (
                <Button
                  variant="text"
                  color="inherit"
                  onClick={handleRemoveProfilePic}
                  disabled={profilePicUploading}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Remove photo
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              JPG, PNG, WEBP, AVIF (max 3 MB).
            </Typography>
            {profilePicError && (
              <Alert severity="error" onClose={() => setProfilePicError(null)}>
                {profilePicError}
              </Alert>
            )}
          </Stack>
        </Stack>
        <input
          type="file"
          ref={fileInputRef}
          hidden
          accept={ALLOWED_PROFILE_MIME_TYPES.join(",")}
          onChange={handleProfilePicInputChange}
        />
        <Stack spacing={2} pb={2} width={{ xs: "100%", sm: "50%" }}>
          <TextField
            label="Display name"
            value={displayNameValue}
            onChange={(e) => {
              setDisplayNameValue(e.target.value);
              setProfileError(null);
              setProfileSuccess(null);
            }}
            error={!!displayNameError}
            helperText={displayNameError ?? ""}
            size="small"
          />
          <TextField
            label="Username"
            value={usernameValue}
            onChange={(e) => {
              setUsernameValue(e.target.value);
              setProfileError(null);
              setProfileSuccess(null);
            }}
            error={!!usernameError}
            helperText={usernameError ?? ""}
            size="small"
            autoComplete="username"
          />
        </Stack>

        <TextField
          label="Bio"
          multiline
          fullWidth
          maxRows={10}
          value={bioValue}
          onChange={(e) => {
            setBioValue(e.target.value);
            setProfileError(null);
            setProfileSuccess(null);
            setBioError(null);
          }}
          error={!!bioError}
          helperText={
            bioError ?? `${Math.min(bioValue.trim().length, 255)}/255`
          }
          size="small"
          sx={{
            mb: 1.5,
            "& .MuiOutlinedInput-root": {
              height: "auto",
            },
          }}
        />

        {profileError && <Alert severity="error">{profileError}</Alert>}
        <Button
          variant="contained"
          onClick={handleSaveProfile}
          disabled={profileLoading || !profileDirty}
          sx={{ alignSelf: "flex-start" }}
        >
          {profileLoading ? "Saving..." : "Save changes"}
        </Button>
      </Box>

      <Divider />

      <Box>
        <Typography variant="h6" gutterBottom>
          Collection Highlights
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Choose up to {MAX_PROFILE_HIGHLIGHTS} records to feature on your
          profile page.
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Autocomplete<MrcRecord, false, false, false>
            options={filteredCandidates}
            loading={candidatesLoading}
            value={null}
            filterOptions={(options) => options}
            inputValue={searchInput}
            onOpen={handleCandidatePickerOpen}
            onInputChange={(_, value, reason) => {
              if (reason === "reset") {
                setSearchInput("");
                return;
              }
              setSearchInput(value);
            }}
            onChange={(_, value) => handleAddHighlight(value)}
            getOptionLabel={(option) => option.record}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            disabled={
              highlightLimitReached || savingHighlights || highlightsLoading
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search records to highlight"
                placeholder={
                  highlightLimitReached
                    ? "Maximum of four highlights reached"
                    : "Type to search for a record"
                }
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {candidatesLoading ? (
                        <CircularProgress
                          color="inherit"
                          size={18}
                          sx={{ mr: 1 }}
                        />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Box display="flex" flexDirection="column">
                  <Typography variant="body1">{option.record}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.artist}
                  </Typography>
                </Box>
              </li>
            )}
            noOptionsText={
              highlightLimitReached
                ? "Remove a highlight to add another."
                : candidateError
                ? candidateError
                : searchInput.trim()
                ? "No matching records."
                : candidatesLoading
                ? "Loading records..."
                : filteredCandidates.length > 0
                ? "Start typing to search your records."
                : "No records available."
            }
          />
        </Box>

        {highlightError && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            onClose={() => setHighlightError(null)}
          >
            {highlightError}
          </Alert>
        )}

        <Box sx={{ mt: 2 }}>
          {highlightsLoading ? (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Loading current highlights...
              </Typography>
            </Box>
          ) : highlightRecords.length === 0 ? (
            <Typography color="text.secondary">
              You haven&apos;t selected any highlights yet.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {highlightRecords.map((record, index) => (
                <Paper
                  key={record.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                  }}
                >
                  <Box display="flex" alignItems="center" gap={2}>
                    <Avatar
                      variant="rounded"
                      src={record.cover || placeholderCover}
                      alt={record.record}
                      sx={{ width: 64, height: 64 }}
                    >
                      {record.record?.charAt(0) ?? ""}
                    </Avatar>
                    <Box flex={1} minWidth={0}>
                      <Typography
                        variant="overline"
                        color="text.secondary"
                        sx={{ lineHeight: 1 }}
                      >
                        Highlight {index + 1}
                      </Typography>
                      <Typography variant="subtitle1" noWrap>
                        {record.record}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {record.artist}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton
                        size="small"
                        onClick={() => handleMoveHighlight(index, -1)}
                        disabled={index === 0 || savingHighlights}
                        aria-label="Move highlight up"
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleMoveHighlight(index, 1)}
                        disabled={
                          index === highlightRecords.length - 1 ||
                          savingHighlights
                        }
                        aria-label="Move highlight down"
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveHighlight(record.id)}
                        disabled={savingHighlights}
                        aria-label="Remove highlight"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mt: 3 }}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Button
            variant="contained"
            onClick={handleSaveHighlights}
            disabled={savingHighlights || highlightsLoading || !highlightsDirty}
            sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            {savingHighlights ? "Saving..." : "Save highlights"}
          </Button>
          <Button
            variant="text"
            color="inherit"
            onClick={handleClearHighlights}
            disabled={savingHighlights || highlightRecords.length === 0}
            sx={{ alignSelf: { xs: "stretch", sm: "flex-start" } }}
          >
            Clear highlights
          </Button>
        </Stack>
      </Box>

      <Divider />

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Change Password
        </Typography>
        <Stack spacing={2}>
          <TextField
            label="Current password"
            type={showPasswords.current ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => {
              const value = e.target.value;
              setCurrentPassword(value);
              setPasswordAlert(null);
              setPasswordSuccess(null);
              if (!value) {
                setCurrentPasswordError("Current password is required");
              } else {
                setCurrentPasswordError(null);
              }
            }}
            size="small"
            autoComplete="current-password"
            error={!!currentPasswordError}
            helperText={currentPasswordError ?? ""}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle current password visibility"
                    onClick={() =>
                      setShowPasswords((prev) => ({
                        ...prev,
                        current: !prev.current,
                      }))
                    }
                    edge="end"
                  >
                    {showPasswords.current ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="New password"
            type={showPasswords.next ? "text" : "password"}
            value={newPassword}
            onChange={(e) => {
              const value = e.target.value;
              setNewPassword(value);
              setPasswordAlert(null);
              setPasswordSuccess(null);
              if (value.length < 8) {
                setNewPasswordError("Password must be at least 8 characters");
              } else if (!passwordRegex.test(value)) {
                setNewPasswordError(
                  "Password must include a letter, a number, and a special character"
                );
              } else {
                setNewPasswordError(null);
              }
              if (confirmPassword) {
                if (confirmPassword !== value) {
                  setConfirmPasswordError("Passwords do not match");
                } else {
                  setConfirmPasswordError(null);
                }
              }
            }}
            size="small"
            autoComplete="new-password"
            error={!!newPasswordError}
            helperText={newPasswordError ?? ""}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle new password visibility"
                    onClick={() =>
                      setShowPasswords((prev) => ({
                        ...prev,
                        next: !prev.next,
                      }))
                    }
                    edge="end"
                  >
                    {showPasswords.next ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <TextField
            label="Confirm new password"
            type={showPasswords.confirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => {
              const value = e.target.value;
              setConfirmPassword(value);
              setPasswordAlert(null);
              setPasswordSuccess(null);
              if (!value) {
                setConfirmPasswordError("Please retype the new password");
              } else if (value !== newPassword) {
                setConfirmPasswordError("Passwords do not match");
              } else {
                setConfirmPasswordError(null);
              }
            }}
            size="small"
            autoComplete="new-password"
            error={!!confirmPasswordError}
            helperText={confirmPasswordError ?? ""}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle confirm password visibility"
                    onClick={() =>
                      setShowPasswords((prev) => ({
                        ...prev,
                        confirm: !prev.confirm,
                      }))
                    }
                    edge="end"
                  >
                    {showPasswords.confirm ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          {passwordAlert && <Alert severity="error">{passwordAlert}</Alert>}
          <Button
            variant="outlined"
            onClick={handleChangePassword}
            disabled={
              passwordLoading ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
            sx={{ alignSelf: "flex-start" }}
          >
            {passwordLoading ? "Updating..." : "Update password"}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Password must be at least 8 characters and include a letter, a
            number, and a special character.
          </Typography>
        </Stack>
      </Box>

      <Snackbar
        open={!!profileSuccess}
        autoHideDuration={4000}
        onClose={() => setProfileSuccess(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          onClose={() => setProfileSuccess(null)}
          variant="filled"
        >
          {profileSuccess}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!passwordSuccess}
        autoHideDuration={4000}
        onClose={() => setPasswordSuccess(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          onClose={() => setPasswordSuccess(null)}
          variant="filled"
        >
          {passwordSuccess}
        </Alert>
      </Snackbar>
      <Snackbar
        open={!!highlightSuccess}
        autoHideDuration={4000}
        onClose={() => setHighlightSuccess(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="success"
          onClose={() => setHighlightSuccess(null)}
          variant="filled"
        >
          {highlightSuccess}
        </Alert>
      </Snackbar>
    </Box>
  );
}
