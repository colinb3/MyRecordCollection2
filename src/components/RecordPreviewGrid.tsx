import { useMemo } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import placeholderCover from "../assets/missingImg.jpg";
import type { Record } from "../types";
import { useNavigate, useLocation } from "react-router-dom";

interface RecordPreviewGridProps {
  records: Record[];
  keyPrefix?: string;
  showDateAdded?: boolean;
  fromTitle?: string;
}

export default function RecordPreviewGrid({
  records,
  keyPrefix,
  showDateAdded = false,
  fromTitle,
}: RecordPreviewGridProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  const handleRecordClick = (record: Record) => {
    if (!record.masterId) {
      return;
    }

    const albumPayload = {
      id: `preview-${record.id}`,
      record: record.record,
      artist: record.artist,
      cover: record.cover ?? "",
    };

    const originPath = `${location.pathname}${location.search}${location.hash}`;

    navigate(`/record?q=${record.masterId}`, {
      state: {
        album: albumPayload,
        masterId: record.masterId,
        query: record.record,
        fromCollection: {
          path: originPath,
          title: fromTitle || "Profile",
          tableName: undefined,
        },
      },
    });
  };

  return (
    <Grid container spacing={{ xs: 1, sm: 2 }}>
      {records.map((record) => {
        const coverSrc = record.cover || placeholderCover;
        const key = keyPrefix ? `${keyPrefix}-${record.id}` : record.id;
        const addedDateText =
          showDateAdded && record.added
            ? dateFormatter.format(new Date(record.added))
            : null;
        const isClickable = Boolean(record.masterId);
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
                <Typography
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  pb={1}
                >
                  {record.artist}
                </Typography>
                {addedDateText && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {addedDateText}
                  </Typography>
                )}
              </Box>
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
}
