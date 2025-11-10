import { useState } from "react";
import { Avatar, Skeleton, Box, type SxProps, type Theme } from "@mui/material";
import ImageNotSupportedIcon from "@mui/icons-material/ImageNotSupported";

interface CoverImageProps {
  src: string | null;
  alt: string;
  sx?: SxProps<Theme>;
  variant?: "circular" | "rounded" | "square";
  iconSize?: "small" | "medium" | "large";
}

export default function CoverImage({
  src,
  alt,
  sx,
  variant = "rounded",
  iconSize = "medium",
}: CoverImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    setLoading(false);
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
  };

  // Show placeholder if no src
  if (!src) {
    return (
      <Avatar
        variant={variant}
        sx={{
          ...sx,
          bgcolor: "action.selected",
        }}
      >
        <ImageNotSupportedIcon
          fontSize={iconSize}
          sx={{ color: "action.disabled" }}
        />
      </Avatar>
    );
  }

  // Show error state
  if (error) {
    return (
      <Avatar
        variant={variant}
        sx={{
          ...sx,
          bgcolor: "action.selected",
        }}
      >
        <ImageNotSupportedIcon
          fontSize={iconSize}
          sx={{ color: "action.disabled" }}
        />
      </Avatar>
    );
  }

  // Show image with skeleton overlay while loading
  return (
    <Box sx={{ position: "relative", display: "inline-block" }}>
      <Avatar
        variant={variant}
        src={src}
        alt={alt}
        sx={{
          ...sx,
          opacity: loading ? 0 : 1,
          transition: "opacity 0.3s ease-in-out",
        }}
        imgProps={{
          onLoad: handleLoad,
          onError: handleError,
        }}
      />
      {loading && (
        <Skeleton
          variant={variant === "square" ? "rounded" : variant}
          animation="pulse"
          sx={{
            ...sx,
            position: "absolute",
            top: 0,
            left: 0,
            bgcolor: "action.hover",
          }}
        />
      )}
    </Box>
  );
}
