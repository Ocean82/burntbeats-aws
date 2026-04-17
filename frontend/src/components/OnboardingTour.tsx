import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft, Upload, Sliders, Music2, Download, Sparkles } from "lucide-react";
import { cn } from "../utils/cn";

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
  },
  {
    icon: Sliders,
    title: "Configure Your Split",
    description: "First split gives vocals + instrumental. Use \"Keep going\" to split the instrumental into drums, bass & other.",
    tip: "Use 'Quality' mode for best results",
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
    tip: "Press Cmd/Ctrl + E for quick export",
  },
];

const ONBOARDING_KEY = "burnt-beats-onboarding-complete";

export function OnboardingTour({
  onComplete = () => {},
  onSkip = () => {},
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setIsVisible(true);
    }
  }, []);

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

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-[#1a1412]/95 shadow-2xl backdrop-blur-xl max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2rem)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-title"
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Progress bar */}
              <div className="absolute left-0 right-0 top-0 h-1 bg-white/10">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / TOUR_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Skip button */}
              <button
                onClick={handleSkip}
                aria-label="Skip onboarding tour"
                title="Skip onboarding tour"
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-lg bg-white/5 text-white/40 transition hover:bg-white/10 hover:text-white sm:h-8 sm:w-8"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Content */}
              <div className="p-6 pt-8 sm:p-8 sm:pt-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="text-center"
                  >
                    {/* Icon */}
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 shadow-lg">
                      <Icon className="h-10 w-10 text-amber-400" strokeWidth={1.5} />
                    </div>

                    {/* Title */}
                    <h2 id="onboarding-title" className="mb-3 text-2xl font-bold text-white">{step.title}</h2>

                    {/* Description */}
                    <p className="mb-4 text-sm leading-relaxed text-white/70">{step.description}</p>

                    {/* Tip */}
                    <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
                      <Sparkles className="h-3 w-3" />
                      {step.tip}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between border-t border-white/10 p-4">
                <button
                  onClick={prevStep}
                  disabled={currentStep === 0}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-4 py-2 text-sm transition",
                    currentStep === 0
                      ? "text-white/20"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>

                {/* Step indicators */}
                <div className="flex items-center gap-2">
                  {TOUR_STEPS.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentStep(index)}
                      aria-label={`Go to step ${index + 1} of ${TOUR_STEPS.length}`}
                      title={`Step ${index + 1} of ${TOUR_STEPS.length}`}
                      className={cn(
                        "h-3 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60",
                        index === currentStep
                          ? "w-6 bg-amber-400"
                          : index < currentStep
                          ? "w-3 bg-amber-400/50"
                          : "w-3 bg-white/20 hover:bg-white/40"
                      )}
                    />
                  ))}
                </div>

                <button
                  onClick={nextStep}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? "Get Started" : "Next"}
                  {currentStep < TOUR_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>
          </motion.div>
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
