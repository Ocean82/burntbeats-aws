import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Upload, Sliders, Music2, Download, Sparkles } from "lucide-react";
import { cn } from "../utils/cn";
import { useModalA11y } from "../hooks/useModalA11y";
import { useProductMotion } from "../motion/useProductMotion";
import { useAppEvent } from "../store/eventBus";

interface OnboardingTourProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

const TOUR_STEPS = [
  {
    icon: Sparkles,
    title: "Welcome to Burnt Beats",
    description: "Your AI-powered stem separation studio. Split any song into individual tracks in seconds.",
    tip: "Press ? anytime to see keyboard shortcuts",
  },
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
    title: "Mix Your Stems",
    description: "After splitting, adjust levels, pan, and trim each stem. Solo or mute tracks to perfect your mix.",
    tip: "Use number keys 1-4 to quickly solo stems",
  },
  {
    icon: Download,
    title: "Export Your Work",
    description: "Download individual stems or a mixed master. Choose your preferred format and quality.",
    tip: "Use Export in the mixer, or Ctrl+E (Mac: ⌘E)",
  },
];

const ONBOARDING_KEY = "burnt-beats-onboarding-complete";

export function OnboardingTour({
  onComplete = () => {},
  onSkip = () => {},
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const motionCfg = useProductMotion();

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage
      setIsVisible(true);
    }
  }, []);

  // Listen for the typed event bus signal to re-open the tour
  useAppEvent("open-onboarding", () => {
    setCurrentStep(0);
    setIsVisible(true);
  });

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setIsVisible(false);
    onSkip();
  };

  // Focus trap: keeps Tab cycling inside the modal and Escape closes it
  useModalA11y(isVisible, modalRef, handleSkip);

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const step = TOUR_STEPS[currentStep] as (typeof TOUR_STEPS)[number] & { target?: string };
  const Icon = step.icon;

  useLayoutEffect(() => {
    const target = (step as { target?: string }).target;
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
  }, [isVisible, currentStep, step]);

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
              "z-modal",
              spotlightRect ? "fixed inset-0 pointer-events-none" : "fixed inset-0 flex items-center justify-center p-md",
            )}
          >
            <motion.div
              ref={modalRef}
              style={anchoredStyle}
              className={cn(
                "relative overflow-y-auto rounded-3xl border border-border bg-popover/95 shadow-elevation-xl backdrop-blur-xl pointer-events-auto",
                spotlightRect ? "max-h-[min(70vh,400px)]" : "w-full max-w-md max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)]",
              )}
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-title"
              {...motionCfg.modalContent}
            >
              {/* Progress bar */}
              <div className="absolute left-0 right-0 top-0 h-1 bg-muted">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
                  transition={motionCfg.transition("normal")}
                />
              </div>

              {/* Skip button */}
              <button
                onClick={handleSkip}
                aria-label="Skip onboarding tour"
                title="Skip onboarding tour"
                className="tap-target-expand absolute right-md top-md flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Content */}
              <div className="p-lg pt-8 sm:p-xl sm:pt-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={motionCfg.reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={
                      motionCfg.reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, transition: motionCfg.transition("exit") }
                    }
                    transition={motionCfg.transition("fast")}
                    className="text-center"
                  >
                    {/* Icon */}
                    <div className="mx-auto mb-lg flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-400/10 shadow-elevation-md">
                      <Icon className="h-10 w-10 text-primary-400" strokeWidth={1.5} />
                    </div>

                    {/* Title */}
                    <h2 id="onboarding-title" className="mb-sm text-2xl font-bold text-foreground">{step.title}</h2>

                    {/* Description */}
                    <p className="text-readable text-readable-tight mb-md text-sm leading-relaxed text-secondary-foreground">{step.description}</p>

                    {/* Tip */}
                    <div className="mx-auto inline-flex max-w-full items-center gap-xs rounded-full bg-primary-500/10 px-md py-xs text-xs text-primary-200">
                      <Sparkles className="h-3 w-3" />
                      <span className="text-readable text-readable-tight text-center">{step.tip}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between border-t border-border p-md">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className={cn(
                    "tap-feedback flex min-h-[44px] items-center gap-2xs rounded-lg px-md py-xs text-sm transition-[color,background-color,transform] duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed",
                    currentStep === 0
                      ? "text-muted-foreground/40"
                      : "text-secondary-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>

                {/* Step indicators */}
                <div className="flex items-center gap-xs">
                  {TOUR_STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      aria-label={`Go to step ${index + 1} of ${TOUR_STEPS.length}`}
                      title={`Step ${index + 1} of ${TOUR_STEPS.length}`}
                      className={cn(
                        "h-3 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        index === currentStep
                          ? "w-6 bg-primary-400"
                          : index < currentStep
                          ? "w-3 bg-primary-400/50"
                          : "w-3 bg-muted hover:bg-secondary"
                      )}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={nextStep}
                  className="tap-feedback flex min-h-[44px] items-center gap-2xs rounded-lg bg-primary px-md py-xs text-sm font-medium text-primary-foreground transition-[color,background-color,transform] duration-(--motion-fast) hover:bg-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? "Get Started" : "Next"}
                  {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// Hook to reset onboarding (for testing or user request)
export function useResetOnboarding() {
  return () => {
    localStorage.removeItem(ONBOARDING_KEY);
    window.location.reload();
  };
}
