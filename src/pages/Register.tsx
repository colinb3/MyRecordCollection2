/**
 * @author Colin Brown
 * @description User registration page component for creating new user accounts
 * @fileformat Page component
 */

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
import { useNavigate, Link } from "react-router-dom";
import { darkTheme } from "../theme";
import { loadUserInfo } from "../userInfo";

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [password2Error, setPassword2Error] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [loading, setLoading] = useState(false);

  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  const passwordRegex = /(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Validate username
    let hasError = false;
    if (username.trim().length < 3 || username.trim().length > 30) {
      setUsernameError("Username must be between 3 and 30 characters");
      hasError = true;
    } else if (!usernameRegex.test(username)) {
      setUsernameError(
        "Username may only contain letters, numbers, and underscores",
      );
      hasError = true;
    } else {
      setUsernameError("");
    }

    // Validate email
    if (!email.trim()) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    } else {
      setEmailError("");
    }

    // Validate password
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      hasError = true;
    } else if (!passwordRegex.test(password)) {
      setPasswordError(
        "Password must include a letter, a number, and a special character",
      );
      hasError = true;
    } else {
      setPasswordError("");
    }

    if (password !== password2) {
      setPassword2Error("Passwords do not match");
      hasError = true;
    } else {
      setPassword2Error("");
    }

    if (hasError) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username,
          password,
          email: email.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        try {
          const info = await loadUserInfo(true);
          if (info) {
            const { setUserId } = await import("../analytics");
            setUserId(info.userUuid);
          }
        } catch {
          // ignore analytics failures
        }
        navigate("/mycollection", { state: { showTutorial: true } });
      } else {
        setError(data.error || "Registration failed");
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
                color: "#fff",
                fontWeight: "700",
              }}
            >
              My Record Collection
            </Typography>
          </Link>
        </div>

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
          <Typography variant="h4" fontWeight="bold" gutterBottom>
            Register
          </Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ width: "100%", maxWidth: 360 }}
          >
            <TextField
              label="Username"
              fullWidth
              margin="normal"
              size="small"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                // live-validate
                if (e.target.value.trim().length < 3) {
                  setUsernameError("Username must be at least 3 characters");
                } else if (!usernameRegex.test(e.target.value)) {
                  setUsernameError(
                    "Username may only contain letters, numbers, and underscores",
                  );
                } else {
                  setUsernameError("");
                }
              }}
              error={!!usernameError}
              helperText={usernameError}
              required
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              margin="normal"
              size="small"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError("");
              }}
              onBlur={(e) => {
                if (!e.target.value.trim()) {
                  setEmailError("Email is required");
                } else if (!emailRegex.test(e.target.value)) {
                  setEmailError("Please enter a valid email address");
                }
              }}
              error={!!emailError}
              helperText={emailError}
              required
            />
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              fullWidth
              size="small"
              margin="normal"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (e.target.value.length < 8) {
                  setPasswordError("Password must be at least 8 characters");
                } else if (!passwordRegex.test(e.target.value)) {
                  setPasswordError(
                    "Password must include a letter, a number, and a special character",
                  );
                } else {
                  setPasswordError("");
                }
              }}
              error={!!passwordError}
              helperText={passwordError}
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
            <TextField
              label="Retype Password"
              type={showPassword2 ? "text" : "password"}
              fullWidth
              size="small"
              margin="normal"
              value={password2}
              onChange={(e) => {
                setPassword2(e.target.value);
                if (password !== e.target.value) {
                  setPassword2Error("Passwords do not match");
                } else {
                  setPassword2Error("");
                }
              }}
              error={!!password2Error}
              helperText={password2Error}
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword2((s) => !s)}
                      edge="end"
                    >
                      {showPassword2 ? <VisibilityOff /> : <Visibility />}
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
              {loading ? "Registering..." : "Register"}
            </Button>
          </Box>
          <Button
            variant="text"
            sx={{ mt: 2 }}
            onClick={() => navigate("/login")}
          >
            Already have an account? Login
          </Button>
        </Box>
      </ThemeProvider>
    </>
  );
}
