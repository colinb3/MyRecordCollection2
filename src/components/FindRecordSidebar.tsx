import {
  Paper,
  Typography,
  Box,
  List,
  ListSubheader,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Checkbox,
  ListItemText,
  TextField,
  Button,
  Slider,
  CircularProgress,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import FavoriteIcon from "@mui/icons-material/Favorite";

export interface AlbumListItem {
  id: string;
  cover?: string;
  record: string;
  artist: string;
}

interface FindRecordSidebarProps {
  availableTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onAddNewTag: (tag: string) => void;
  // Wiki-sourced tag suggestions displayed separately
  wikiTags?: string[];
  // Whether wiki suggestions are currently loading
  wikiLoading?: boolean;
  rating: number;
  onRatingChange: (value: number) => void;
  releaseYear: number;
  onReleaseYearChange: (value: number) => void;
  canAdd: boolean;
  onAddRecord: () => void;
  onWishlistRecord: () => void;
}

export default function FindRecordSidebar({
  availableTags,
  selectedTags,
  onToggleTag,
  onAddNewTag,
  wikiTags,
  wikiLoading,
  rating,
  onRatingChange,
  releaseYear,
  onReleaseYearChange,
  canAdd,
  onAddRecord,
  onWishlistRecord,
}: FindRecordSidebarProps) {
  const handleSlider = (_: Event, val: number | number[]) => {
    onRatingChange(val as number);
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const target = e.target as HTMLInputElement;
      const val = target.value.trim();
      if (val && !availableTags.includes(val)) {
        onAddNewTag(val);
      }
      target.value = "";
      try {
        target.blur();
      } catch {}
    }
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
          Add Tags
          {wikiLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Typography>
        <Box
          sx={{
            flexGrow: 0,
            overflowY: "auto",
            border: "1px solid grey",
            borderRadius: 2,
            minHeight: 200,
            my: 1,
          }}
        >
          <List dense sx={{ p: 0 }} subheader={<li />}>
            {wikiTags && wikiTags.length > 0 && (
              <li>
                <ul style={{ padding: 0, margin: 0 }}>
                  <ListSubheader
                    component="div"
                    sx={{
                      position: "sticky",
                      top: 0,
                      bgcolor: "#2f2f2f",
                      zIndex: 1,
                    }}
                  >
                    Suggested
                  </ListSubheader>
                  {wikiTags.map((tag) => (
                    <ListItem disablePadding key={`wiki-${tag}`}>
                      <ListItemButton
                        dense
                        onClick={() => onToggleTag(tag)}
                        sx={{ py: 0 }}
                      >
                        <ListItemIcon sx={{ minWidth: 35 }}>
                          <Checkbox
                            edge="start"
                            checked={selectedTags.includes(tag)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText primary={tag} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </ul>
              </li>
            )}

            <li>
              <ul style={{ padding: 0, margin: 0 }}>
                <ListSubheader
                  component="div"
                  sx={{
                    position: "sticky",
                    bgcolor: "#2f2f2f",
                    zIndex: 1,
                  }}
                >
                  Existing
                </ListSubheader>
                {availableTags.map((tag) => (
                  <ListItem disablePadding key={tag}>
                    <ListItemButton
                      dense
                      onClick={() => onToggleTag(tag)}
                      sx={{ py: 0 }}
                    >
                      <ListItemIcon sx={{ minWidth: 35 }}>
                        <Checkbox
                          edge="start"
                          checked={selectedTags.includes(tag)}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemText primary={tag} />
                    </ListItemButton>
                  </ListItem>
                ))}
                {availableTags.length === 0 && (
                  <ListItem>
                    <ListItemText primary="No tags yet" />
                  </ListItem>
                )}
              </ul>
            </li>
          </List>
        </Box>

        <TextField
          placeholder="Add New Tag"
          size="small"
          onKeyDown={handleAddTag}
          sx={{ mb: 2 }}
          inputProps={{ enterKeyHint: "done", autoComplete: "off" }}
        />
        <Typography variant="subtitle1">Rating</Typography>
        <Box sx={{ justifySelf: "center", width: { xs: "94%", md: "90%" } }}>
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
          sx={{ display: "flex", alignItems: "center", mt: 1 }}
        >
          Release
          {wikiLoading && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Typography>
        <TextField
          value={releaseYear}
          type="number"
          size="small"
          onChange={(e) => onReleaseYearChange(Number(e.target.value))}
          sx={{ mb: 1, width: "50%" }}
          slotProps={{ input: { inputProps: { min: 1877, max: 2100 } } }}
        />
      </Box>
      <Box sx={{ mx: { xs: 1.3, sm: 1.5, md: 2 }, mb: 1 }}>
        <Button
          disabled={!canAdd}
          variant="outlined"
          fullWidth
          onClick={onWishlistRecord}
          sx={{ fontWeight: 700 }}
          endIcon={<FavoriteIcon />}
        >
          Add to Wishlist
        </Button>
      </Box>
      <Box sx={{ mx: { xs: 1.3, sm: 1.5, md: 2 }, mb: 2 }}>
        <Button
          disabled={!canAdd}
          variant="contained"
          fullWidth
          onClick={onAddRecord}
          sx={{ fontWeight: 700 }}
          endIcon={<AddIcon />}
        >
          Add to Collection
        </Button>
      </Box>
    </Paper>
  );
}
