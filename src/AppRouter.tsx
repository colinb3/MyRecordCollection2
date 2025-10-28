import {
  BrowserRouter,
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import React, { Suspense, lazy, useEffect, useState } from "react";
import LandingPage from "./LandingPage";
const Collection = lazy(() => import("./Collection"));
const Search = lazy(() => import("./Search"));
const Login = lazy(() => import("./Login"));
const Register = lazy(() => import("./Register"));
import RequireAuth from "./RequireAuth";
import RequireAdmin from "./RequireAdmin";
const NotFound = lazy(() => import("./NotFound"));
const Settings = lazy(() => import("./Settings"));
const Activity = lazy(() => import("./Activity"));
const CommunityProfile = lazy(() => import("./CommunityProfile"));
const CommunityCollection = lazy(() => import("./CommunityCollection"));
const CommunityFollows = lazy(() => import("./CommunityFollows"));
import { loadUserInfo } from "./userInfo";
const MasterRecordPage = lazy(() => import("./MasterRecord"));
const RecordDetails = lazy(() => import("./Record"));
const MasterReviews = lazy(() => import("./MasterReviews"));
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));
const AdminPanel = lazy(() => import("./Admin"));

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
              <Suspense fallback={<div />}>
                <Collection tableName="My Collection" title="My Collection" />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/wishlist"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Collection tableName="Wishlist" title="Wishlist" />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/listened"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Collection tableName="Listened" title="Listened" />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/search"
          element={
            <Suspense fallback={<div />}>
              <Search />
            </Suspense>
          }
        />
        <Route path="/findrecord" element={<Navigate to="/search" replace />} />
        <Route
          path="/master/:masterId/reviews"
          element={
            <Suspense fallback={<div />}>
              <MasterReviews />
            </Suspense>
          }
        />
        <Route
          path="/master/:masterId?"
          element={
            <Suspense fallback={<div />}>
              <MasterRecordPage />
            </Suspense>
          }
        />
        <Route
          path="/scan"
          element={
            <Suspense fallback={<div />}>
              <BarcodeScanner />
            </Suspense>
          }
        />
        <Route
          path="/record/:recordId"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <RecordDetails />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/community/:username/record/:recordId"
          element={
            <Suspense fallback={<div />}>
              <RecordDetails />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Settings />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <RequireAdmin>
                <Suspense fallback={<div />}>
                  <AdminPanel />
                </Suspense>
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/activity"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Activity />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/community/:username"
          element={
            <Suspense fallback={<div />}>
              <CommunityProfile />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/collection"
          element={
            <Suspense fallback={<div />}>
              <CommunityCollection />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/follows"
          element={
            <Suspense fallback={<div />}>
              <CommunityFollows />
            </Suspense>
          }
        />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Suspense fallback={<div />}>
                <Login />
              </Suspense>
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <Suspense fallback={<div />}>
                <Register />
              </Suspense>
            </RedirectIfAuthed>
          }
        />
        {/* Fallback: show a friendly 404 page for unknown client-side routes */}
        <Route
          path="*"
          element={
            <Suspense fallback={<div />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
      {/* Track page views on location change */}
      <RouteTracker />
    </Router>
  );
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    (async () => {
      try {
        const mod = await import("./analytics");
        if (mod?.trackPage) {
          mod.trackPage(location.pathname + location.search + location.hash);
        }
      } catch (e) {
        /* ignore analytics errors */
      }
    })();
  }, [location]);
  return null;
}
