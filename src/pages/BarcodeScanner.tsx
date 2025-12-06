import { useCallback, useEffect, useRef, useState } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Stack,
  CircularProgress,
  TextField,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import TopBar from "../components/TopBar";
import { darkTheme } from "../theme";
import apiUrl from "../api";
import { getCachedUserInfo, loadUserInfo } from "../userInfo";
import { performLogout } from "../logout";

interface BarcodeSearchResponse {
  status?: string;
  masterId?: string | null;
  artist?: string | null;
  record?: string | null;
  cover?: string | null;
  releaseYear?: number | null;
  error?: string;
}

type ScannerStatus =
  | "initial"
  | "scanning"
  | "processing"
  | "error"
  | "unsupported";

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
];

const ZXING_TRANSIENT_ERRORS = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

type ZXingControls = { stop?: () => void };

const SCANNER_ORIGIN_QUERY = "origin=scanner";

export default function BarcodeScanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const cachedUser = getCachedUserInfo();
  const [username, setUsername] = useState<string>(cachedUser?.username ?? "");
  const [displayName, setDisplayName] = useState<string>(
    cachedUser?.displayName ?? ""
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(
    cachedUser?.profilePicUrl ?? null
  );
  const [userLoading, setUserLoading] = useState(!cachedUser);
  const [status, setStatus] = useState<ScannerStatus>("initial");
  const [message, setMessage] = useState<string | null>(null);
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const fallbackControlsRef = useRef<ZXingControls | null>(null);
  const scanningActiveRef = useRef(false);
  const detectionTimerRef = useRef<number | null>(null);

  const handleLogout = useCallback(async () => {
    await performLogout(navigate);
  }, [navigate]);

  const stopScanner = useCallback(() => {
    scanningActiveRef.current = false;
    if (detectionTimerRef.current !== null) {
      window.clearTimeout(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (fallbackControlsRef.current) {
      try {
        fallbackControlsRef.current?.stop?.();
      } catch (error) {
        console.warn("Failed to stop fallback barcode controls", error);
      }
      fallbackControlsRef.current = null;
    }
  }, []);

  const processBarcode = useCallback(
    async (rawCode: string, isManual = false) => {
      const code = rawCode.trim();
      if (!code) {
        setStatus("error");
        setMessage("No barcode detected");
        return;
      }

      if (isManual) {
        setDetectedBarcode(null);
      } else {
        setDetectedBarcode(code);
      }
      setStatus("processing");
      setMessage(null);

      try {
        const response = await fetch(apiUrl("/api/barcode_search"), {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ barcode: code }),
        });

        if (response.status === 401) {
          if (location.pathname !== "/login") {
            const next = encodeURIComponent(
              `${location.pathname}${location.search || ""}${
                location.hash || ""
              }`
            );
            navigate(`/login?next=${next}`, { replace: true });
          }
          return;
        }

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };

          // Handle 404 - no results found
          if (response.status === 404) {
            setStatus("error");
            setMessage(`No results found for barcode: ${code}`);
            setDetectedBarcode(null);
            return;
          }

          const errorMessage = payload?.error
            ? String(payload.error)
            : `Failed to search barcode (${response.status})`;
          setStatus("error");
          setMessage(errorMessage);
          return;
        }

        const data = (await response.json()) as BarcodeSearchResponse;

        if (data?.status === "existing" && data.masterId) {
          navigate(
            {
              pathname: `/master/${data.masterId}`,
              search: `?${SCANNER_ORIGIN_QUERY}`,
            },
            {
              state: { fromScanner: true },
            }
          );
          return;
        }

        const artist = typeof data?.artist === "string" ? data.artist : null;
        const record = typeof data?.record === "string" ? data.record : null;
        const cover = typeof data?.cover === "string" ? data.cover : null;
        // masterId can be numeric string or 'r' prefixed string
        const masterId =
          typeof data?.masterId === "string" && data.masterId.trim()
            ? data.masterId.trim()
            : typeof data?.masterId === "number" && data.masterId > 0
            ? String(data.masterId)
            : undefined;
        const releaseYear =
          typeof data?.releaseYear === "number" &&
          Number.isInteger(data.releaseYear)
            ? data.releaseYear
            : undefined;

        navigate(
          {
            pathname: "/master",
            search: `?${SCANNER_ORIGIN_QUERY}`,
          },
          {
            state: {
              album: {
                id: `barcode-${Date.now()}`,
                artist: artist ?? "Unknown Artist",
                record: record ?? "Unknown Record",
                cover: cover ?? "",
              },
              masterId,
              suggestedReleaseYear: releaseYear,
              fromScanner: true,
            },
          }
        );
        return;
      } catch (error) {
        console.error("Barcode search failed", error);
        setStatus("error");
        setMessage("Failed to look up barcode. Please try again.");
      }
    },
    [navigate]
  );

  const handleDetected = useCallback(
    (rawValue: string | undefined) => {
      if (!rawValue || !scanningActiveRef.current) {
        return;
      }
      scanningActiveRef.current = false;
      stopScanner();
      void processBarcode(rawValue);
    },
    [processBarcode, stopScanner]
  );

  const scheduleDetect = useCallback(() => {
    if (!scanningActiveRef.current) return;

    detectionTimerRef.current = window.setTimeout(async () => {
      if (!scanningActiveRef.current) return;

      const detector = detectorRef.current;
      const video = videoRef.current;

      if (!detector || !video) {
        scheduleDetect();
        return;
      }

      if (video.readyState < 2) {
        scheduleDetect();
        return;
      }

      try {
        const results = await detector.detect(video);
        if (Array.isArray(results) && results.length > 0) {
          const raw = results[0]?.rawValue;
          if (raw) {
            handleDetected(String(raw));
            return;
          }
        }
      } catch (error) {
        console.warn("Barcode detection failed", error);
      }

      scheduleDetect();
    }, 300);
  }, [handleDetected]);

  const startFallbackScanner = useCallback(async () => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return false;
    }

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");

      const reader = new BrowserMultiFormatReader();
      fallbackControlsRef.current = null;

      setStatus("scanning");
      setMessage(null);

      reader
        .decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
            },
          },
          videoElement,
          (result, error, controls) => {
            if (controls) {
              fallbackControlsRef.current = controls;
            }

            if (!scanningActiveRef.current) {
              controls?.stop?.();
              return;
            }

            if (result && typeof result.getText === "function") {
              const text = result.getText();
              if (text) {
                setManualBarcode(text);
                controls?.stop?.();
                handleDetected(text);
                return;
              }
            }

            if (
              error instanceof Error &&
              !ZXING_TRANSIENT_ERRORS.has(error.name)
            ) {
              console.warn("Fallback barcode detection error", error);
            }
          }
        )
        .then((controls) => {
          if (controls) {
            fallbackControlsRef.current = controls;
          }
          const stream = videoElement.srcObject;
          if (stream instanceof MediaStream) {
            streamRef.current = stream;
          }
        })
        .catch((error) => {
          console.warn("Fallback barcode decode failed", error);
          stopScanner();
          setStatus("error");
          setMessage(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access to scan barcodes."
              : "Unable to access the camera for scanning."
          );
        });

      return true;
    } catch (error) {
      console.warn("Failed to start fallback barcode scanner", error);
      fallbackControlsRef.current = null;
      return false;
    }
  }, [handleDetected, stopScanner]);

  const startScanner = useCallback(async () => {
    stopScanner();

    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setStatus("error");
      setMessage("Camera access is not available in this environment.");
      return;
    }

    scanningActiveRef.current = true;

    const detectorCtor = (
      window as unknown as {
        BarcodeDetector?: BarcodeDetectorCtor;
      }
    ).BarcodeDetector;

    if (!detectorCtor) {
      const fallbackStarted = await startFallbackScanner();
      if (!fallbackStarted) {
        scanningActiveRef.current = false;
        setStatus("unsupported");
        setMessage(
          "Barcode scanning is not supported on this device. Enter the barcode manually below."
        );
      }
      return;
    }

    try {
      let formats = SCAN_FORMATS;
      if (typeof detectorCtor.getSupportedFormats === "function") {
        try {
          const supported = await detectorCtor.getSupportedFormats();
          const usable = supported.filter((format: string) =>
            SCAN_FORMATS.includes(format)
          );
          if (usable.length > 0) {
            formats = usable;
          }
        } catch (error) {
          console.warn("Failed to obtain supported barcode formats", error);
        }
      }

      detectorRef.current = new detectorCtor({ formats });
    } catch (error) {
      console.warn("Failed to initialize BarcodeDetector", error);
      const fallbackStarted = await startFallbackScanner();
      if (!fallbackStarted) {
        scanningActiveRef.current = false;
        setStatus("unsupported");
        setMessage(
          "Unable to initialize barcode scanning. Enter the barcode manually below."
        );
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;
      setStatus("scanning");
      setMessage(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (error) {
          console.warn("Video playback failed", error);
        }
      }

      scheduleDetect();
    } catch (error) {
      console.warn("Camera access failed", error);
      const fallbackStarted = await startFallbackScanner();
      if (!fallbackStarted) {
        scanningActiveRef.current = false;
        setStatus("error");
        setMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access to scan barcodes."
            : "Unable to access the camera."
        );
      }
    }
  }, [scheduleDetect, startFallbackScanner, stopScanner]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const info = await loadUserInfo();
      if (!isMounted) return;
      setUserLoading(false);
      if (info) {
        setUsername(info.username);
        setDisplayName(info.displayName ?? "");
        setProfilePicUrl(info.profilePicUrl ?? null);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    scanningActiveRef.current = true;
    void startScanner();
    return () => {
      scanningActiveRef.current = false;
      stopScanner();
    };
  }, [startScanner, stopScanner]);

  const handleRestart = useCallback(() => {
    setMessage(null);
    setDetectedBarcode(null);
    setStatus("initial");
    scanningActiveRef.current = true;
    stopScanner();
    void startScanner();
  }, [startScanner, stopScanner]);

  const handleManualSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = manualBarcode.trim();
      if (!trimmed) {
        setMessage("Enter a barcode to search");
        setStatus("error");
        return;
      }
      stopScanner();
      scanningActiveRef.current = false;
      await processBarcode(trimmed, true);
    },
    [manualBarcode, processBarcode, stopScanner]
  );

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          p: { md: 1.5, xs: 1 },
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
        }}
      >
        <Box>
          <TopBar
            title="Scan Barcode"
            username={username}
            displayName={displayName}
            profilePicUrl={profilePicUrl}
            onLogout={handleLogout}
            loading={userLoading}
          />
        </Box>
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            pb: 3,
            px: { xs: 1, md: 2 },
            mt: 1,
          }}
        >
          <Box
            sx={{
              maxWidth: 860,
              mx: "auto",
            }}
          >
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2,
                display: "flex",
                flexDirection: "column",
                minHeight: { xs: "auto", md: 520 },
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  px: { xs: 2.5, md: 3 },
                  py: { xs: 2.5, md: 3 },
                }}
              >
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Scan a record barcode
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "text.secondary", mt: 0.5 }}
                    >
                      Align the barcode within the frame to find it's master
                      entry.
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      position: "relative",
                      borderRadius: 2,
                      overflow: "hidden",
                      bgcolor: "grey.900",
                      minHeight: 320,
                    }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center center",
                        position: "absolute",
                        top: "0%",
                      }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 16,
                        borderRadius: 2,
                        border: "3px solid rgba(255,255,255,0.35)",
                        pointerEvents: "none",
                      }}
                    />
                    {status === "processing" && (
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          bgcolor: "rgba(0,0,0,0.6)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 1,
                        }}
                      >
                        <CircularProgress size={36} />
                        <Typography variant="body2">
                          Looking up barcode…
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {detectedBarcode && (
                    <Alert severity="info">
                      Detected barcode: <strong>{detectedBarcode}</strong>
                    </Alert>
                  )}

                  {message && (
                    <Alert severity={status === "error" ? "error" : "warning"}>
                      {message}
                    </Alert>
                  )}

                  {(status === "error" || status === "unsupported") && (
                    <Button
                      variant="outlined"
                      onClick={handleRestart}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Try again
                    </Button>
                  )}

                  <Box
                    component="form"
                    onSubmit={handleManualSubmit}
                    sx={{ mt: 1 }}
                  >
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      Enter barcode manually
                    </Typography>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <TextField
                        value={manualBarcode}
                        onChange={(event) => {
                          const value = event.target.value;
                          // Only allow alphanumeric characters and limit to 36 characters
                          const filtered = value
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .slice(0, 36);
                          setManualBarcode(filtered);
                        }}
                        placeholder="e.g. 88843032512 or MS2038"
                        fullWidth
                        inputProps={{ inputMode: "text", maxLength: 36 }}
                      />
                      <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        sx={{ minWidth: { sm: 140 } }}
                      >
                        Search
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
