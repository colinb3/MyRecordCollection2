import { useMemo } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import placeholderCover from "../assets/missingImg.jpg";
import type { Record } from "../types";
import { useNavigate } from "react-router-dom";
import { Divider } from "@mui/material";
import { formatLocalDate } from "../dateUtils";

interface RecordPreviewGridProps {
  records: Record[];
  keyPrefix?: string;
  showDateAdded?: boolean;
  ownerUsername: string;
  isOwnerViewing?: boolean;
}

export default function RecordPreviewGrid({
  records,
  keyPrefix,
  showDateAdded = false,
  ownerUsername,
  isOwnerViewing = false,
}: RecordPreviewGridProps) {
  const navigate = useNavigate();

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const handleRecordClick = (record: Record) => {
    if (!record || record.id <= 0) {
      return;
    }

    const targetPath = isOwnerViewing
      ? `/record/${record.id}`
      : `/community/${encodeURIComponent(ownerUsername)}/record/${record.id}`;

    navigate(targetPath);
  };

  return (
    <Grid container spacing={{ xs: 1, sm: 2 }}>
      {records.map((record) => {
        const coverSrc = record.cover || placeholderCover;
        const key = keyPrefix ? `${keyPrefix}-${record.id}` : record.id;
        const addedDateText =
          showDateAdded && record.added
            ? formatLocalDate(record.added, dateFormatter) ?? record.added
            : null;
        const hasReview =
          typeof record.review === "string" && record.review.trim();
        const reviewSnippet = hasReview
          ? record.review!.trim().replace(/\s+/g, " ")
          : null;
        const hasRating = record.rating > 0;
        const isClickable = record.id > 0;
        return (
          <Grid size={4} key={key}>
            <Paper
              variant="outlined"
              onClick={() => isClickable && handleRecordClick(record)}
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                cursor: isClickable ? "pointer" : "default",
                transition: "background-color 0.2s ease",
                "&:hover": isClickable
                  ? {
                      backgroundColor: "action.hover",
                    }
                  : {},
              }}
            >
              <Box
                sx={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  backgroundColor: "grey.900",
                }}
              >
                <Box
                  component="img"
                  src={coverSrc}
                  alt={record.record}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Box>
              <Box sx={{ p: { xs: 1, sm: 1.25, md: 1.5 } }}>
                <Typography variant="subtitle1" noWrap>
                  {record.record}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {record.artist}
                </Typography>
                {hasRating && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    pt={0.5}
                  >
                    {record.rating}/10
                  </Typography>
                )}
                {addedDateText && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    pt={0.5}
                  >
                    {addedDateText}
                  </Typography>
                )}
                {reviewSnippet && (
                  <>
                    <Divider sx={{ my: 1.2 }} />
                    <Typography
                      variant="body2"
                      sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        pb: 0,
                      }}
                    >
                      “{reviewSnippet}”
                    </Typography>
                  </>
                )}
              </Box>
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
}
