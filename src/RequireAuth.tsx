import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { loadUserInfo } from "./userInfo";

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      const info = await loadUserInfo();
      if (!info) {
        // preserve the current location (path + search + hash) so we can return there after login
        // avoid redirect loops when already on /login
        if (location.pathname !== "/login") {
          const next = encodeURIComponent(
            `${location.pathname}${location.search || ""}${location.hash || ""}`
          );
          navigate(`/login?next=${next}`);
        }
      }
    };
    checkAuth();
  }, [navigate, location.pathname, location.search, location.hash]);

  return <>{children}</>;
}
