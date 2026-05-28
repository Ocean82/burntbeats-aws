import React from "react";
import { cn } from "../utils/cn";
import { X, LayoutPanelLeft, CheckCircle2, Circle, Trophy } from "lucide-react";
import { useUiStore } from "../store/uiStore";
import { useOnboarding } from "../hooks/ui/useOnboarding";
import { useAppStore } from "../store/appStore";
import { useResolvedStems } from "../hooks/workflow/useResolvedStems";

export function SessionSidebar() {
  const { isSidebarOpen, setSidebarOpen } = useUiStore();
  const { uploadedFile, splitResultStems } = useAppStore();
  const { mixStems } = useResolvedStems();
  
  // Note: we'll need to pass hasCompletedFirstExport via store or context
  const hasCompletedFirstExport = false; 

  const { onboardingSteps } = useOnboarding({
    uploadedFile,
    splitResultStemsLength: splitResultStems.length,
    mixStemsLength: mixStems.length,
    hasCompletedFirstExport
  });

  if (!isSidebarOpen) {
    return (
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-4 top-1/2 z-40 -translate-y-1/2 rounded-full border border-white/10 bg-black/60 p-3 text-primary-400 backdrop-blur-md transition hover:bg-black/80 hover:scale-110 shadow-xl"
        title="Open Session Hub"
      >
        <LayoutPanelLeft className="h-6 w-6" />
      </button>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-80 hardware-panel border-r border-white/10 p-md flex flex-col gap-lg shadow-2xl animate-in slide-in-from-left duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-xs">
          <Trophy className="h-5 w-5 text-primary-400" />
          Session Hub
        </h2>
        <button 
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-col gap-md">
        <div className="space-y-xs">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Progress</p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-primary-500 transition-all duration-500 shadow-[0_0_8px_var(--primary-500)]"
              style={{
                width: `${
                  (onboardingSteps.filter((s) => s.done).length /
                    onboardingSteps.length) *
                  100
                }%`,
              }}
            />
          </div>
        </div>

        <nav className="flex flex-col gap-sm">
          {onboardingSteps.map((step) => (
            <div 
              key={step.id}
              className={cn(
                "flex items-center gap-sm rounded-xl p-sm transition-all",
                step.done ? "bg-primary-500/5 text-primary-100" : "bg-white/[0.02] text-muted-foreground"
              )}
            >
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-primary-400" />
              ) : (
                <Circle className="h-5 w-5 opacity-20" />
              )}
              <span className="text-sm font-medium">{step.label}</span>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-auto rounded-2xl bg-white/[0.03] p-md border border-white/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Unlock your full potential with a <span className="text-primary-300 font-bold">Pro</span> subscription. Get 4-stem split, HQ quality, and MIDI export.
        </p>
        <button className="mt-md w-full rounded-xl bg-primary-500 py-2.5 text-sm font-bold text-black hover:bg-primary-400 transition active:scale-95">
          Upgrade Now
        </button>
      </div>
    </aside>
  );
}
