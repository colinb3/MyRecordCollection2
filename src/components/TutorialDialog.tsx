import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  MobileStepper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowLeft from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import iconImg from "../assets/icon.png";
import searchTutorialImg from "../assets/searchTutorial.png";
import addRecordImg from "../assets/addRecordTutorial.png";
import navImg from "../assets/navigateTutorial.png";
import showoffImg from "../assets/showoffTutorial.png";
import listImg from "../assets/listTutorial.png";
import compareImg from "../assets/compareTutorial.png";

interface TutorialPage {
  title: string;
  description: string;
  image?: string;
  imageMaxHeight?: number;
}

interface TutorialDialogProps {
  open: boolean;
  onClose: () => void;
  pages?: TutorialPage[];
}

const defaultPages: TutorialPage[] = [
  {
    title: "Welcome to My Record Collection!",
    description:
      "This is your personal space to catalog and organize your music collection, whether it's physical media or just something you've listened to. Let's take a quick tour!",
    image: iconImg,
    imageMaxHeight: 125,
  },
  {
    title: "Add Records to Your Collection",
    description:
      "Use the search bar at the top of any page to find albums and add them to your collection, wishlist, or listening history. You can also scan barcodes or add custom records to find records.",
    image: searchTutorialImg,
    imageMaxHeight: 200,
  },
  {
    title: "Tag, Rate, and Review your Records",
    description:
      "Pick tags to categorize however you like, rate to keep track of your favorites, and write a review if you're feeling inspired.",
    image: addRecordImg,
    imageMaxHeight: 350,
  },
  {
    title: "Navigate Anywhere",
    description: "Click on your profile image to quickly navigate.",
    image: navImg,
    imageMaxHeight: 250,
  },
  {
    title: "Showoff your Favourite Records",
    description:
      "Setup your profile photo, name, and bio; highlight three of your favorite records; and display a record you're currently listening to in your profile settings.",
    image: showoffImg,
    imageMaxHeight: 300,
  },
  {
    title: "Build a Record List",
    description:
      "Create custom lists of your favourite or least favourite records to share with your friends.",
    image: listImg,
    imageMaxHeight: 250,
  },
  {
    title: "View Stats and Compare with Friends",
    description:
      "Dive into detailed statistics about anyone's collections and compare your collection with others directly from their profile.",
    image: compareImg,
    imageMaxHeight: 300,
  },
];

export default function TutorialDialog({
  open,
  onClose,
  pages = defaultPages,
}: TutorialDialogProps) {
  const [activeStep, setActiveStep] = useState(0);
  const maxSteps = pages.length;

  const handleNext = () => {
    if (activeStep === maxSteps - 1) {
      onClose();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(3.5px)",
          },
        },
        paper: {
          sx: {
            backgroundColor: "background.default",
            boxShadow: 15,
            maxHeight: "85vh",
            m: 2,
            overflow: "visible",
            borderRadius: 3,
          },
        },
      }}
    >
      {/* Back button - left side */}
      {activeStep > 0 && (
        <IconButton
          onClick={handleBack}
          size="small"
          sx={{
            position: "absolute",
            left: { xs: 7, sm: 10 },
            top: "50%",
            transform: "translateY(-50%)",
            bgcolor: "rgba(128, 128, 128, 0.5)",
            color: "#fff",
            "&:hover": {
              bgcolor: "rgba(128, 128, 128, 0.7)",
            },
            zIndex: 1,
          }}
          aria-label="previous step"
        >
          <KeyboardArrowLeft />
        </IconButton>
      )}

      {/* Next button - right side */}
      {activeStep < maxSteps - 1 && (
        <IconButton
          onClick={handleNext}
          size="small"
          sx={{
            position: "absolute",
            right: { xs: 7, sm: 10 },
            top: "50%",
            transform: "translateY(-50%)",
            bgcolor: "rgba(128, 128, 128, 0.5)",
            color: "#fff",
            "&:hover": {
              bgcolor: "rgba(128, 128, 128, 0.7)",
            },
            zIndex: 1,
          }}
          aria-label="next step"
        >
          <KeyboardArrowRight />
        </IconButton>
      )}

      <IconButton
        onClick={handleClose}
        sx={{
          position: "absolute",
          right: 8,
          top: 8,
          color: "text.secondary",
          zIndex: 1,
        }}
        aria-label="close tutorial"
      >
        <CloseIcon />
      </IconButton>

      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          pt: 3,
          pb: 1,
          px: 3,
        }}
      >
        {/* Render all pages, but only show the active one */}
        {pages.map((page, index) => (
          <Box
            key={index}
            sx={{
              display: activeStep === index ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Typography
              variant="h5"
              component="h2"
              fontWeight={600}
              sx={{ mb: 2 }}
            >
              {page.title}
            </Typography>

            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mb: 2, maxWidth: 400 }}
            >
              {page.description}
            </Typography>

            {page.image && (
              <Box
                component="img"
                src={page.image}
                alt={page.title}
                sx={{
                  maxWidth: "100%",
                  maxHeight: page.imageMaxHeight ?? 200,
                  objectFit: "contain",
                  borderRadius: 2,
                  mb: 0,
                }}
              />
            )}
          </Box>
        ))}
      </DialogContent>

      <DialogActions
        sx={{
          flexDirection: "column",
          px: 3,
          pb: 3,
          gap: 1,
          mb: -1,
        }}
      >
        <MobileStepper
          variant="dots"
          steps={maxSteps}
          position="static"
          activeStep={activeStep}
          sx={{
            width: "100%",
            justifyContent: "center",
            bgcolor: "transparent",
            "& .MuiMobileStepper-dot": {
              mx: 0.5,
            },
          }}
          nextButton={<Box sx={{ width: 0 }} />}
          backButton={<Box sx={{ width: 0 }} />}
        />
      </DialogActions>
    </Dialog>
  );
}
