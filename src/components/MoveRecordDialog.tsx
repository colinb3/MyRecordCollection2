import { useEffect, useState } from "react";
import apiUrl from "../api";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Box,
  Typography,
} from "@mui/material";

interface MoveRecordDialogProps {
  open: boolean;
  recordId: number | null;
  currentCollection: string | null;
  onClose: () => void;
  onMoved: (targetCollection: string, serverMessage?: string) => void;
}

export default function MoveRecordDialog({
  open,
  recordId,
  currentCollection,
  onClose,
  onMoved,
}: MoveRecordDialogProps) {
  const [collections, setCollections] = useState<string[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [selected, setSelected] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch collections when dialog opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelected("");
    setLoadingCollections(true);
    fetch(apiUrl("/api/collections"), { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load collections");
        const data = await r.json();
        setCollections(Array.isArray(data.collections) ? data.collections : []);
      })
      .catch((e) => setError(e.message || "Failed to load collections"))
      .finally(() => setLoadingCollections(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!recordId || !selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/records/move"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId, targetTableName: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to move record");
      } else {
        onMoved(selected, data.message);
      }
    } catch (e: any) {
      setError(e.message || "Failed to move record");
    } finally {
      setSubmitting(false);
    }
  };

  const availableTargets = collections.filter(
    (c) => !currentCollection || c !== currentCollection
  );

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle sx={{ bgcolor: "background.paper" }}>
        Move Record
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "background.paper" }}>
        {loadingCollections ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : availableTargets.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No other collections available.
          </Typography>
        ) : (
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="move-record-select-label">Destination</InputLabel>
            <Select
              labelId="move-record-select-label"
              label="Destination"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={submitting}
            >
              {availableTargets.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {error && (
          <Typography mt={2} variant="caption" color="error">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ bgcolor: "background.paper" }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ fontWeight: 700 }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || !selected}
          variant="contained"
          sx={{ fontWeight: 700 }}
        >
          {submitting ? "Moving…" : "Move"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
