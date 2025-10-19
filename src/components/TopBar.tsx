import React, { useState } from "react";
import {
  Avatar,
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
import HeadphonesIcon from "@mui/icons-material/Headphones";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import { useNavigate } from "react-router-dom";

interface TopBarProps {
  onLogout?: () => void;
  title: string;
  username?: string;
  displayName?: string;
  profilePicUrl?: string | null;
  /** Optional placeholder override */
  searchPlaceholder?: string;
  /** Controlled search value for pages that manage the query in state */
  searchValue?: string;
  /** Optional callback when the search textbox changes */
  onSearchChange?: (value: string) => void;
  /** Optional callback when user presses enter in the search textbox */
  onSearchSubmit?: (value: string) => void;
}

export default function TopBar({
  onLogout,
  title,
  username,
  displayName,
  profilePicUrl,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  onSearchSubmit,
}: TopBarProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [internalValue, setInternalValue] = useState("");
  const isControlled = typeof searchValue === "string";
  const value = isControlled ? searchValue : internalValue;

  const navigate = useNavigate();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (onSearchSubmit) {
      onSearchSubmit(value);
    } else {
      const trimmed = value.trim();
      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      } else {
        navigate("/search");
      }
    }
    try {
      (e.currentTarget as HTMLInputElement).blur();
    } catch {
      /* ignore */
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    if (onSearchChange) {
      onSearchChange(nextValue);
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
        <TextField
          variant="outlined"
          placeholder={searchPlaceholder || "Search Records or Users"}
          sx={{ width: 300 }}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          type="search"
          inputProps={{ enterKeyHint: "search" }}
        />
        {username && (
          <Box sx={{ mx: -1 }}>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-haspopup="true"
              onMouseEnter={handleMenuOpen} // Open menu on hover
              onClick={handleMenuOpen}
              color="inherit"
            >
              <Avatar
                src={profilePicUrl ?? undefined}
                alt={displayName || username || "Profile"}
                sx={{ width: 40, height: 40, bgcolor: "grey.700" }}
              >
                {!profilePicUrl &&
                  (displayName || username || "").charAt(0).toUpperCase()}
              </Avatar>
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
                  const trimmedUsername = (username || "").trim();
                  if (trimmedUsername) {
                    navigate(
                      `/community/${encodeURIComponent(trimmedUsername)}`
                    );
                  } else {
                    navigate("/activity");
                  }
                  handleMenuClose();
                }}
              >
                <ListItemIcon>
                  <AccountCircle />
                </ListItemIcon>
                <ListItemText>Profile</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  navigate("/activity");
                  handleMenuClose();
                }}
              >
                <ListItemIcon>
                  <PeopleAltIcon />
                </ListItemIcon>
                <ListItemText>Activity</ListItemText>
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem onClick={() => navigate("/mycollection")}>
                <ListItemIcon>
                  <LibraryMusicIcon />
                </ListItemIcon>
                <ListItemText>My Collection</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => navigate("/listened")}>
                <ListItemIcon>
                  <HeadphonesIcon />
                </ListItemIcon>
                <ListItemText>Listened</ListItemText>
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
