import { useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";

const FIRST_SPLIT_META_KEY = "firstSplitComplete";
const SESSION_DONE_KEY = "burnt-beats-first-run-done";

/** True when the signed-in user has not finished their first successful split. */
export function useFirstRunMode(): boolean {
  const { user, isLoaded } = useUser();
  const [sessionDone, setSessionDone] = useState(
    () =>
      typeof window !== "undefined" &&
      sessionStorage.getItem(SESSION_DONE_KEY) === "true",
  );

  useEffect(() => {
    const onComplete = () => {
      sessionStorage.setItem(SESSION_DONE_KEY, "true");
      setSessionDone(true);
    };
    window.addEventListener("burntbeats-first-split-complete", onComplete);
    return () => window.removeEventListener("burntbeats-first-split-complete", onComplete);
  }, []);

  return useMemo(() => {
    if (sessionDone) return false;
    if (!isLoaded || !user) return false;
    const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
    return meta?.[FIRST_SPLIT_META_KEY] !== true;
  }, [isLoaded, user, sessionDone]);
}
