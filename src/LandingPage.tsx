import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Container,
  CssBaseline,
  Divider,
  IconButton,
  Stack,
  ThemeProvider,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import "./LandingPage.css";
import { darkTheme } from "./theme";
import icon from "./assets/icon.png";
import collectionViewImg from "./assets/collectionview.png";
import editViewImg from "./assets/editview.png";
import profileViewImg from "./assets/profileview.png";
import discogsViewImg from "./assets/discogsview.png";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import FavoriteIcon from "@mui/icons-material/Favorite";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

export default function LandingPage() {
  const navigate = useNavigate();
  const carouselSlides = useMemo(
    () => [
      {
        title: "A collection view designed for crate diggers",
        caption:
          "Sort, filter, and edit records without leaving the table. Hide columns to see just the information you want.",
        bullets: [
          "Take control of your collection from one screen",
          "Responsive layouts for any device, from phones to 4K monitors",
          "Lightning-fast searching and filtering of your entire collection",
        ],
        image: collectionViewImg,
        imageAlt: "Preview of the collection table",
      },
      {
        title: "Build your collection like a pro",
        caption:
          "Create, find, and edit records with ease. Suggested tags make it easy to stay organized.",
        bullets: [
          "Search the Last.FM database of millions of records",
          "Create a custom record if you can't find that hidden gem of yours",
          "Just enter an album and artist name to get suggested genre tags like magic",
        ],
        image: editViewImg,
        imageAlt:
          "Preview of the edit dialog showcasing quick tagging workflows",
      },
      {
        title: "Create your profile and connect with friends",
        caption:
          "Show off your music taste and see what your friends are listening to.",
        bullets: [
          "Display your favourite records in your collection on your profile",
          "Follow other collectors and see their collections",
          "Easily see what records your friends have recently picked up",
        ],
        image: profileViewImg,
        imageAlt:
          "Preview of the Discogs import dialog with progress and summaries",
      },
      {
        title: "Discogs import that feels like magic",
        caption:
          "Upload your CSV once—duplicates are skipped, tags can be suggested from album genres, and cover art streams in from Last.fm.",
        bullets: [
          "Batch processing with friendly summaries of what changed",
          "Optional tag enrichment allows you to filter your collection instantly",
          "Covers fetched automatically from Last.fm",
        ],
        image: discogsViewImg,
        imageAlt:
          "Preview of the Discogs import dialog with progress and summaries",
      },
    ],
    []
  );

  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (carouselSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveSlide((prev) =>
        prev + 1 === carouselSlides.length ? 0 : prev + 1
      );
    }, 12000);
    return () => window.clearInterval(timer);
  }, [carouselSlides.length]);

  const handlePrevSlide = () => {
    setActiveSlide((prev) =>
      prev === 0 ? carouselSlides.length - 1 : prev - 1
    );
  };

  const handleNextSlide = () => {
    setActiveSlide((prev) =>
      prev + 1 === carouselSlides.length ? 0 : prev + 1
    );
  };

  const currentSlide = carouselSlides[activeSlide];

  const featureHighlights = [
    {
      title: "Built for collectors",
      description:
        "Rate and tag every pressing in your collection, keep a wishlist, and see how your friends' collections compare.",
      Icon: LibraryMusicIcon,
    },
    {
      title: "Create your profile",
      description:
        "Show off your favorite records, follow friends, and see recent additions to their collections.",
      Icon: PeopleAltIcon,
    },
    {
      title: "Powerful filters & search",
      description:
        "Slice your collection by custom tags, rating, decade, or date added to help you find the perfect spin instantly.",
      Icon: FilterAltIcon,
    },
    {
      title: "Smart tagging tools",
      description:
        "Automatic tag suggestions from the record's genres to easily import and organize your collection.",
      Icon: LocalOfferIcon,
    },
    {
      title: "Organize your wishes",
      description:
        "Always know what to look for at the record store next with a dedicated wishlist.",
      Icon: FavoriteIcon,
    },
    {
      title: "Discogs import in seconds",
      description:
        "Import your Discogs collection and we handle covers, ratings, and tags automatically.",
      Icon: CloudUploadIcon,
    },
  ];

  {
    /*const workflow = [
    {
      heading: "Import",
      copy: "Drop in your Discogs export or add records manually. We prevent duplicates and grab cover art for you.",
    },
    {
      heading: "Organize",
      copy: "Tag albums and filter by anything—from genres to personal ratings.",
    },
    {
      heading: "Rediscover",
      copy: "Use quick search, filters, and a beautiful table view to find the next record you can't wait to play.",
    },
  ];*/
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ backgroundColor: "background.default", minHeight: "100vh" }}>
        <Box
          component="section"
          sx={{
            position: "relative",
            overflow: "hidden",
            py: { xs: 10, md: 14 },
            color: "common.white",
            background: (theme) =>
              `radial-gradient(circle at top left, ${theme.palette.primary.dark} 0%, ${theme.palette.background.default} 55%, ${theme.palette.background.paper} 100%)`,
          }}
        >
          <Container maxWidth="lg">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1.1fr 0.9fr" },
                gap: { xs: 6, md: 8 },
                alignItems: "center",
              }}
            >
              <Box>
                <Stack spacing={3}>
                  <Chip
                    label="Version 2.0 Beta"
                    color="primary"
                    sx={{ alignSelf: { xs: "center", md: "flex-start" } }}
                  />
                  <Typography
                    variant="h2"
                    fontWeight={700}
                    textAlign={{ xs: "center", md: "left" }}
                  >
                    The smarter way to manage your vinyl obsession
                  </Typography>
                  <Typography
                    variant="h6"
                    color="grey.300"
                    maxWidth={600}
                    textAlign={{ xs: "center", md: "left" }}
                  >
                    My Record Collection keeps every pressing beautifully
                    organized—whether you have 50 records or 5,000.
                  </Typography>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    justifyContent={{ xs: "center", md: "flex-start" }}
                  >
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => navigate("/register")}
                    >
                      Create an account
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      color="inherit"
                      onClick={() => navigate("/mycollection")}
                    >
                      Explore your collection
                    </Button>
                  </Stack>
                </Stack>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <Box
                  sx={{
                    mt: 2,
                    position: "relative",
                    width: { xs: 160, md: 160 },
                    height: { xs: 160, md: 160 },
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: (theme) =>
                      `0 0 80px ${theme.palette.primary.main}99`,
                  }}
                >
                  <img
                    src={icon}
                    alt="My Record Collection Logo"
                    width={160}
                    height={160}
                    className="record"
                  />
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 10 } }}>
          <Stack spacing={7}>
            <Box
              sx={{
                position: "relative",
                overflow: "hidden",
                borderRadius: 4,
                p: { xs: 4, md: 6 },
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.main}15 0%, ${theme.palette.primary.dark}35 50%, ${theme.palette.background.paper} 100%)`,
                border: (theme) => `1px solid ${theme.palette.primary.main}30`,
                boxShadow: (theme) =>
                  `0 18px 42px ${theme.palette.primary.main}18`,
              }}
            >
              <IconButton
                aria-label="Previous highlight"
                onClick={handlePrevSlide}
                sx={{
                  position: "absolute",
                  top: "50%",
                  left: { xs: 8, sm: 16 },
                  transform: "translateY(-50%)",
                  color: "common.white",
                  backgroundColor: "rgba(0,0,0,0.25)",
                  zIndex: 2000,
                  "&:hover": { backgroundColor: "rgba(0,0,0,0.45)" },
                }}
              >
                <ArrowBackIosNewIcon fontSize="small" />
              </IconButton>
              <IconButton
                aria-label="Next highlight"
                onClick={handleNextSlide}
                sx={{
                  position: "absolute",
                  top: "50%",
                  right: { xs: 8, sm: 16 },
                  transform: "translateY(-50%)",
                  color: "common.white",
                  backgroundColor: "rgba(0,0,0,0.25)",
                  zIndex: 2000,
                  "&:hover": { backgroundColor: "rgba(0,0,0,0.45)" },
                }}
              >
                <ArrowForwardIosIcon fontSize="small" />
              </IconButton>

              <Box
                sx={{
                  display: "grid",
                  gap: { xs: 4, md: 6 },
                  gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr" },
                  alignItems: "center",
                }}
              >
                <Box>
                  <Stack spacing={2}>
                    <Typography variant="h4" fontWeight={700}>
                      {currentSlide.title}
                    </Typography>
                    <Typography variant="body1" color="grey.200">
                      {currentSlide.caption}
                    </Typography>
                    <Stack
                      component="ul"
                      spacing={1.5}
                      sx={{ listStyle: "none", m: 0, p: 0 }}
                    >
                      {currentSlide.bullets.map((bullet) => (
                        <Stack
                          key={bullet}
                          component="li"
                          direction="row"
                          spacing={1.5}
                          alignItems="flex-start"
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor: "primary.main",
                              flexShrink: 0,
                              alignSelf: "center",
                            }}
                          />
                          <Typography variant="body2" color="grey.200">
                            {bullet}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </Stack>
                </Box>
                <Box>
                  <Box
                    sx={{
                      position: "relative",
                      borderRadius: 3,
                      backgroundColor: "transparent",
                      border: (theme) =>
                        `1px solid ${theme.palette.primary.main}40`,
                      height: { xs: 300, sm: 380, md: 320 },
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "stretch",
                      justifyContent: "center",
                      backdropFilter: "none",
                      transition: "transform 0.4s ease",
                    }}
                  >
                    <Box
                      component="img"
                      src={currentSlide.image || icon}
                      alt={currentSlide.imageAlt}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    <Box
                      sx={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 3,
                        border: (theme) =>
                          `1px solid ${theme.palette.primary.light}26`,
                        pointerEvents: "none",
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              <Stack
                direction="row"
                spacing={1}
                justifyContent="center"
                alignItems="center"
                sx={{ mt: 3 }}
              >
                {carouselSlides.map((slide, idx) => (
                  <Box
                    key={slide.title}
                    component="button"
                    type="button"
                    onClick={() => setActiveSlide(idx)}
                    aria-label={`Show slide ${idx + 1}`}
                    sx={{
                      width: idx === activeSlide ? 30 : 12,
                      height: 12,
                      borderRadius: 999,
                      border: "none",
                      cursor: "pointer",
                      backgroundColor:
                        idx === activeSlide
                          ? "primary.main"
                          : "rgba(255,255,255,0.3)",
                      transition: "all 0.3s ease",
                      opacity: idx === activeSlide ? 1 : 0.6,
                      p: 0,
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveSlide(idx);
                      }
                    }}
                  />
                ))}
              </Stack>
            </Box>

            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Everything you need to stay on top of your collection
              </Typography>
              <Typography variant="body1" color="text.secondary">
                From showing off to your friends to tag management and
                intelligent filters, every feature is built with collectors in
                mind.
              </Typography>
            </Box>

            <Box
              sx={{
                display: "grid",
                gap: 3,
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                },
              }}
            >
              {featureHighlights.map(({ Icon, title, description }) => (
                <Box
                  key={title}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    backgroundColor: "background.paper",
                    border: (theme) => `1px solid ${theme.palette.divider}`,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      display: "grid",
                      placeItems: "center",
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      boxShadow: (theme) =>
                        `0 12px 24px ${theme.palette.primary.main}1f`,
                    }}
                  >
                    <Icon fontSize="medium" />
                  </Box>
                  <Typography variant="h6" fontWeight={600}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {description}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
            {/*
            <Box>
              <Typography variant="overline" color="primary">
                How it works
              </Typography>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Curate your shelves in three easy steps
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Whether you are cataloging a brand new haul or digitizing
                decades of collecting, the workflow stays fast and frustration
                free.
              </Typography>
              <Stack spacing={3}>
                {workflow.map(({ heading, copy }, idx) => (
                  <Box key={heading} sx={{ display: "flex", gap: 2 }}>
                    <Box
                      sx={{
                        minWidth: 36,
                        height: 36,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                      }}
                    >
                      {idx + 1}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {heading}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {copy}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Box>*/}

            <Box
              sx={{
                p: { xs: 4, md: 6 },
                borderRadius: 4,
                textAlign: "center",
                background: (theme) =>
                  `linear-gradient(120deg, ${theme.palette.primary.main}20 0%, ${theme.palette.primary.dark}55 100%)`,
                border: (theme) => `1px solid ${theme.palette.primary.main}55`,
                boxShadow: (theme) =>
                  `0 24px 48px ${theme.palette.primary.main}20`,
              }}
            >
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Ready to give your records the archive they deserve?
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                maxWidth={680}
                mx="auto"
                paragraph
              >
                Join a growing community of collectors keeping track of every
                spin, trade, and wishlist grail.
              </Typography>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                justifyContent="center"
                alignItems="center"
              >
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => navigate("/register")}
                >
                  Create an account
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => navigate("/login")}
                >
                  I already have an account
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
