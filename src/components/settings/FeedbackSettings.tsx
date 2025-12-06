import { useState } from "react";
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import apiUrl from "../../api";

const FEEDBACK_REASONS = [
  "Bug Report",
  "Feature Request",
  "Security Issue",
  "Other",
];

export default function FeedbackSettings() {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      setError("Please select a reason");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "general",
          reason,
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to submit feedback (${response.status})`
        );
      }

      setSuccess(true);
      setReason("");
      setNotes("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit feedback"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSuccess(false);
    setError(null);
    setReason("");
    setNotes("");
  };

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Box>
        <Typography variant="h4" gutterBottom>
          Leave Feedback
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Have a suggestion, found a bug, or want to report a security issue?
          Let us know below.
        </Typography>

        {success ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Alert icon={<CheckIcon />} severity="success" variant="outlined">
              Thank you for your feedback! We will review it shortly.
            </Alert>
            <Button
              variant="outlined"
              onClick={handleReset}
              sx={{ alignSelf: "flex-start" }}
            >
              Submit Another
            </Button>
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {error}
              </Alert>
            )}

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Reason</InputLabel>
              <Select
                value={reason}
                label="Reason"
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
              >
                {FEEDBACK_REASONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Details"
              multiline
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              placeholder="Please describe the issue or suggestion in detail..."
              sx={{
                "& .MuiInputBase-root": {
                  height: "auto",
                },
                mb: 2,
              }}
              size="small"
              fullWidth
            />

            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !reason}
                variant="contained"
              >
                {submitting ? (
                  <CircularProgress size={20} />
                ) : (
                  "Submit Feedback"
                )}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
