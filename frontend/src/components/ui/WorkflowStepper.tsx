/**
 * WorkflowStepper — multi-step workflow indicator with animated progression,
 * connecting segments, completion check marks, and active-step glow.
 */
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../utils/cn";
import "./ui-panel.css";

export interface WorkflowStep {
  id: string;
  label: string;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  activeStepId: string;
  completedStepIds?: string[];
  className?: string;
  /** Overall progress percentage (0-100) for the underline track. */
  progressPercent?: number;
}

const STEP_TRANSITION = {
  type: "spring" as const,
  stiffness: 400,
  damping: 25,
  mass: 0.8,
};

export function WorkflowStepper({
  steps,
  activeStepId,
  completedStepIds = [],
  className,
  progressPercent = 0,
}: WorkflowStepperProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className={cn("ui-stepper", className)} role="list" aria-label="Workflow steps">
      {steps.map((step, idx) => {
        const isActive = step.id === activeStepId;
        const isDone = completedStepIds.includes(step.id);
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="ui-stepper-item">
            <motion.div
              role="listitem"
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "ui-stepper-step",
                isActive && "ui-stepper-step--active",
                isDone && !isActive && "ui-stepper-step--done",
              )}
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0.7 }}
              animate={{
                scale: isActive ? 1.04 : isDone ? 1 : 1,
                opacity: 1,
              }}
              transition={prefersReducedMotion ? { duration: 0 } : STEP_TRANSITION}
            >
              {isDone && !isActive ? (
                <motion.span
                  initial={prefersReducedMotion ? false : { rotate: -90, scale: 0.5 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 20 }}
                >
                  <Check className="ui-stepper-step__check" aria-hidden />
                </motion.span>
              ) : (
                <span className="ui-stepper-step__index" aria-hidden>
                  {idx + 1}
                </span>
              )}
              <span>{step.label}</span>
            </motion.div>

            {!isLast && (
              <div className="ui-stepper-connector-wrap">
                <div
                  className={cn(
                    "ui-stepper-connector",
                    isDone && "ui-stepper-connector--done",
                  )}
                  aria-hidden
                />
                {isActive && !prefersReducedMotion && (
                  <motion.div
                    className="ui-stepper-progress-underline"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.max(0, Math.min(100, progressPercent)) / 100 }}
                    transition={{
                      type: "tween",
                      duration: 0.4,
                      ease: "easeOut",
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
