import { useState } from "react";
import { Zap, Sparkles, Music, Users, ArrowLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import { useSubscription } from "@/hooks/useSubscription";
import { useUsageBalance } from "@/hooks/useUsageBalance";
import { TokenMeter } from "@/components/TokenMeter";
import type { AppPhase } from "@/types/phases";
import type { SplitQuality } from "@/api";

export interface ConfigurePhaseProps {
  transitionTo: (next: AppPhase) => void;
  fileName: string;
  onConfigure: (config: { quality: SplitQuality; stemCount: 2 | 4 }) => void;
  onChangeFile: () => void;
}

const qualityOptions: Array<{
  value: SplitQuality;
  label: string;
  description: string;
  icon: typeof Zap;
}> = [
  {
    value: "speed",
    label: "Fast",
    description: "Fastest turnaround",
    icon: Zap,
  },
  {
    value: "quality",
    label: "Quality",
    description: "Cleaner separation",
    icon: Sparkles,
  },
];

const stemCountOptions: Array<{
  value: 2 | 4;
  label: string;
  description: string;
  icon: typeof Music;
}> = [
  {
    value: 2,
    label: "2 stems",
    description: "Vocals + instrumental",
    icon: Users,
  },
  {
    value: 4,
    label: "4 stems",
    description: "Vocals, drums, bass, other",
    icon: Music,
  },
];

/** Configure phase — quality selector, stem count options, split action button. */
export function ConfigurePhase({
  transitionTo,
  fileName,
  onConfigure,
  onChangeFile,
}: ConfigurePhaseProps) {
  const subscription = useSubscription();
  const { freeMonthlyRemaining, loading: usageLoading } = useUsageBalance(true);
  const [quality, setQuality] = useState<SplitQuality>("quality");
  const [stemCount, setStemCount] = useState<2 | 4>(2);

  function handleSplit() {
    onConfigure({ quality, stemCount });
    transitionTo("splitting");
  }

  return (
    <div
      data-testid="configure-phase"
      className="flex min-h-full flex-1 items-center justify-center p-md"
    >
      <div className="flex w-full max-w-md flex-col gap-lg rounded-2xl border border-border bg-muted/60 p-lg backdrop-blur-sm">
        {/* File context */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Ready to split</p>
          <p
            className="mt-1 truncate text-base font-medium text-foreground"
            title={fileName}
          >
            {fileName}
          </p>
          <button
            type="button"
            onClick={onChangeFile}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-primary-300"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Choose a different file
          </button>
        </div>

        <TokenMeter
          freeTokensRemaining={freeMonthlyRemaining}
          isPaidUser={subscription.status === "active"}
          usageLoading={usageLoading}
          onUpgrade={() => window.dispatchEvent(new CustomEvent("open-pricing-tab"))}
        />

        {/* Quality selector */}
        <fieldset className="flex flex-col gap-sm">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quality
          </legend>
          <div className="grid grid-cols-2 gap-sm">
            {qualityOptions.map((opt) => {
              const Icon = opt.icon;
              const isActive = quality === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQuality(opt.value)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex flex-col items-center gap-2xs rounded-xl border px-md py-sm text-center transition",
                    isActive
                      ? "border-primary-500/50 bg-primary-500/20 text-primary-200"
                      : "border-border bg-muted text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Stem count selector */}
        <fieldset className="flex flex-col gap-sm">
          <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Stem count
          </legend>
          <div className="grid grid-cols-2 gap-sm">
            {stemCountOptions.map((opt) => {
              const Icon = opt.icon;
              const isActive = stemCount === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStemCount(opt.value)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex flex-col items-center gap-2xs rounded-xl border px-md py-sm text-center transition",
                    isActive
                      ? "border-primary-500/50 bg-primary-500/20 text-primary-200"
                      : "border-border bg-muted text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs opacity-70">{opt.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Split action button */}
        <button
          type="button"
          data-testid="split-button"
          onClick={handleSplit}
          className="mt-sm min-h-[44px] w-full rounded-xl bg-primary-500 px-lg py-sm text-sm font-semibold text-white transition hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
        >
          Split
        </button>
      </div>
    </div>
  );
}
