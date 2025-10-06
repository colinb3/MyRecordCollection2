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
} from "@mui/material";
import { type Filters } from "../types";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import SettingsIcon from "@mui/icons-material/Settings";

interface FilterSidebarProps {
  tags?: string[];
  // Receive the complete, current filter state from the parent
  currentFilters: Filters;
  onFiltersChange: (filters: Partial<Filters>) => void;
  onResetFilters: () => void;
  onOpenManageTags?: () => void;
  // When true, show a small spinner next to the Tags header
  tagsLoading?: boolean;
}

export default function FilterSidebar({
  tags,
  currentFilters, // Use the new prop
  onFiltersChange,
  onResetFilters,
  onOpenManageTags,
  tagsLoading = false,
}: FilterSidebarProps) {
  // --- All internal state has been removed ---

  // Destructure values from props for easier use
  const { tags: checkedTags = [], rating, release } = currentFilters;

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
        p: 2,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minWidth: 280,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <Box sx={{ overflowY: "auto", pr: 1, flex: 1, minHeight: 0 }}>
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
                  <ListItemText primary={tag} />
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
          <Typography variant="subtitle1" mt={1} mb={1}>
            Filter by Rating
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              label="Min"
              type="number"
              fullWidth
              size="small"
              slotProps={{ input: { inputProps: { min: 0, max: 10 } } }}
              // Read value from props
              value={rating.min}
              onChange={(e) => {
                const val = Number(e.target.value);
                onFiltersChange({ rating: { min: val, max: rating.max } });
              }}
              onFocus={(e) => e.target.select()}
            />
            <TextField
              label="Max"
              type="number"
              fullWidth
              size="small"
              slotProps={{ input: { inputProps: { min: 0, max: 10 } } }}
              // Read value from props
              value={rating.max}
              onChange={(e) => {
                const val = Number(e.target.value);
                onFiltersChange({ rating: { min: rating.min, max: val } });
              }}
              onFocus={(e) => e.target.select()}
            />
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
              slotProps={{ input: { inputProps: { min: 1877, max: 2100 } } }}
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
              slotProps={{ input: { inputProps: { min: 1877, max: 2100 } } }}
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
        sx={{ mt: 2, fontWeight: 700 }}
        onClick={onResetFilters}
        endIcon={<ReplayOutlinedIcon />}
      >
        Reset Filters
      </Button>
    </Paper>
  );
}
