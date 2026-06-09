/**
 * OfflineBanner — fixed top banner shown when the user loses internet connection.
 * Auto-dismisses with a "Back online" message when connection returns.
 */
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { bannerSlideMotion } from "../motion/presets";

export function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const reduceMotion = useReducedMotion() ?? false;
  const slide = bannerSlideMotion(reduceMotion, "top");

  const showBanner = !isOnline || wasOffline;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          {...slide}
          className={`fixed inset-x-0 top-0 bottom-auto z-toast flex items-center justify-center gap-xs px-md py-sm text-sm font-medium backdrop-blur-md pt-[max(var(--space-sm),env(safe-area-inset-top,0px))] ${
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
              You&apos;re offline. Some features may not work until connection is restored.
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
