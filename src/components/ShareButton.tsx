import { IconButton, Tooltip } from "@mui/material";
import ShareIcon from "@mui/icons-material/Share";
import { useState } from "react";

interface ShareButtonProps {
  url?: string;
  title?: string;
  text?: string;
  size?: "small" | "medium" | "large";
}

export default function ShareButton({
  url,
  title = "Share",
  text = "Check this out!",
  size = "medium",
}: ShareButtonProps) {
  const [tooltipText, setTooltipText] = useState("Share");

  const handleShare = async (event: React.MouseEvent) => {
    event.stopPropagation();

    const shareUrl = url || window.location.href;

    // Check if Web Share API is supported
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: shareUrl,
        });
      } catch (error) {
        // User cancelled or error occurred
        if ((error as Error).name !== "AbortError") {
          console.error("Error sharing:", error);
          // Fall back to copying to clipboard
          copyToClipboard(shareUrl);
        }
      }
    } else {
      // Fall back to copying to clipboard
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setTooltipText("Copied!");
      setTimeout(() => setTooltipText("Share"), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      setTooltipText("Failed to copy");
      setTimeout(() => setTooltipText("Share"), 2000);
    }
  };

  return (
    <Tooltip title={tooltipText}>
      <IconButton onClick={handleShare} size={size}>
        <ShareIcon />
      </IconButton>
    </Tooltip>
  );
}
