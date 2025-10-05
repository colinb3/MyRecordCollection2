import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadUserInfo } from "./userInfo";

export default function RequireAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const info = await loadUserInfo();
      if (!info) {
        navigate("/login");
      }
    };
    checkAuth();
  }, [navigate]);

  return <>{children}</>;
}
