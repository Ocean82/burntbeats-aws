import type { ComponentType } from "react";
import { Sparkles, Upload, Music, FolderOpen } from "lucide-react";

export interface OnboardingStep {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  tip: string;
  target?: string;
}

export const HUB_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Burnt Beats",
    description:
      "Your home for splitting songs, making beats, and turning audio into notes. Pick a tool to get started.",
    tip: "Press ? anytime to see keyboard shortcuts",
  },
  {
    icon: Upload,
    title: "Split a Song",
    description:
      "Pull vocals, drums, bass, and more out of any track — perfect for karaoke, remixing, or sampling.",
    tip: "Look for the Rip it apart badge on your main split tool",
    target: '[data-tour="tool-split"]',
  },
  {
    icon: Music,
    title: "Beat Maker",
    description:
      "Build drum patterns in the step sequencer, browse templates, and export when you are ready.",
    tip: "Beat Templates live inside the drum machine",
    target: '[data-tour="tool-beats"]',
  },
  {
    icon: FolderOpen,
    title: "Your Splits",
    description:
      "Every song you split is saved here so you can reopen, remix, or download tracks later.",
    tip: "Recent work also appears at the bottom of Home",
    target: '[data-tour="tool-splits"]',
  },
  {
    icon: Sparkles,
    title: "Ready to cook?",
    description:
      "Start with Split a Song — upload a track and we will walk you through the rest.",
    tip: "You can always return Home from any tool",
  },
];

export const HUB_ONBOARDING_KEY = "burnt-beats-onboarding-complete";
export const EDITOR_ONBOARDING_KEY = "burnt-beats-editor-tour-complete";
export const EDITOR_ONBOARDING_PENDING_KEY = "burnt-beats-editor-tour-pending";

export function markEditorTourPending() {
  localStorage.setItem(EDITOR_ONBOARDING_PENDING_KEY, "true");
}

export function consumeEditorTourPending(): boolean {
  const pending = localStorage.getItem(EDITOR_ONBOARDING_PENDING_KEY) === "true";
  if (pending) localStorage.removeItem(EDITOR_ONBOARDING_PENDING_KEY);
  return pending;
}
