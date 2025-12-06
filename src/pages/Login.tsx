import React, { useState } from "react";
import apiUrl from "../api";
import {
  Box,
  Typography,
  Button,
  ThemeProvider,
  CssBaseline,
  TextField,
  Alert,
  InputAdornment,
  IconButton,
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { darkTheme } from "../theme";
import { loadUserInfo } from "../userInfo";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl("/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success) {
        try {
          const info = await loadUserInfo(true);
          if (info) {
            // dynamically import analytics to avoid SSR issues
            const { setUserId } = await import("../analytics");
            setUserId(info.userUuid);
          }
        } catch {
          // ignore analytics errors
        }
        // If a next parameter was provided, go there. Validate it to avoid open redirect.
        try {
          const params = new URLSearchParams(location.search);
          const next = params.get("next");
          if (next) {
            const decoded = decodeURIComponent(next);
            // only allow internal redirects
            if (decoded.startsWith("/")) {
              navigate(decoded);
            } else {
              navigate("/mycollection");
            }
          } else {
            navigate("/mycollection");
          }
        } catch {
          navigate("/mycollection");
        }
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box
          sx={{
            p: 4,
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1400,
              borderBottom: "2px solid #555",
              background: "transparent",
              paddingLeft: 12,
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            <Link to="/" style={{ textDecoration: "none", color: "#fff" }}>
              <Typography
                variant="h5"
                sx={{
                  mb: 0,
                  cursor: "pointer",
                  fontWeight: "700",
                  color: "#fff",
                }}
              >
                My Record Collection
              </Typography>
            </Link>
          </div>
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Login
          </Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ width: "100%", maxWidth: 360 }}
          >
            <TextField
              label="Username or Email"
              fullWidth
              size="small"
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              fullWidth
              size="small"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword((s) => !s)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2 }}
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </Box>
          <Button
            variant="text"
            sx={{ mt: 2 }}
            onClick={() => navigate("/register")}
          >
            Need an account? Register
          </Button>
        </Box>
      </ThemeProvider>
    </>
  );
}
