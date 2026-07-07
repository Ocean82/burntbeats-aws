import { useLocation } from "wouter";
import type { ComponentType, CSSProperties, SVGProps } from "react";
import { useEffect } from "react";
import {
  Upload,
  Music,
  Mic,
  Piano,
  Guitar,
  Sparkles,
  FolderOpen,
  Headphones,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { useStemHistory } from "@/hooks/useStemHistory";
import { useFirstRunMode } from "@/hooks/useFirstRunMode";
import { useMidiHistory } from "@/hooks/useMidiHistory";
import { useToolUsage } from "@/hooks/useToolUsage";
import { useHubKeyboardNav } from "@/hooks/useHubKeyboardNav";
import type { StemHistoryJob } from "@/api/stemHistory";
import {
  getPrimaryTools,
  getSecondaryTools,
  getTool,
  type ToolCatalogId,
  type ToolDefinition,
} from "@/data/toolCatalog";
import {
  HubHeader,
  HubStats,
  PrimaryActionCard,
  SecondaryToolCard,
} from "@/components/hub";
import { Skeleton } from "@/components/ui/skeleton";

const TOOL_ICONS: Record<ToolCatalogId, ComponentType<SVGProps<SVGSVGElement>>> = {
  editor: Upload,
  beats: Music,
  midi: Piano,
  speech: Mic,
  tuner: Guitar,
  patterns: Sparkles,
  "my-stems": FolderOpen,
};

const ICON_COLORS: Partial<Record<ToolCatalogId, string>> = {
  editor: "var(--stem-vocals)",
  beats: "var(--stem-drums)",
  midi: "var(--accent-midi)",
};

function renderToolIcon(tool: ToolDefinition, size: "lg" | "sm") {
  const Icon = TOOL_ICONS[tool.id];
  const color = ICON_COLORS[tool.id];
  const className = size === "lg" ? "w-6 h-6" : "w-5 h-5";
  const style: CSSProperties | undefined = color ? { color } : undefined;
  return <Icon className={className} style={style} strokeWidth={1.5} />;
}

export function HubPage() {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const firstRunMode = useFirstRunMode();
  const { jobs, isLoading, totalJobs } = useStemHistory();
  const { records: midiRecords, isLoading: midiLoading } = useMidiHistory();
  const { touch, hasUsed } = useToolUsage();
  useHubKeyboardNav(true);

  useEffect(() => {
    if (!firstRunMode) return;
    const meta = user?.unsafeMetadata as Record<string, unknown> | undefined;
    if (meta?.planPickerSeen !== true) return;
    navigate("/editor");
  }, [firstRunMode, user, navigate]);

  const hasActivity = jobs.length > 0;
  const firstName = user?.firstName || "Creator";
  const completedCount = jobs.filter((j) => j.status === "completed").length;

  const primaryTools = getPrimaryTools();
  const secondaryTools = getSecondaryTools();
  const [heroTool, ...sideTools] = primaryTools;

  const handleNavigate = (tool: ToolDefinition) => {
    touch(tool.usageId);
    navigate(tool.route);
  };

  return (
    <div className="min-h-screen bg-background">
      <section
        className="px-6 pt-8 pb-8 md:px-12 lg:px-16"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 500px" }}
      >
        <div className="max-w-7xl mx-auto">
          <HubHeader firstName={firstName}>
            {isLoading ? (
              <div className="flex gap-6 md:gap-8" aria-busy="true" aria-label="Loading activity stats">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="text-center">
                    <Skeleton className="mx-auto h-9 w-12" />
                    <Skeleton variant="line" className="mx-auto mt-2 h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : hasActivity ? (
              <HubStats
                songsSplit={totalJobs}
                finished={completedCount}
                midiConverted={!midiLoading ? midiRecords.length : undefined}
              />
            ) : null}
          </HubHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
            {heroTool ? (
              <PrimaryActionCard
                headline={heroTool.primaryName}
                nickname={heroTool.nickname}
                subhead={heroTool.description}
                cta={heroTool.cta}
                stemColor={heroTool.stemColor ?? "vocals"}
                onClick={() => handleNavigate(heroTool)}
                className="lg:col-span-7"
                isNew={!hasUsed(heroTool.usageId)}
                tourId={heroTool.tourId}
                icon={renderToolIcon(heroTool, "lg")}
              />
            ) : null}

            <div className="lg:col-span-5 flex flex-col gap-6">
              {sideTools.map((tool) => (
                <PrimaryActionCard
                  key={tool.id}
                  headline={tool.primaryName}
                  nickname={tool.nickname}
                  subhead={tool.description}
                  cta={tool.cta}
                  stemColor={tool.stemColor ?? "vocals"}
                  onClick={() => handleNavigate(tool)}
                  isNew={!hasUsed(tool.usageId)}
                  tourId={tool.tourId}
                  icon={renderToolIcon(tool, "sm")}
                />
              ))}
            </div>
          </div>

          {!hasActivity && !isLoading ? (
            <p className="text-sm text-muted-foreground mb-2">
              New here? Start with {getTool("editor").primaryName}.
            </p>
          ) : null}
        </div>
      </section>

      <section
        className="px-6 pb-12 md:px-12 lg:px-16"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 400px" }}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl font-semibold text-foreground mb-5">Quick Tools</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {secondaryTools.map((tool) => (
              <SecondaryToolCard
                key={tool.id}
                label={tool.primaryName}
                nickname={tool.nickname}
                description={tool.description}
                tourId={tool.tourId}
                onClick={() => handleNavigate(tool)}
                icon={renderToolIcon(tool, "sm")}
              />
            ))}
          </div>
        </div>
      </section>

      {hasActivity && !isLoading ? (
        <section
          className="px-6 pb-16 md:px-12 lg:px-16"
          style={{ contentVisibility: "auto", containIntrinsicSize: "0 200px" }}
        >
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl font-semibold text-foreground mb-5">Recent Work</h2>

            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {jobs.slice(0, 8).map((job) => (
                <RecentWorkCard
                  key={job.job_id}
                  job={job}
                  onClick={() => handleNavigate(getTool("my-stems"))}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-6 pb-16 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto text-center">
          <button
            type="button"
            onClick={() => navigate("/referral")}
            className="text-sm text-muted-foreground underline underline-offset-4 transition hover:text-primary-200"
          >
            Invite producer friends — earn bonus tokens
          </button>
        </div>
      </section>
    </div>
  );
}

function RecentWorkCard({
  job,
  onClick,
}: {
  job: StemHistoryJob;
  onClick: () => void;
}) {
  const dateStr = new Date(job.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const trackCount = job.stem_files.length || job.stems || 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${job.original_filename || "Untitled"} in My Stems`}
      className="surface-card-button flex-shrink-0 w-48 rounded-xl bg-surface-raised border border-border hover:border-primary-500/40 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left overflow-hidden group"
    >
      <div className="aspect-[16/10] bg-surface-base flex items-center justify-center border-b border-border">
        <Headphones className="w-7 h-7 text-muted-foreground" />
      </div>

      <div className="p-3">
        <div className="font-medium text-sm text-foreground truncate mb-1">
          {job.original_filename || "Untitled"}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{trackCount} tracks</span>
          <span className="text-border">|</span>
          <span className="tabular-nums">{dateStr}</span>
        </div>
      </div>
    </button>
  );
}
