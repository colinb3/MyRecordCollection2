/**
 * @author Colin Brown
 * @description Dialog component for submitting user reports about content, bugs, or inappropriate behavior
 * @fileformat React Component
 */

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Typography,
} from "@mui/material";
import apiUrl from "../api";
import CheckIcon from "@mui/icons-material/Check";

export type ReportType = "general" | "user" | "record" | "master" | "list";

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  type: ReportType;
  targetId?: number | string; // recordId, masterId, listId, or username
  targetName?: string; // Display name for the target
}

const REPORT_REASONS: Record<ReportType, string[]> = {
  general: ["Bug Report", "Feature Request", "Security Issue", "Other"],
  user: [
    "Inappropriate Content",
    "Harassment",
    "Spam",
    "Impersonation",
    "Other",
  ],
  record: ["Inappropriate Content", "Incorrect Information", "Spam", "Other"],
  master: [
    "Incorrect Information",
    "Wrong Cover Art",
    "Duplicate Entry",
    "Other",
  ],
  list: ["Inappropriate Content", "Spam", "Other"],
};

const TYPE_LABELS: Record<ReportType, string> = {
  general: "General Feedback",
  user: "Report User",
  record: "Report Record",
  master: "Report Master",
  list: "Report List",
};

export default function ReportDialog({
  open,
  onClose,
  type,
  targetId,
  targetName,
}: ReportDialogProps) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reasons = REPORT_REASONS[type] || [];

  const handleClose = () => {
    if (submitting) return;
    setReason("");
    setNotes("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason) {
      setError("Please select a reason");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        type,
        reason,
        notes: notes.trim() || null,
      };

      if (type === "user" && targetId) {
        body.targetUsername = targetId;
      } else if (
        (type === "record" || type === "master" || type === "list") &&
        targetId
      ) {
        body.targetId = targetId;
      }

      const response = await fetch(apiUrl("/api/reports"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to submit report (${response.status})`,
        );
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(3.5px)",
          },
        },
        paper: {
          sx: {
            backgroundColor: "background.default",
            boxShadow: 15,
            maxHeight: "85vh",
            m: 2,
            overflow: "visible",
            borderRadius: 3,
          },
        },
      }}
    >
      <DialogTitle
        sx={{ bgcolor: "background.paper", borderRadius: "8px 8px 0 0" }}
      >
        {TYPE_LABELS[type]}
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: 1,
          bgcolor: "background.paper",
        }}
      >
        {targetName && (
          <Typography variant="body2" color="text.secondary">
            {type === "user"
              ? "User: "
              : type === "record"
                ? "Record: "
                : type === "master"
                  ? "Master: "
                  : type === "list"
                    ? "List: "
                    : ""}
            <strong>{targetName}</strong>
          </Typography>
        )}

        {success ? (
          <Alert icon={<CheckIcon />} severity="success" variant="outlined">
            Thank you for your report. We will review it shortly.
          </Alert>
        ) : (
          <>
            {error && <Alert severity="error">{error}</Alert>}

            <FormControl fullWidth size="small">
              <InputLabel>Reason</InputLabel>
              <Select
                value={reason}
                label="Reason"
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
              >
                {reasons.map((r) => (
                  <MenuItem key={r} value={r}>
                    {r}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Additional Details (optional)"
              multiline
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
              placeholder={
                type === "general"
                  ? "Please describe the issue or suggestion in detail..."
                  : "Please provide any additional context..."
              }
              sx={{
                "& .MuiInputBase-root": {
                  height: "auto",
                },
              }}
              size="small"
            />
          </>
        )}
      </DialogContent>
      <DialogActions
        sx={{ bgcolor: "background.paper", borderRadius: "0 0 8px 8px" }}
      >
        <Button onClick={handleClose} disabled={submitting} variant="outlined">
          {success ? "Close" : "Cancel"}
        </Button>
        {!success && (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            variant="contained"
          >
            {submitting ? <CircularProgress size={20} /> : "Submit Report"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
