/**
 * @author Colin Brown
 * @description Application entry point that initializes React root and global analytics
 * @fileformat React Component
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppRouter from "./AppRouter";
import { initAnalytics, trackPage } from "./analytics";

// Initialize analytics if measurement ID is provided via Vite env
initAnalytics(import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined);

// Track initial page view
trackPage(
  window.location.pathname + window.location.search + window.location.hash,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
