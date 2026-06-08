/**
 * WorkflowStepper — multi-step workflow indicator with connecting segments,
 * animated active state, and completion check marks.
 */
import { Check } from "lucide-react";
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
}

export function WorkflowStepper({
  steps,
  activeStepId,
  completedStepIds = [],
  className,
}: WorkflowStepperProps) {
  return (
    <div className={cn("ui-stepper", className)} role="list" aria-label="Workflow steps">
      {steps.map((step, idx) => {
        const isActive = step.id === activeStepId;
        const isDone = completedStepIds.includes(step.id);
        const isLast = idx === steps.length - 1;

        // Connector is "done" if the current step is completed
        const connectorDone = isDone;

        return (
          <div key={step.id} className="ui-stepper-item">
            <div
              role="listitem"
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "ui-stepper-step",
                isActive && "ui-stepper-step--active",
                isDone && !isActive && "ui-stepper-step--done",
              )}
            >
              {isDone && !isActive && (
                <Check className="ui-stepper-step__check" aria-hidden />
              )}
              <span>{step.label}</span>
            </div>
            {!isLast && (
              <div
                className={cn(
                  "ui-stepper-connector",
                  connectorDone && "ui-stepper-connector--done",
                )}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
