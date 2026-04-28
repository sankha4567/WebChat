"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useOnlineStatus() {
  const updateStatus = useMutation(api.users.updateOnlineStatus);

  useEffect(() => {
    let cancelled = false;
    const ping = (isOnline: boolean) => {
      if (cancelled) return;
      updateStatus({ isOnline }).catch(() => {
        // If the user record hasn't been synced by the Clerk webhook yet,
        // updateOnlineStatus is a no-op. Other failures are non-critical.
      });
    };

    ping(true);

    // Heartbeat keeps the row fresh so we can mark stale users offline
    // server-side even if the tab is killed without firing beforeunload.
    const heartbeat = setInterval(
      () => ping(!document.hidden),
      HEARTBEAT_INTERVAL_MS,
    );

    const handleVisibilityChange = () => ping(!document.hidden);
    const handleBeforeUnload = () => ping(false);
    const handleFocus = () => ping(true);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("focus", handleFocus);
      ping(false);
      cancelled = true;
    };
  }, [updateStatus]);
}
