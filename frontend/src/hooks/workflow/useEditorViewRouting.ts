import { useCallback } from "react";
import { useLocation } from "wouter";

export type AppView =
  | "hub"
  | "editor"
  | "speech"
  | "midi"
  | "beats"
  | "tuner"
  | "pricing"
  | "my-stems";

export function locationToView(location: string): AppView {
  if (location === "/pricing") return "pricing";
  if (location === "/my-stems" || location === "/library") return "my-stems";
  if (location === "/editor") return "editor";
  if (location === "/beats") return "beats";
  if (location === "/tuner") return "tuner";
  if (location === "/speech") return "speech";
  if (location === "/midi") return "midi";
  return "hub";
}

export function useEditorViewRouting() {
  const [location, navigate] = useLocation();
  const activeView = locationToView(location);

  const setActiveView = useCallback(
    (view: AppView) => {
      if (view === "hub") {
        navigate("/");
      } else if (view === "editor") {
        navigate("/editor");
      } else if (view === "my-stems") {
        navigate("/library");
      } else {
        navigate(`/${view}`);
      }
    },
    [navigate],
  );

  return { activeView, setActiveView };
}
