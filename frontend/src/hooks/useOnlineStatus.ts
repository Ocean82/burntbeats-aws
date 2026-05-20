/**
 * useOnlineStatus — tracks browser online/offline state.
 * Returns { isOnline, wasOffline } where wasOffline is true for 3s after reconnection.
 */
import { useState, useEffect, useRef } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [wasOffline, setWasOffline] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Clear "was offline" indicator after 3 seconds
      timerRef.current = window.setTimeout(() => setWasOffline(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(false);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { isOnline, wasOffline };
}
