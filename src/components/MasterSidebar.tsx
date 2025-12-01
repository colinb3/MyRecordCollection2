import type { ReactNode } from "react";
import { useState } from "react";
import {
  Paper,
  Typography,
  Box,
  TextField,
  Button,
  Slider,
  CircularProgress,
  Stack,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Tooltip,
  Chip,
  Autocomplete,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SettingsIcon from "@mui/icons-material/Settings";

export interface AlbumListItem {
  id: string;
  cover?: string;
  record: string;
  artist: string;
}

export interface SidebarListOption {
  listId: number;
  name: string;
  isPrivate: boolean;
  listRecordId: number | null;
}

interface MasterSidebarProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onAddNewTag: (tag: string) => void;
  // Wiki-sourced tag suggestions displayed separately
  wikiTags?: string[];
  // Whether wiki suggestions are currently loading
  wikiLoading?: boolean;
  masterLoading?: boolean;
  rating: number;
  onRatingChange: (value: number) => void;
  releaseYear: number;
  onReleaseYearChange: (value: number) => void;
  review: string;
  onReviewChange: (value: string) => void;
  wishlistButton: SidebarActionConfig;
  listenedButton: SidebarActionConfig;
  collectionButton: SidebarActionConfig;
  listOptions: SidebarListOption[];
  onAddToList: (listId: number) => void;
  onManageLists: () => void;
  listActionDisabled?: boolean;
}

interface SidebarActionConfig {
  label: string;
  variant: "contained" | "outlined";
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}

export default function MasterSidebar({
  availableTags,
  selectedTags,
  onToggleTag,
  onAddNewTag,
  wikiTags,
  wikiLoading,
  masterLoading,
  rating,
  onRatingChange,
  releaseYear,
  onReleaseYearChange,
  review,
  onReviewChange,
  wishlistButton,
  listenedButton,
  collectionButton,
  listOptions,
  onAddToList,
  onManageLists,
  listActionDisabled,
}: MasterSidebarProps) {
  const [selectedListId, setSelectedListId] = useState<number | "">("");
  const [tagInputValue, setTagInputValue] = useState("");

  const handleSlider = (_: Event, val: number | number[]) => {
    onRatingChange(val as number);
  };

  // Combine wikiTags and availableTags into grouped options for Autocomplete
  const getGroupedOptions = () => {
    const suggestedTags = (wikiTags ?? []).filter(
      (tag) => !selectedTags.includes(tag)
    );
    const existingTags = availableTags.filter(
      (tag) => !selectedTags.includes(tag) && !(wikiTags ?? []).includes(tag)
    );
    return [
      ...suggestedTags.map((tag) => ({ tag, group: "Suggested" })),
      ...existingTags.map((tag) => ({ tag, group: "Existing" })),
    ];
  };

  const addTag = (tagToAdd: string) => {
    // Truncate to 50 chars
    const truncated = tagToAdd.slice(0, 50);
    if (!truncated) return;

    // Case-insensitive check if already selected
    const alreadySelected = selectedTags.some(
      (t) => t.toLowerCase() === truncated.toLowerCase()
    );
    if (alreadySelected) return;

    // Case-insensitive check if it exists in availableTags
    const existingTag = availableTags.find(
      (t) => t.toLowerCase() === truncated.toLowerCase()
    );
    if (existingTag) {
      // Use the existing tag's casing
      onToggleTag(existingTag);
    } else {
      // Brand new tag - add to list and select
      onAddNewTag(truncated);
    }
  };

  const handleTagSelect = (
    _: unknown,
    value: { tag: string; group: string } | string | null
  ) => {
    if (!value) return;
    const tagToAdd =
      typeof value === "string" ? value.trim() : value.tag.trim();
    addTag(tagToAdd);
    setTagInputValue("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onToggleTag(tagToRemove);
  };

  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          overflowY: "auto",
          overflowX: "hidden",
          flex: 1,
          py: 2,
          px: 2,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{ display: "flex", alignItems: "center" }}
        >
          Tags
          {wikiLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Typography>

        {/* Selected tags as horizontal chips */}
        {selectedTags.length > 0 && (
          <Stack
            direction="row"
            spacing={0.5}
            useFlexGap
            flexWrap="wrap"
            sx={{ mb: 1, mt: 0.5 }}
          >
            {selectedTags.map((tag) => (
              <Chip
                key={tag}
                label={<Typography variant="body2">{tag}</Typography>}
                onDelete={() => handleRemoveTag(tag)}
                sx={{ mb: 0.25 }}
              />
            ))}
          </Stack>
        )}

        {/* Autocomplete for adding tags */}
        <Autocomplete
          freeSolo
          options={getGroupedOptions()}
          groupBy={(option) =>
            typeof option === "string" ? "New" : option.group
          }
          getOptionLabel={(option) =>
            typeof option === "string" ? option : option.tag
          }
          inputValue={tagInputValue}
          onInputChange={(_, newValue) => setTagInputValue(newValue)}
          onChange={handleTagSelect}
          value={null}
          size="small"
          sx={{ mb: 1.5 }}
          slotProps={{
            listbox: {
              sx: {
                bgcolor: "background.paper",
                maxHeight: 275,
                border: "2px solid",
                borderColor: "divider",
                borderRadius: 1.5,
              },
            },
          }}
          renderGroup={(params) => (
            <li key={params.key}>
              <Typography
                variant="caption"
                sx={{
                  px: 2,
                  py: 0.75,
                  display: "block",
                  color: "text.secondary",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {params.group}
              </Typography>
              <ul style={{ padding: 0, margin: 0 }}>{params.children}</ul>
            </li>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={
                selectedTags.length === 0 ? "Add tags..." : "Add more tags..."
              }
              slotProps={{
                htmlInput: {
                  ...params.inputProps,
                  enterKeyHint: "done",
                  autoComplete: "off",
                  maxLength: 50,
                },
              }}
            />
          )}
        />
        <Typography variant="subtitle1">Rating</Typography>
        <Box
          sx={{
            justifySelf: "center",
            width: { xs: "94%", md: "90%" },
            mb: 0.5,
          }}
        >
          <Slider
            value={rating}
            onChange={handleSlider}
            valueLabelDisplay="auto"
            min={0}
            max={10}
            step={1}
            sx={{
              ml: { xs: "3%", md: "5%" },
              "& .MuiSlider-rail, & .MuiSlider-track": { height: 6 },
              height: 0,
              "& .MuiSlider-thumb": {
                width: 18,
                height: 18,
              },
            }}
          />
        </Box>
        <Typography
          variant="subtitle1"
          sx={{ display: "flex", alignItems: "center" }}
        >
          Release
          {masterLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Typography>
        <TextField
          value={releaseYear}
          type="number"
          size="small"
          onChange={(e) => onReleaseYearChange(Number(e.target.value))}
          sx={{ mb: 1.5, width: "50%" }}
          slotProps={{
            input: {
              inputProps: { min: 1901, max: 2100 },
            },
          }}
        />
        <Typography variant="subtitle1">Review (optional)</Typography>
        <TextField
          placeholder="Write a brief review..."
          fullWidth
          multiline
          minRows={2}
          maxRows={4}
          size="small"
          value={review}
          onChange={(event) => onReviewChange(event.target.value)}
          inputProps={{ maxLength: 4000 }}
          sx={{
            mb: 0,
            "& .MuiInputBase-root": {
              height: "auto",
            },
          }}
        />
      </Box>
      <Box sx={{ mx: { xs: 1.3, sm: 1.5, md: 2 }, my: 1 }}>
        <Box sx={{ mb: 1 }}>
          <Stack direction="row" alignItems="center">
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                value={selectedListId}
                onChange={(e) =>
                  setSelectedListId(e.target.value as number | "")
                }
                displayEmpty
                disabled={listActionDisabled || listOptions.length === 0}
              >
                <MenuItem value="" disabled>
                  Select a list...
                </MenuItem>
                {listOptions.map((option) => (
                  <MenuItem key={option.listId} value={option.listId}>
                    {option.name}
                    {option.isPrivate ? " (Private)" : ""}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Add to List">
              <IconButton
                onClick={() => {
                  if (selectedListId !== "") {
                    onAddToList(selectedListId);
                    setSelectedListId("");
                  }
                }}
                disabled={
                  listActionDisabled ||
                  selectedListId === "" ||
                  listOptions.length === 0
                }
                sx={{ minWidth: "auto", ml: 0.5 }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Manage Lists">
              <IconButton onClick={onManageLists} color="primary">
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
        <Stack direction={"row"} spacing={1}>
          <Button
            disabled={wishlistButton.disabled ?? false}
            variant={wishlistButton.variant}
            onClick={wishlistButton.onClick}
            sx={{ fontWeight: 700, flex: 1 }}
            endIcon={wishlistButton.icon}
          >
            {wishlistButton.label}
          </Button>
          <Button
            disabled={listenedButton.disabled ?? false}
            variant={listenedButton.variant}
            onClick={listenedButton.onClick}
            sx={{ fontWeight: 700, flex: 1 }}
            endIcon={listenedButton.icon}
          >
            {listenedButton.label}
          </Button>
        </Stack>
      </Box>
      <Box sx={{ mx: { xs: 1.3, sm: 1.5, md: 2 }, mb: 2 }}>
        <Button
          disabled={collectionButton.disabled ?? false}
          variant={collectionButton.variant}
          fullWidth
          onClick={collectionButton.onClick}
          sx={{ fontWeight: 700 }}
          endIcon={collectionButton.icon}
        >
          {collectionButton.label}
        </Button>
      </Box>
    </Paper>
  );
}
