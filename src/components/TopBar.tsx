import React, { useState } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Grid,
} from "@mui/material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import LogoutIcon from "@mui/icons-material/Logout";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import SettingsIcon from "@mui/icons-material/Settings";
import { useNavigate } from "react-router-dom";

interface TopBarProps {
  onSearchChange?: (value: string) => void;
  onLogout?: () => void;
  title: string;
  username?: string;
  displayName?: string;
  /** When set to 'submit', only fire onSearchChange when user presses Enter */
  searchMode?: "change" | "submit";
  /** Optional placeholder override */
  searchPlaceholder?: string;
  searchBar?: boolean;
}

export default function TopBar({
  onSearchChange = () => {},
  onLogout,
  title,
  username,
  displayName,
  searchMode = "change",
  searchPlaceholder,
  searchBar = true,
}: TopBarProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [text, setText] = useState("");

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const v = event.target.value;
    setText(v);
    if (searchMode === "change") {
      onSearchChange(v);
    }
  };

  const navigate = useNavigate();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (searchMode === "submit" && e.key === "Enter") {
      e.preventDefault();
      onSearchChange(text.trim());
      // On mobile the keyboard's 'Next' can move focus to the next input.
      // Blur the input after handling Enter so the keyboard hides and focus doesn't jump.
      try {
        (e.currentTarget as HTMLInputElement).blur();
      } catch {
        /* ignore */
      }
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogoutClick = () => {
    if (onLogout) {
      onLogout();
    }
    handleMenuClose();
  };

  return (
    <Grid>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 0.5,
          gap: 1,
          mt: -0.5,
        }}
      >
        <Typography
          variant="h4"
          sx={{
            mr: "auto",
            fontWeight: "bold",
            whiteSpace: "nowrap", // Prevents text from wrapping
          }}
        >
          {title}
        </Typography>
        {searchBar && (
          <TextField
            variant="outlined"
            placeholder={searchPlaceholder || "Search My Collection"}
            sx={{ width: 300 }}
            value={text}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            type="search"
            inputProps={{ enterKeyHint: "search" }}
          />
        )}
        {username && (
          <Box sx={{ mx: -1 }}>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-haspopup="true"
              onMouseEnter={handleMenuOpen} // Open menu on hover
              color="inherit"
            >
              <AccountCircle fontSize="large" />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              anchorOrigin={{
                vertical: "bottom",
                horizontal: "right",
              }}
              transformOrigin={{
                vertical: "top",
                horizontal: "right",
              }}
              open={open}
              onClose={handleMenuClose}
              slotProps={{
                paper: { onMouseLeave: handleMenuClose },
              }}
            >
              <MenuItem
                disabled
                sx={{
                  // Target the disabled state and increase its opacity
                  "&.Mui-disabled": {
                    opacity: 0.85, // The default is around 0.38
                  },
                }}
              >
                Hello, {displayName || username}
              </MenuItem>
              <MenuItem
                onClick={() => {
                  navigate("/profile");
                  handleMenuClose();
                }}
              >
                <ListItemIcon>
                  <AccountCircle />
                </ListItemIcon>
                <ListItemText>Profile</ListItemText>
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => navigate("/mycollection")}>
                <ListItemIcon>
                  <LibraryMusicIcon />
                </ListItemIcon>
                <ListItemText>My Collection</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => navigate("/wishlist")}>
                <ListItemIcon>
                  <FavoriteIcon />
                </ListItemIcon>
                <ListItemText>Wishlist</ListItemText>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => {
                  navigate("/settings");
                  handleMenuClose();
                }}
              >
                <ListItemIcon>
                  <SettingsIcon />
                </ListItemIcon>
                <ListItemText>Settings</ListItemText>
              </MenuItem>
              {onLogout && (
                <MenuItem onClick={handleLogoutClick}>
                  <ListItemIcon>
                    <LogoutIcon />
                  </ListItemIcon>
                  <ListItemText>Logout</ListItemText>
                </MenuItem>
              )}
            </Menu>
          </Box>
        )}
      </Box>
    </Grid>
  );
}
