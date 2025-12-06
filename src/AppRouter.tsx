import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import React, { Suspense, lazy, useEffect, useState } from "react";
import LandingPage from "./pages/LandingPage";
import ChunkErrorBoundary from "./components/ChunkErrorBoundary";
const Collection = lazy(() => import("./pages/Collection"));
const Search = lazy(() => import("./pages/Search"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
import RequireAuth from "./RequireAuth";
import RequireAdmin from "./RequireAdmin";
const NotFound = lazy(() => import("./pages/NotFound"));
const Settings = lazy(() => import("./pages/Settings"));
const Community = lazy(() => import("./pages/Community"));
const CommunityProfile = lazy(() => import("./pages/CommunityProfile"));
const CommunityCollection = lazy(() => import("./pages/CommunityCollection"));
const CommunityFollows = lazy(() => import("./pages/CommunityFollows"));
const CommunityStats = lazy(() => import("./pages/CommunityStats"));
import { loadUserInfo } from "./userInfo";
const MasterRecordPage = lazy(() => import("./pages/MasterRecord"));
const RecordDetails = lazy(() => import("./pages/Record"));
const MasterReviews = lazy(() => import("./pages/MasterReviews"));
const BarcodeScanner = lazy(() => import("./pages/BarcodeScanner"));
const AdminPanel = lazy(() => import("./pages/Admin"));
const Lists = lazy(() => import("./pages/Lists"));
const ListDetail = lazy(() => import("./pages/ListDetail"));
const Compare = lazy(() => import("./pages/Compare"));

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
    <ChunkErrorBoundary>
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
          <Route
            path="/findrecord"
            element={<Navigate to="/search" replace />}
          />
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
    </ChunkErrorBoundary>
  );
}

function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    // Track page views (analytics) and set the document title
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

    const getTitleFromLocation = (pathname: string, search: string) => {
      // Clean up and handle common routes
      if (pathname === "/") return "";
      if (pathname === "/search") {
        const params = new URLSearchParams(search);
        const q = (params.get("q") || "").trim();
        return q ? `${q} | ` : "Search | ";
      }
      if (pathname === "/mycollection") return "My Collection | ";
      if (pathname === "/wishlist") return "My Wishlist | ";
      if (pathname === "/listened") return "My Listened | ";
      if (pathname === "/settings") return "Settings | ";
      if (pathname === "/admin") return "Admin | ";
      if (pathname === "/lists") return "Lists | ";

      // Lists detail
      let m = pathname.match(/^\/lists\/(.+)$/);
      if (m) return `List ${decodeURIComponent(m[1])} | `;

      // Master record pages
      m = pathname.match(/^\/master\/(r?\d+)(?:\/reviews)?$/);
      if (m) return `Master ${m[1]} | `;
      // Record pages
      m = pathname.match(/^\/record\/(\d+)$/);
      if (m) return `Record ${m[1]} | `;
      m = pathname.match(/^\/community\/([^\/]+)\/record\/(\d+)$/);
      if (m) return `Record ${m[2]} | `;

      // Community routes
      m = pathname.match(
        /^\/community(?:\/([^\/]+))(?:\/(collection|wishlist|listened|genre|follows|stats|compare))?$/
      );
      if (m) {
        const username = m[1] ? decodeURIComponent(m[1]) : null;
        const section = m[2] || null;
        if (!username) return "Community | ";
        switch (section) {
          case "collection":
            return `${username}'s Collection | `;
          case "wishlist":
            return `${username}'s Wishlist | `;
          case "listened":
            return `${username}'s Listened | `;
          case "genre":
            return `${username}'s Genre | `;
          case "follows":
            return `${username}'s Follows | `;
          case "stats":
            return `${username}'s Stats | `;
          case "compare":
            return `Compare with ${username} | `;
          default:
            return `${username}'s Profile | `;
        }
      }

      // Fallback: use the pathname (trimmed)
      const nice = pathname.replace(/^\//, "").replace(/\//g, " | ");
      return nice
        ? nice.charAt(0).toUpperCase() + nice.slice(1) + " | "
        : "Page | ";
    };

    const pageTitle = getTitleFromLocation(location.pathname, location.search);
    document.title = `${pageTitle}My Record Collection`;
  }, [location]);

  return null;
}
