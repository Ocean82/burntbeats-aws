import { useUser } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";

const FIRST_SPLIT_META_KEY = "firstSplitComplete";
const SESSION_DONE_KEY = "burnt-beats-first-run-done";

/** True when the signed-in user has not finished their first successful split. */
export function useFirstRunMode(): boolean {
  const { user, isLoaded } = useUser();
  const userId = user?.id;
  const sessionDoneKey = userId ? `${SESSION_DONE_KEY}:${userId}` : null;
  const [completionVersion, setCompletionVersion] = useState(0);

  useEffect(() => {
    const onComplete = () => {
      if (!sessionDoneKey) return;
      sessionStorage.setItem(sessionDoneKey, "true");
      setCompletionVersion((version) => version + 1);
    };
    window.addEventListener("burntbeats-first-split-complete", onComplete);
    return () => window.removeEventListener("burntbeats-first-split-complete", onComplete);
  }, [sessionDoneKey]);

  const sessionDone = useMemo(() => {
    void completionVersion;
    return (
      typeof window !== "undefined" &&
      sessionDoneKey !== null &&
      sessionStorage.getItem(sessionDoneKey) === "true"
    );
  }, [completionVersion, sessionDoneKey]);

  return useMemo(() => {
    if (sessionDone) return false;
    if (!isLoaded || !user) return false;
    const meta = user.unsafeMetadata as Record<string, unknown> | undefined;
    return meta?.[FIRST_SPLIT_META_KEY] !== true;
  }, [isLoaded, user, sessionDone]);
}
