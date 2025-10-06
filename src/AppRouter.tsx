import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import LandingPage from "./LandingPage";
import Collection from "./Collection";
import FindRecord from "./FindRecord";
import Login from "./Login";
import Register from "./Register";
import RequireAuth from "./RequireAuth";
import NotFound from "./NotFound";
import Settings from "./Settings";
import Community from "./Community";
import CommunityProfile from "./CommunityProfile";
import CommunityCollection from "./CommunityCollection";
import CommunityFollows from "./CommunityFollows";
import { useLocation } from "react-router-dom";
import { trackPage } from "./analytics";
import { loadUserInfo } from "./userInfo";

// Component that prevents authenticated users from seeing auth pages
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "authed" | "anon">(
    "loading"
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await loadUserInfo();
      if (!cancelled) setStatus(info ? "authed" : "anon");
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (status === "loading") return null; // or a spinner if desired
  if (status === "authed") return <Navigate to="/mycollection" replace />;
  return <>{children}</>;
}

export default function AppRouter() {
  // Use HashRouter for production (GitHub Pages) to avoid 404s on page reloads.
  // Keep BrowserRouter for development for nicer URLs.
  const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;
  // Only apply basename for BrowserRouter
  const routerProps =
    Router === BrowserRouter ? { basename: import.meta.env.BASE_URL } : {};
  return (
    <Router {...routerProps}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/mycollection"
          element={
            <RequireAuth>
              <Collection tableName="My Collection" title="My Collection" />
            </RequireAuth>
          }
        />
        <Route
          path="/wishlist"
          element={
            <RequireAuth>
              <Collection tableName="Wishlist" title="Wishlist" />
            </RequireAuth>
          }
        />
        <Route
          path="/findrecord"
          element={
            <RequireAuth>
              <FindRecord />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/community"
          element={
            <RequireAuth>
              <Community />
            </RequireAuth>
          }
        />
        <Route
          path="/community/:username"
          element={
            <RequireAuth>
              <CommunityProfile />
            </RequireAuth>
          }
        />
        <Route
          path="/community/:username/collection"
          element={
            <RequireAuth>
              <CommunityCollection />
            </RequireAuth>
          }
        />
        <Route
          path="/community/:username/follows"
          element={
            <RequireAuth>
              <CommunityFollows />
            </RequireAuth>
          }
        />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <Register />
            </RedirectIfAuthed>
          }
        />
        {/* Fallback: show a friendly 404 page for unknown client-side routes */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Track page views on location change */}
      <RouteTracker />
    </Router>
  );
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPage(location.pathname + location.search + location.hash);
  }, [location]);
  return null;
}
