"use client";

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useOnlineStatus() {
  const updateStatus = useMutation(api.users.updateOnlineStatus);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      updateStatus({ isOnline: true });
    }

    const handleVisibilityChange = () => {
      updateStatus({ isOnline: !document.hidden });
    };

    const handleBeforeUnload = () => {
      updateStatus({ isOnline: false });
    };

    const handleFocus = () => {
      updateStatus({ isOnline: true });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", handleFocus);
    };
  }, [updateStatus]);
}