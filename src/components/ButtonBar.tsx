import { Box, Button } from "@mui/material";
import { useRef, useState, useEffect } from "react";
import type { UIEvent } from "react";
import { useNavigate } from "react-router-dom";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import DeleteIcon from "@mui/icons-material/Delete";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";

interface ButtonBarProps {
  onEditRecord?: () => void;
  onCreateRecord?: () => void;
  onDeleteRecord?: () => void;
  onMoveRecord?: () => void;
  editEnabled?: boolean; // indicates a record is selected
}

export default function ButtonBar({
  onEditRecord,
  onCreateRecord,
  onDeleteRecord,
  onMoveRecord,
  editEnabled,
}: ButtonBarProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const evaluateFades = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 1);
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
          gap: 1,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "thin",
          pt: 0.5,
          pb: 1,
          px: 0.5,
          flexWrap: "nowrap",
          // Ensure child buttons don't shrink and text stays inside
          "& > .action-btn": {
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
        <Button
          variant="contained"
          color="primary"
          size="small"
          className="action-btn"
          startIcon={<ZoomInIcon />}
          onClick={() => navigate("/findrecord")}
        >
          Find New
        </Button>
        <Button
          variant="outlined"
          onClick={onCreateRecord}
          size="small"
          className="action-btn"
          startIcon={<AddIcon />}
        >
          Create
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={onEditRecord}
          disabled={!editEnabled}
          size="small"
          className="action-btn"
          startIcon={<EditIcon />}
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
        >
          Move
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={onDeleteRecord}
          disabled={!editEnabled}
          size="small"
          className="action-btn"
          startIcon={<DeleteIcon />}
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
          transition: "opacity 500ms ease",
          willChange: "opacity",
          background: (theme) =>
            `linear-gradient(to right, ${theme.palette.background.default} 0%, ${theme.palette.background.default}CC 10%, transparent 50%)`,
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
          transition: "opacity 500ms ease",
          willChange: "opacity",
          background: (theme) =>
            `linear-gradient(to left, ${theme.palette.background.default} 0%, ${theme.palette.background.default}CC 10%, transparent 50%)`,
        }}
      />
    </Box>
  );
}
