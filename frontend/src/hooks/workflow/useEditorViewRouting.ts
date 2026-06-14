import { useCallback } from "react";
import { useLocation } from "wouter";

export type AppView =
  | "editor"
  | "speech"
  | "midi"
  | "beats"
  | "tuner"
  | "pricing"
  | "my-stems";

function locationToView(location: string): AppView {
  if (location === "/pricing") return "pricing";
  if (location === "/my-stems") return "my-stems";
  if (location === "/beats" || location === "/library") return "beats";
  if (location === "/tuner") return "tuner";
  if (location === "/speech") return "speech";
  if (location === "/midi") return "midi";
  return "editor";
}

export function useEditorViewRouting() {
  const [location, navigate] = useLocation();
  const activeView = locationToView(location);

  const setActiveView = useCallback(
    (view: AppView) => {
      navigate(view === "editor" ? "/" : `/${view}`);
    },
    [navigate],
  );

  return { activeView, setActiveView };
}
