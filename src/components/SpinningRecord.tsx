import { Box } from "@mui/material";
import customVinyl from "../assets/customVinyl.png";

interface SpinningRecordProps {
  coverUrl: string | null;
  size?: number;
}

export default function SpinningRecord({
  coverUrl,
  size = 120,
}: SpinningRecordProps) {
  return (
    <Box
      sx={{
        position: "relative",
        width: { xs: size * 0.8, sm: size },
        height: { xs: size * 0.8, sm: size },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Album cover - half size and behind the vinyl */}
      {coverUrl && (
        <Box
          component="img"
          src={coverUrl}
          alt="Album cover"
          sx={{
            position: "absolute",
            width: { xs: size * 0.4, sm: size / 2 },
            height: { xs: size * 0.4, sm: size / 2 },
            borderRadius: "50%",
            objectFit: "cover",
            zIndex: 1,
            animation: "spin 4s linear infinite",
            "@keyframes spin": {
              from: {
                transform: "rotate(0deg)",
              },
              to: {
                transform: "rotate(360deg)",
              },
            },
          }}
        />
      )}

      {/* Vinyl overlay */}
      <Box
        component="img"
        src={customVinyl}
        alt="Vinyl record"
        sx={{
          position: "absolute",
          width: { xs: size * 0.8, sm: size },
          height: { xs: size * 0.8, sm: size },
          zIndex: 2,
          animation: "spin 3s linear infinite",
          "@keyframes spin": {
            from: {
              transform: "rotate(0deg)",
            },
            to: {
              transform: "rotate(360deg)",
            },
          },
        }}
      />
    </Box>
  );
}
