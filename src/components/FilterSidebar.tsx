import {
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemButton,
  Checkbox,
  ListItemIcon,
  ListItemText,
  TextField,
  Button,
  CircularProgress,
  Slider,
  IconButton,
} from "@mui/material";
import { type Filters } from "../types";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";

const MIN_RELEASE_YEAR = 1901;
const MAX_RELEASE_YEAR = 2100;

interface FilterSidebarProps {
  tags?: string[];
  // Receive the complete, current filter state from the parent
  currentFilters: Filters;
  onFiltersChange: (filters: Partial<Filters>) => void;
  onResetFilters: () => void;
  onOpenManageTags?: () => void;
  // When true, show a small spinner next to the Tags header
  tagsLoading?: boolean;
  // The records currently displayed in the table - used to compute tag counts
  displayedRecords?: Array<{ tags: string[] }>;
  isLargeScreen?: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export default function FilterSidebar({
  tags,
  currentFilters, // Use the new prop
  onFiltersChange,
  onResetFilters,
  onOpenManageTags,
  tagsLoading = false,
  displayedRecords = [],
  isLargeScreen,
  setSidebarOpen,
}: FilterSidebarProps) {
  // --- All internal state has been removed ---

  // Destructure values from props for easier use
  const { tags: checkedTags = [], rating, release } = currentFilters;
  const ratingMin = Number.isFinite(rating?.min) ? rating!.min : 0;
  const ratingMax = Number.isFinite(rating?.max) ? rating!.max : 10;

  const handleTagToggle = (tag: string) => {
    const newChecked = checkedTags.includes(tag)
      ? checkedTags.filter((t) => t !== tag)
      : [...checkedTags, tag];
    // No longer setting local state, just call the parent's callback
    onFiltersChange({ tags: newChecked });
  };

  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minWidth: 280,
        borderRadius: { xs: 0, lg: 2 },
        overflow: "hidden",
        backgroundColor: "background.default",
      }}
    >
      <Box
        sx={{
          overflowY: "auto",
          overflowX: "hidden",
          p: 2,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Typography
          variant="subtitle1"
          component="div"
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          Filter by Tags
          {tagsLoading && <CircularProgress size={20} />}
        </Typography>
        <Box
          sx={{
            flexGrow: 1,
            minHeight: 150,
            maxHeight: 300,
            overflowY: "auto",
            border: "1px solid grey",
            borderRadius: 1,
            my: 1,
          }}
        >
          <List dense>
            {(tags ?? []).map((tag: string) => (
              <ListItem disablePadding key={tag}>
                <ListItemButton
                  dense
                  onClick={() => handleTagToggle(tag)}
                  sx={{ py: 0 }}
                >
                  <ListItemIcon sx={{ minWidth: 35 }}>
                    <Checkbox
                      edge="start"
                      // Read checked state from props
                      checked={checkedTags.includes(tag)}
                      tabIndex={-1}
                      disableRipple
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={`${tag} (${
                      displayedRecords.filter((r) => r.tags.includes(tag))
                        .length
                    })`}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {!tagsLoading && (tags ?? []).length === 0 && (
              <ListItem>
                <ListItemText primary="No tags yet" />
              </ListItem>
            )}
          </List>
        </Box>
        {onOpenManageTags && (
          <Button
            variant="outlined"
            size="small"
            sx={{ fontWeight: 700, mt: 0.5, alignSelf: "flex-start" }}
            onClick={onOpenManageTags}
            startIcon={<SettingsIcon />}
          >
            Manage Tags
          </Button>
        )}

        <Box sx={{ flex: "0 0 auto" }}>
          <Typography variant="subtitle1" mt={1}>
            Filter by Rating
          </Typography>
          <Box sx={{ px: 0, width: "90%", justifySelf: "center" }}>
            <Slider
              value={[ratingMin, ratingMax]}
              min={0}
              max={10}
              step={1}
              valueLabelDisplay="auto"
              onChange={(_, newValue) => {
                if (!Array.isArray(newValue)) return;
                const [minVal, maxVal] = newValue.map((v) => Number(v));
                onFiltersChange({ rating: { min: minVal, max: maxVal } });
              }}
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mt: -1,
              }}
            >
              <Typography variant="caption">{ratingMin}</Typography>
              <Typography variant="caption">{ratingMax}</Typography>
            </Box>
          </Box>

          <Typography variant="subtitle1" mt={1} mb={1}>
            Filter by Release
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="Min"
              type="number"
              fullWidth
              size="small"
              slotProps={{
                input: {
                  inputProps: { min: MIN_RELEASE_YEAR, max: MAX_RELEASE_YEAR },
                },
              }}
              // Read value from props
              value={release.min}
              onChange={(e) => {
                const val = Number(e.target.value);
                onFiltersChange({ release: { min: val, max: release.max } });
              }}
              onFocus={(e) => e.target.select()}
            />
            <TextField
              label="Max"
              type="number"
              fullWidth
              size="small"
              slotProps={{
                input: {
                  inputProps: { min: MIN_RELEASE_YEAR, max: MAX_RELEASE_YEAR },
                },
              }}
              // Read value from props
              value={release.max}
              onChange={(e) => {
                const val = Number(e.target.value);
                onFiltersChange({ release: { min: release.min, max: val } });
              }}
              onFocus={(e) => e.target.select()}
            />
          </Box>
        </Box>
      </Box>
      <Button
        variant="contained"
        sx={{ mx: 2, mt: 1.5, mb: { xs: 1, lg: 2 }, fontWeight: 700 }}
        onClick={onResetFilters}
        endIcon={<ReplayOutlinedIcon />}
      >
        Reset Filters
      </Button>
      {!isLargeScreen && (
        <Box sx={{ textAlign: "right", pr: 2, pb: 1 }}>
          <IconButton onClick={() => setSidebarOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
      )}
    </Paper>
  );
}
