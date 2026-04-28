/**
 * @author Colin Brown
 * @description Admin route protection component that restricts access to admin-only pages
 * @fileformat React Component
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadUserInfo } from "./userInfo";

type RequireAdminProps = {
  children: React.ReactNode;
};

export default function RequireAdmin({ children }: RequireAdminProps) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await loadUserInfo();
      if (cancelled) {
        return;
      }
      if (!info) {
        navigate("/login", { replace: true });
        return;
      }
      if (!info.isAdmin) {
        navigate("/mycollection", { replace: true });
        return;
      }
      setAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
