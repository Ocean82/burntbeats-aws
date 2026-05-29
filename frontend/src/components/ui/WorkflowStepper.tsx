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
      {steps.map((step) => {
        const isActive = step.id === activeStepId;
        const isDone = completedStepIds.includes(step.id);
        return (
          <div
            key={step.id}
            role="listitem"
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "ui-stepper-step",
              isActive && "ui-stepper-step--active",
              isDone && !isActive && "ui-stepper-step--done",
            )}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
