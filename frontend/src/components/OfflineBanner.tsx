/**
 * OfflineBanner — fixed top banner shown when the user loses internet connection.
 * Auto-dismisses with a "Back online" message when connection returns.
 */
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();

  const showBanner = !isOnline || wasOffline;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`fixed inset-x-0 top-0 z-[250] flex items-center justify-center gap-xs px-md py-sm text-sm font-medium backdrop-blur-md ${
            isOnline
              ? "border-b border-success-400/30 bg-success-950/90 text-success-100"
              : "border-b border-primary-400/30 bg-primary-950/90 text-primary-100"
          }`}
          role="alert"
          aria-live="assertive"
        >
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4 text-success-400" aria-hidden />
              Back online
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-primary-400" aria-hidden />
              You're offline. Some features may not work until connection is restored.
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
