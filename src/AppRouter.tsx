import {
  BrowserRouter,
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
const Community = lazy(() => import("./Community"));
const CommunityProfile = lazy(() => import("./CommunityProfile"));
const CommunityCollection = lazy(() => import("./CommunityCollection"));
const CommunityFollows = lazy(() => import("./CommunityFollows"));
const CommunityStats = lazy(() => import("./CommunityStats"));
import { loadUserInfo } from "./userInfo";
const MasterRecordPage = lazy(() => import("./MasterRecord"));
const RecordDetails = lazy(() => import("./Record"));
const MasterReviews = lazy(() => import("./MasterReviews"));
const BarcodeScanner = lazy(() => import("./BarcodeScanner"));
const AdminPanel = lazy(() => import("./Admin"));
const Lists = lazy(() => import("./Lists"));
const ListDetail = lazy(() => import("./ListDetail"));
const Compare = lazy(() => import("./Compare"));

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
  // Use BrowserRouter for clean URLs now that we have 404.html redirect
  const Router = BrowserRouter;
  const routerProps = { basename: import.meta.env.BASE_URL };
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
        <Route
          path="/lists"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Lists />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route
          path="/lists/:listId"
          element={
            <Suspense fallback={<div />}>
              <ListDetail />
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
          path="/community"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Community />
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
              <CommunityCollection tableName="My Collection" />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/wishlist"
          element={
            <Suspense fallback={<div />}>
              <CommunityCollection tableName="Wishlist" />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/listened"
          element={
            <Suspense fallback={<div />}>
              <CommunityCollection tableName="Listened" />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/genre"
          element={
            <Suspense fallback={<div />}>
              <CommunityCollection tableName="My Collection" />
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
          path="/community/:username/stats"
          element={
            <Suspense fallback={<div />}>
              <CommunityStats />
            </Suspense>
          }
        />
        <Route
          path="/community/:username/compare"
          element={
            <RequireAuth>
              <Suspense fallback={<div />}>
                <Compare />
              </Suspense>
            </RequireAuth>
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
      } catch {
        /* ignore analytics errors */
      }
    })();
  }, [location]);
  return null;
}
