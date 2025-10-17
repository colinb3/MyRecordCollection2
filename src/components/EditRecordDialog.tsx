import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  Box,
  TextField,
  Slider,
  Chip,
  Autocomplete,
  Typography,
  Stack,
} from "@mui/material";
import { type Record } from "../types"; // Assuming types.ts is in the parent directory
import { wikiGenres } from "../wiki";

// --- COMPONENT PROPS ---
interface EditRecordDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (record: Record) => void;
  record: Record | null; // The record to edit, or null if none
  tagOptions?: string[]; // existing tags to suggest
}

// --- MAIN COMPONENT ---
export default function EditRecordDialog({
  open,
  onClose,
  onSave,
  record,
  tagOptions = [],
}: EditRecordDialogProps) {
  const [editedRecord, setEditedRecord] = useState<Record | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
  const [fetchingRecommendedTags, setFetchingRecommendedTags] =
    useState<boolean>(false);
  const lastFetchKeyRef = useRef<string | null>(null);
  const pendingFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the dialog opens or the record prop changes, reset the internal state
  useEffect(() => {
    if (record) {
      setEditedRecord({ ...record, isCustom: record.isCustom ?? false });
      setImageUrl(record.cover || "");
    } else {
      setEditedRecord(null);
      setImageUrl("");
    }

    setRecommendedTags([]);
    setFetchingRecommendedTags(false);
    lastFetchKeyRef.current = null;
    if (pendingFetchRef.current) {
      window.clearTimeout(pendingFetchRef.current);
      pendingFetchRef.current = null;
    }
  }, [record, open]);

  // Generic handler for simple text field changes
  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    if (editedRecord) {
      setEditedRecord({
        ...editedRecord,
        [name]: name === "release" || name === "rating" ? Number(value) : value,
      });
    }
  };

  // Handler for the image URL input
  const handleImageUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setImageUrl(event.target.value);
    if (editedRecord) {
      setEditedRecord({
        ...editedRecord,
        cover: event.target.value,
      });
    }
  };

  // Handler for the Autocomplete tags input
  const handleTagsChange = (_: any, newValue: string[]) => {
    if (editedRecord) {
      setEditedRecord({ ...editedRecord, tags: newValue });
    }
  };

  // Handler for the Slider rating input
  const handleRatingChange = (_: Event, newValue: number | number[]) => {
    if (editedRecord) {
      setEditedRecord({ ...editedRecord, rating: newValue as number });
    }
  };

  useEffect(() => {
    if (!open || !editedRecord) return;

    const title = editedRecord.record?.trim();
    const artist = editedRecord.artist?.trim();

    if (!title || !artist || title.length < 2 || artist.length < 2) {
      setRecommendedTags([]);
      lastFetchKeyRef.current = null;
      return;
    }

    const fetchKey = `${artist.toLowerCase()}::${title.toLowerCase()}`;
    if (lastFetchKeyRef.current === fetchKey) {
      return;
    }

    if (pendingFetchRef.current) {
      clearTimeout(pendingFetchRef.current);
      pendingFetchRef.current = null;
    }

    let isActive = true;

    pendingFetchRef.current = setTimeout(() => {
      setFetchingRecommendedTags(true);
      wikiGenres(title, artist, false)
        .then((tags) => {
          if (!isActive) return;
          const normalized = Array.from(
            new Set(
              tags
                .map((tag) => tag.trim())
                .filter(Boolean)
                .map((tag) => tag.replace(/\s+/g, " "))
            )
          ).slice(0, 12);
          lastFetchKeyRef.current = fetchKey;
          setRecommendedTags(normalized);
        })
        .catch(() => {
          if (!isActive) return;
          lastFetchKeyRef.current = fetchKey;
          setRecommendedTags([]);
        })
        .finally(() => {
          if (!isActive) return;
          setFetchingRecommendedTags(false);
          pendingFetchRef.current = null;
        });
    }, 400);

    return () => {
      isActive = false;
      if (pendingFetchRef.current) {
        clearTimeout(pendingFetchRef.current);
        pendingFetchRef.current = null;
      }
    };
  }, [open, editedRecord]);

  const handleAddRecommendedTag = (tag: string) => {
    setEditedRecord((prev) => {
      if (!prev) return prev;
      const normalized = tag.trim();
      if (!normalized) return prev;
      const exists = prev.tags.some(
        (existing) => existing.toLowerCase() === normalized.toLowerCase()
      );
      if (exists) return prev;
      return { ...prev, tags: [...prev.tags, normalized] };
    });
  };

  const handleSaveChanges = () => {
    if (editedRecord) {
      let normalizedReview: string | null | undefined = editedRecord.review;
      if (typeof normalizedReview === "string") {
        const trimmed = normalizedReview.trim();
        normalizedReview = trimmed.length > 0 ? trimmed.slice(0, 4000) : null;
      }
      const payload: Record = {
        ...editedRecord,
        review: normalizedReview ?? null,
      };
      onSave(payload);
    }
  };

  // Prevent rendering if there's no record data yet
  if (!editedRecord) {
    return null;
  }

  const existingTagsLower = new Set(
    editedRecord.tags.map((tag) => tag.toLowerCase())
  );

  const titleArtistLocked = !editedRecord.isCustom && editedRecord.id !== -1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { bgcolor: "background.paper" } }}
    >
      <DialogTitle sx={{ bgcolor: "background.paper" }}>
        Record Settings
      </DialogTitle>
      <DialogContent sx={{ bgcolor: "background.paper" }}>
        <Grid container spacing={3} sx={{ mt: 1 }}>
          {/* Left Column: Cover Art */}
          <Grid size={{ xs: 8, sm: 4 }}>
            <Box
              sx={{
                width: "100%",
                paddingTop: "100%" /* Creates a square aspect ratio */,
                backgroundColor: "#333",
                backgroundImage: `url(${imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                borderRadius: 2,
                border: "1px solid grey",
                mb: 2,
              }}
            />
            <TextField
              label="Image URL"
              fullWidth
              variant="outlined"
              value={imageUrl}
              onChange={handleImageUrlChange}
              size="small"
              sx={{
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "background.paper",
                },
              }}
            />
          </Grid>

          {/* Right Column: Record Details */}
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              name="record"
              label="Record Title"
              fullWidth
              variant="outlined"
              size="small"
              value={editedRecord.record}
              onChange={handleChange}
              disabled={titleArtistLocked}
              helperText={
                titleArtistLocked
                  ? "Can only edit the title for custom records."
                  : undefined
              }
              sx={{
                mb: 2,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "background.paper",
                },
              }}
            />
            <TextField
              name="artist"
              label="Artist"
              fullWidth
              variant="outlined"
              size="small"
              value={editedRecord.artist}
              onChange={handleChange}
              disabled={titleArtistLocked}
              helperText={
                titleArtistLocked
                  ? "Can only edit the artist for custom records."
                  : undefined
              }
              sx={{
                mb: 2,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "background.paper",
                },
              }}
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 4 }}>
                <TextField
                  name="release"
                  label="Release Year"
                  type="number"
                  fullWidth
                  variant="outlined"
                  value={editedRecord.release}
                  onChange={handleChange}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "background.paper",
                    },
                  }}
                />
              </Grid>
              <Grid size={{ xs: 8 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    pt: 0.5,
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ whiteSpace: "nowrap", fontWeight: 500 }}
                  >
                    Rating
                  </Typography>
                  <Slider
                    name="rating"
                    value={editedRecord.rating}
                    onChange={handleRatingChange}
                    aria-label="rating"
                    valueLabelDisplay="auto"
                    step={1}
                    min={0}
                    max={10}
                    sx={{ flex: 1, p: "auto", mr: 1 }}
                  />
                </Box>
              </Grid>
            </Grid>
            <Autocomplete
              multiple
              freeSolo // Allows adding new tags not in the options list
              options={tagOptions} // Use provided existing tags for suggestions
              filterSelectedOptions
              value={editedRecord.tags}
              onChange={handleTagsChange}
              size="small"
              fullWidth
              sx={{
                mt: 2,
                // allow chips to wrap so the input height expands when many tags are present
                "& .MuiAutocomplete-inputRoot": {
                  flexWrap: "wrap",
                  gap: "4px",
                  alignItems: "flex-start",
                },
                "& .MuiChip-root": { margin: "0px" },
                // ensure the text input doesn't expand to push chips apart
                "& .MuiAutocomplete-input": { minWidth: 120 },
                // make the Autocomplete input blend with the dialog background
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "background.paper",
                  alignItems: "flex-start",
                  py: 1,
                  minHeight: 40,
                  height: "auto",
                },
              }}
              renderTags={(value: readonly string[], getTagProps) =>
                value.map((option: string, index: number) => {
                  const tagProps = getTagProps({ index });
                  return (
                    <Chip variant="outlined" label={option} {...tagProps} />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  variant="outlined"
                  label="Tags"
                  placeholder="Add tags"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "background.paper",
                    },
                  }}
                />
              )}
            />

            <Box sx={{ mt: 2 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Suggested tags
              </Typography>
              {fetchingRecommendedTags && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.75 }}
                >
                  Fetching suggestions...
                </Typography>
              )}
              {!fetchingRecommendedTags && recommendedTags.length === 0 && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.75 }}
                >
                  We’ll suggest tags automatically once both title and artist
                  are filled.
                </Typography>
              )}
              {recommendedTags.length > 0 && (
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  flexWrap="wrap"
                  sx={{ mt: 1 }}
                >
                  {recommendedTags.map((tag) => {
                    const normalizedTag = tag.trim();
                    const normalizedLower = normalizedTag.toLowerCase();
                    const alreadyAdded = existingTagsLower.has(normalizedLower);
                    return (
                      <Chip
                        key={tag}
                        label={normalizedTag}
                        size="small"
                        variant={alreadyAdded ? "filled" : "outlined"}
                        color={alreadyAdded ? "primary" : "default"}
                        onClick={() => {
                          if (!alreadyAdded) {
                            handleAddRecommendedTag(normalizedTag);
                          }
                        }}
                        disabled={alreadyAdded}
                        sx={{
                          cursor: alreadyAdded ? "default" : "pointer",
                          p: 0.7,
                          py: 1.9,
                        }}
                      />
                    );
                  })}
                </Stack>
              )}
            </Box>

            <TextField
              name="review"
              label="Review"
              placeholder="Write a brief review..."
              fullWidth
              multiline
              size="small"
              maxRows={1}
              value={editedRecord.review ?? ""}
              inputProps={{ maxLength: 4000 }}
              onChange={handleChange}
              sx={{
                mt: 3,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "background.paper",
                },
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ p: 2, bgcolor: "background.paper" }}>
        <Button onClick={onClose} color="inherit" sx={{ fontWeight: 700 }}>
          Cancel
        </Button>
        <Button
          onClick={handleSaveChanges}
          variant="contained"
          color="primary"
          sx={{ fontWeight: 700 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
