import { Box, Button, TextField, Tooltip } from "@mui/material";
import { useRef, useState, useEffect } from "react";
import type { UIEvent } from "react";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import LaunchIcon from "@mui/icons-material/Launch";

interface ButtonBarProps {
  onSearchChange?: (value: string) => void;
  onEditRecord?: () => void;
  onCreateRecord?: () => void;
  onDeleteRecord?: () => void;
  onMoveRecord?: () => void;
  onViewMaster?: () => void;
  editEnabled?: boolean; // indicates a record is selected
  viewMasterEnabled?: boolean;
  collectionTitle?: string; // title of the current collection
}

export default function ButtonBar({
  onSearchChange = () => {},
  onEditRecord,
  onCreateRecord,
  onDeleteRecord,
  onMoveRecord,
  onViewMaster,
  editEnabled,
  viewMasterEnabled,
  collectionTitle,
}: ButtonBarProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [text, setText] = useState("");

  const evaluateFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const v = event.target.value;
    setText(v);
    onSearchChange(v);
  };

  useEffect(() => {
    evaluateFades();
    const handleResize = () => evaluateFades();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const onScroll = (_e: UIEvent) => {
    evaluateFades();
  };
  return (
    <Box
      sx={{
        position: "relative",
      }}
    >
      <Box
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        role="group"
        aria-label="Record actions"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.7,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "thin",
          pt: 0.5,
          pb: 1,
          px: 0.5,
          flexWrap: "nowrap",
          // Ensure action buttons retain sizing even when wrapped
          "& .action-btn": {
            flexShrink: 0,
            whiteSpace: "nowrap",
            textOverflow: "clip",
            overflow: "hidden",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1.5,
            fontWeight: 700,
            fontSize: "0.875rem",
            letterSpacing: 0.2,
          },
          maskImage: showLeftFade || showRightFade ? undefined : "none",
          "&::-webkit-scrollbar": { height: 6 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": {
            background: (theme) => theme.palette.action.hover,
            borderRadius: 3,
          },
        }}
      >
        <TextField
          variant="outlined"
          placeholder={`Search ${collectionTitle}`}
          sx={{ minWidth: 200, width: 300 }}
          value={text}
          onChange={handleSearchChange}
          type="search"
        />
        <Button
          variant="outlined"
          onClick={onCreateRecord}
          size="small"
          className="action-btn"
          startIcon={<AddIcon />}
          sx={{ height: 40 }}
        >
          Custom
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={onEditRecord}
          disabled={!editEnabled}
          size="small"
          className="action-btn"
          startIcon={<EditIcon />}
          sx={{ height: 40 }}
        >
          Edit
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={onMoveRecord}
          disabled={!editEnabled}
          size="small"
          className="action-btn"
          startIcon={<DriveFileMoveIcon />}
          sx={{ height: 40 }}
        >
          Move
        </Button>
        {viewMasterEnabled ? (
          <Button
            variant="outlined"
            color="primary"
            onClick={onViewMaster}
            size="small"
            className="action-btn"
            startIcon={<LaunchIcon />}
            sx={{ height: 40 }}
          >
            View
          </Button>
        ) : (
          <Tooltip title="This record does not have an associated master">
            <span style={{ display: "inline-flex" }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={onViewMaster}
                disabled
                size="small"
                className="action-btn"
                startIcon={<LaunchIcon />}
                sx={{ height: 40 }}
              >
                View
              </Button>
            </span>
          </Tooltip>
        )}
        <Button
          variant="outlined"
          color="error"
          onClick={onDeleteRecord}
          disabled={!editEnabled}
          size="small"
          className="action-btn"
          startIcon={<DeleteIcon />}
          sx={{ height: 40 }}
        >
          Delete
        </Button>
      </Box>
      {/* Left fade (animated) */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          left: 0,
          width: 32,
          bottom: 0,
          opacity: showLeftFade ? 1 : 0,
          transition: "opacity 300ms ease",
          willChange: "opacity",
          background: (theme) =>
            `linear-gradient(to right, ${theme.palette.background.default} 0%, ${theme.palette.background.default}CC 7%, transparent 30%)`,
        }}
      />
      {/* Right fade (animated) */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          right: 0,
          width: 32,
          bottom: 0,
          opacity: showRightFade ? 1 : 0,
          transition: "opacity 300ms ease",
          willChange: "opacity",
          background: (theme) =>
            `linear-gradient(to left, ${theme.palette.background.default} 0%, ${theme.palette.background.default}CC 7%, transparent 30%)`,
        }}
      />
    </Box>
  );
}
