import { useMemo } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import placeholderCover from "../assets/missingImg.jpg";
import type { Record } from "../types";

interface RecordPreviewGridProps {
  records: Record[];
  keyPrefix?: string;
  showDateAdded?: boolean;
}

export default function RecordPreviewGrid({
  records,
  keyPrefix,
  showDateAdded = false,
}: RecordPreviewGridProps) {
  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <Grid container spacing={2} maxWidth={800}>
      {records.map((record) => {
        const coverSrc = record.cover || placeholderCover;
        const key = keyPrefix ? `${keyPrefix}-${record.id}` : record.id;
        const addedDateText =
          showDateAdded && record.added
            ? dateFormatter.format(new Date(record.added))
            : null;
        return (
          <Grid size={{ xs: 6, sm: 3 }} key={key}>
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                height: "100%",
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
              <Box sx={{ p: 1.5 }}>
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
