import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AppRouter from "./AppRouter";
import { initAnalytics, trackPage } from "./analytics";

// Check for version mismatch and reload if needed
async function checkVersion() {
  try {
    // Fetch version.json with cache-busting query param
    const response = await fetch(`/version.json?_=${Date.now()}`);
    if (!response.ok) return;
    const data = await response.json();
    const serverBuildId = data.buildId;
    const clientBuildId = __BUILD_ID__;

    if (serverBuildId && clientBuildId && serverBuildId !== clientBuildId) {
      console.log(
        `Version mismatch: client=${clientBuildId}, server=${serverBuildId}. Reloading...`
      );
      // Clear any stored reload count to ensure we do a fresh reload
      sessionStorage.removeItem("chunk_error_reload");
      // Force reload with cache bust
      const url = new URL(window.location.href);
      url.searchParams.set("_v", serverBuildId);
      window.location.replace(url.toString());
      return false;
    }
  } catch {
    // Ignore errors - version check is best-effort
  }
  return true;
}

// Only render the app if version check passes
checkVersion().then((shouldRender) => {
  if (!shouldRender) return;

  // Initialize analytics if measurement ID is provided via Vite env
  initAnalytics(import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined);

  // Track initial page view
  trackPage(
    window.location.pathname + window.location.search + window.location.hash
  );

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppRouter />
    </StrictMode>
  );
});
