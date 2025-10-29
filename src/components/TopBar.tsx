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
  Tooltip,
} from "@mui/material";
import AccountCircle from "@mui/icons-material/AccountCircle";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import LogoutIcon from "@mui/icons-material/Logout";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import SettingsIcon from "@mui/icons-material/Settings";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import LoginIcon from "@mui/icons-material/Login";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { useNavigate, useLocation } from "react-router-dom";
import { getCachedUserInfo } from "../userInfo";

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
  /** Explicit admin flag; falls back to cached user info when omitted */
  isAdmin?: boolean;
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
  isAdmin,
}: TopBarProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [internalValue, setInternalValue] = useState("");
  const isControlled = typeof searchValue === "string";
  const value = isControlled ? searchValue : internalValue;

  const navigate = useNavigate();
  const location = useLocation();

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

  const cachedInfo = getCachedUserInfo();
  const canAdmin = Boolean(isAdmin ?? cachedInfo?.isAdmin);

  return (
    <Grid>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          mb: 0.5,
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
          placeholder={searchPlaceholder || "Search..."}
          sx={{
            width: 300,
            ml: 1,
            backgroundColor: "background.paper",
            borderRadius: 1,
          }}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          inputProps={{ enterKeyHint: "search" }}
          slotProps={{
            input: {
              sx: { pr: 1 },
              endAdornment: (
                <Tooltip title="Scan barcode">
                  <IconButton
                    size="small"
                    color="inherit"
                    onClick={() => navigate("/scan")}
                    edge="end"
                  >
                    <QrCodeScannerIcon />
                  </IconButton>
                </Tooltip>
              ),
            },
          }}
        />
        <Box sx={{ mr: -1 }}>
          <IconButton
            size="large"
            aria-label="account menu"
            aria-haspopup="true"
            onMouseEnter={handleMenuOpen}
            onClick={handleMenuOpen}
            color="inherit"
          >
            {username ? (
              <Avatar
                src={profilePicUrl ?? undefined}
                alt={displayName || username || "Profile"}
                sx={{ width: 40, height: 40, bgcolor: "grey.700" }}
              >
                {!profilePicUrl
                  ? (displayName || username || "").charAt(0).toUpperCase()
                  : undefined}
              </Avatar>
            ) : (
              <AccountCircle sx={{ width: 40, height: 40 }} />
            )}
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
            {username ? (
              <>
                <MenuItem
                  disabled
                  sx={{
                    "&.Mui-disabled": {
                      opacity: 0.85,
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
                {canAdmin && (
                  <MenuItem
                    onClick={() => {
                      navigate("/admin");
                      handleMenuClose();
                    }}
                  >
                    <ListItemIcon>
                      <AdminPanelSettingsIcon />
                    </ListItemIcon>
                    <ListItemText>Admin Panel</ListItemText>
                  </MenuItem>
                )}
                {onLogout && (
                  <MenuItem onClick={handleLogoutClick}>
                    <ListItemIcon>
                      <LogoutIcon />
                    </ListItemIcon>
                    <ListItemText>Logout</ListItemText>
                  </MenuItem>
                )}
              </>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    // preserve current location so we can return after sign-in
                    if (location.pathname === "/login") {
                      navigate("/login");
                    } else {
                      const next = encodeURIComponent(
                        `${location.pathname}${location.search || ""}${
                          location.hash || ""
                        }`
                      );
                      navigate(`/login?next=${next}`);
                    }
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon>
                    <LoginIcon />
                  </ListItemIcon>
                  <ListItemText>Sign In</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    navigate("/register");
                    handleMenuClose();
                  }}
                >
                  <ListItemIcon>
                    <PersonAddIcon />
                  </ListItemIcon>
                  <ListItemText>Register</ListItemText>
                </MenuItem>
              </>
            )}
          </Menu>
        </Box>
      </Box>
    </Grid>
  );
}
