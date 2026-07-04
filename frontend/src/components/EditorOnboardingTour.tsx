import { useState, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Upload, Sliders, Music2, Download } from "lucide-react";
import { cn } from "../utils/cn";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";
import { useAppEvent } from "../store/eventBus";
import {
  EDITOR_ONBOARDING_KEY,
  type OnboardingStep,
} from "../data/onboardingSteps";

const EDITOR_TOUR_STEPS: OnboardingStep[] = [
  {
    icon: Upload,
    title: "Upload Your Track",
    description: "Drag and drop an audio file, or click to browse. We support MP3, WAV, FLAC, and more.",
    tip: "Files up to 500MB are supported",
    target: '[data-tour="upload-dropzone"]',
  },
  {
    icon: Sliders,
    title: "Configure Your Split",
    description: "Choose the exact mode you want up front: 2 stems or 4 stems, each in Fast or Quality mode.",
    tip: "Use Quality for the cleanest separation",
    target: '[data-tour="quality-selector"]',
  },
  {
    icon: Music2,
    title: "Mix Your Tracks",
    description: "After splitting, adjust levels, pan, and trim each track. Solo or mute parts to perfect your mix.",
    tip: "Use number keys 1-4 to quickly solo tracks",
  },
  {
    icon: Download,
    title: "Export Your Work",
    description: "Download individual tracks or a mixed master. Choose your preferred format and quality.",
    tip: "Use Export in the mixer, or Ctrl+E (Mac: ⌘E)",
  },
];

export function EditorOnboardingTour() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();

  useAppEvent("open-editor-onboarding", () => {
    setCurrentStep(0);
    setIsVisible(true);
  });

  const handleComplete = () => {
    localStorage.setItem(EDITOR_ONBOARDING_KEY, "true");
    setIsVisible(false);
  };

  const handleSkip = () => {
    localStorage.setItem(EDITOR_ONBOARDING_KEY, "true");
    setIsVisible(false);
  };

  useModalA11y(isVisible, modalRef, handleSkip);

  const nextStep = () => {
    if (currentStep < EDITOR_TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const step = EDITOR_TOUR_STEPS[currentStep] as OnboardingStep;
  const { icon: Icon, target } = step;

  useLayoutEffect(() => {
    if (!isVisible || !target) {
      const id = requestAnimationFrame(() => setSpotlightRect(null));
      return () => cancelAnimationFrame(id);
    }
    const el = document.querySelector(target);
    if (!el) {
      const id = requestAnimationFrame(() => setSpotlightRect(null));
      return () => cancelAnimationFrame(id);
    }
    const update = () => setSpotlightRect(el.getBoundingClientRect());
    const id = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isVisible, currentStep, target]);

  const anchoredStyle: React.CSSProperties | undefined = spotlightRect
    ? {
        position: "fixed",
        left: Math.min(
          Math.max(16, spotlightRect.left + spotlightRect.width / 2 - 200),
          window.innerWidth - 416,
        ),
        top: Math.min(spotlightRect.bottom + 12, window.innerHeight - 360),
        width: "min(100% - 2rem, 400px)",
      }
    : undefined;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            className="fixed inset-0 z-modal-backdrop bg-chrome/80 backdrop-blur-sm"
            {...motionCfg.modalBackdrop}
          />

          {spotlightRect && (
            <motion.div
              className="pointer-events-none fixed z-modal rounded-xl ring-4 ring-primary-400/70"
              style={{
                left: spotlightRect.left - 6,
                top: spotlightRect.top - 6,
                width: spotlightRect.width + 12,
                height: spotlightRect.height + 12,
              }}
              aria-hidden
            />
          )}

          <div
            className={cn(
              "z-modal w-full",
              spotlightRect
                ? "fixed inset-0 pointer-events-none"
                : "fixed inset-0 flex w-full items-center justify-center p-md",
            )}
          >
            <motion.div
              ref={modalRef}
              style={anchoredStyle}
              className={cn(
                "relative box-border w-full max-w-md shrink-0 overflow-y-auto rounded-3xl border border-border bg-popover/95 shadow-elevation-xl backdrop-blur-xl pointer-events-auto",
                "min-w-[min(100%,20rem)]",
                spotlightRect
                  ? "max-h-[min(70vh,400px)]"
                  : "max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)]",
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby="editor-onboarding-title"
              {...motionCfg.modalContent}
            >
              <div className="absolute left-0 right-0 top-0 h-1 bg-muted">
                <motion.div
                  className="h-full bg-linear-to-r from-primary-500 to-primary-400"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${((currentStep + 1) / EDITOR_TOUR_STEPS.length) * 100}%`,
                  }}
                  transition={motionCfg.transition("normal")}
                />
              </div>

              <button
                onClick={handleSkip}
                aria-label="Skip editor tour"
                title="Skip editor tour"
                className="tap-target-expand absolute right-md top-md flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="p-lg pt-8 sm:p-xl sm:pt-10">
                <div className="w-full min-w-0 text-center">
                  <div className="mx-auto mb-lg flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-primary-500/20 to-primary-400/10 shadow-elevation-md">
                    <Icon className="h-10 w-10 text-primary-400" strokeWidth={1.5} />
                  </div>
                  <h2 id="editor-onboarding-title" className="mb-sm text-2xl font-bold text-foreground">
                    {step.title}
                  </h2>
                  <p className="copy-block text-readable text-readable-tight mb-md text-sm leading-relaxed text-secondary-foreground">
                    {step.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border p-md">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className={cn(
                    "tap-feedback flex min-h-[44px] items-center gap-2xs rounded-lg px-md py-xs text-sm transition",
                    currentStep === 0
                      ? "text-muted-foreground/40"
                      : "text-secondary-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={nextStep}
                  className="tap-feedback flex min-h-[44px] items-center gap-2xs rounded-lg bg-primary px-md py-xs text-sm font-medium text-primary-foreground transition hover:bg-primary-400"
                >
                  {currentStep === EDITOR_TOUR_STEPS.length - 1 ? "Got it" : "Next"}
                  {currentStep < EDITOR_TOUR_STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
