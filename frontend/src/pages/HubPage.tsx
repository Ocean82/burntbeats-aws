import { useLocation } from "wouter";
import {
  Upload,
  Music,
  Mic,
  Piano,
  Guitar,
  Sparkles,
  FolderOpen,
  Headphones,
  Zap,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { useStemHistory } from "@/hooks/useStemHistory";
import { useToolUsage } from "@/hooks/useToolUsage";
import type { ToolId } from "@/hooks/useToolUsage";
import type { StemHistoryJob } from "@/api/stemHistory";
import {
  HubHeader,
  HubStats,
  PrimaryActionCard,
  SecondaryToolCard,
} from "@/components/hub";

export function HubPage() {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { jobs, isLoading, totalJobs } = useStemHistory();
  const { touch, hasUsed } = useToolUsage();

  const hasActivity = jobs.length > 0;
  const firstName = user?.firstName || "Creator";

  const completedCount = jobs.filter((j) => j.status === "completed").length;

  const handleNavigate = (path: string, toolId: ToolId) => {
    touch(toolId);
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section
        className="px-6 pt-12 pb-8 md:px-12 lg:px-16"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 500px" }}
      >
        <div className="max-w-7xl mx-auto">
          <HubHeader firstName={firstName}>
            {hasActivity && !isLoading && (
              <HubStats
                stemsSeparated={totalJobs}
                completed={completedCount}
              />
            )}
          </HubHeader>

          {/* Primary Action Cards - Asymmetric Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
            <PrimaryActionCard
              headline="Separate Stems"
              subhead="Extract vocals, drums, bass, and more from any audio track. Perfect for karaoke, remixing, or sampling."
              cta="Start Splitting"
              stemColor="vocals"
              onClick={() => handleNavigate("/editor", "editor")}
              className="lg:col-span-7"
              isNew={!hasUsed("editor")}
              icon={<Upload className="w-6 h-6" style={{ color: "var(--stem-vocals)" }} strokeWidth={1.5} />}
            />

            <div className="lg:col-span-5 flex flex-col gap-6">
              <PrimaryActionCard
                headline="Make Beats"
                subhead="Step sequencer with pattern presets and MIDI export"
                cta="Open Beat Maker"
                stemColor="drums"
                onClick={() => handleNavigate("/beats?tab=drums", "beats")}
                isNew={!hasUsed("beats")}
                icon={<Music className="w-5 h-5" style={{ color: "var(--stem-drums)" }} strokeWidth={1.5} />}
              />

              <PrimaryActionCard
                headline="Audio to MIDI"
                subhead="Convert any recording to editable MIDI notation"
                cta="Start Converting"
                stemColor="melody"
                onClick={() => handleNavigate("/midi", "midi")}
                isNew={!hasUsed("midi")}
                icon={<Piano className="w-5 h-5" style={{ color: "var(--accent-midi)" }} strokeWidth={1.5} />}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Secondary Tools Grid */}
      <section
        className="px-6 pb-12 md:px-12 lg:px-16"
        style={{ contentVisibility: "auto", containIntrinsicSize: "0 400px" }}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="text-xl font-semibold text-foreground mb-5">
            Additional Tools
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SecondaryToolCard
              icon={<Mic className="w-5 h-5" />}
              label="Clean Speech"
              description="Remove background noise"
              onClick={() => handleNavigate("/speech", "speech")}
            />
            <SecondaryToolCard
              icon={<Guitar className="w-5 h-5" />}
              label="Guitar Tuner"
              description="Visual pitch tuner"
              onClick={() => handleNavigate("/tuner", "tuner")}
            />
            <SecondaryToolCard
              icon={<Sparkles className="w-5 h-5" />}
              label="MIDI Catalog"
              description="Browse patterns & templates"
              onClick={() => handleNavigate("/beats", "beats")}
            />
            <SecondaryToolCard
              icon={<FolderOpen className="w-5 h-5" />}
              label="My Library"
              description="Your stems & downloads"
              onClick={() => handleNavigate("/library", "my-stems")}
            />
          </div>
        </div>
      </section>

      {/* Recent Work - Only if user has activity */}
      {hasActivity && !isLoading && (
        <section
          className="px-6 pb-16 md:px-12 lg:px-16"
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "0 200px",
          }}
        >
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl font-semibold text-foreground mb-5">
              Recent Work
            </h2>

            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {jobs.slice(0, 8).map((job) => (
                <RecentWorkCard
                  key={job.job_id}
                  job={job}
                  onClick={() => handleNavigate("/library", "my-stems")}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty State for New Users */}
      {!hasActivity && !isLoading && (
        <section className="px-6 pb-16 md:px-12 lg:px-16">
          <div className="max-w-7xl mx-auto">
            <div className="rounded-2xl bg-surface-raised border border-border p-10 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "var(--brand-accent-soft)" }}
              >
                <Zap
                  className="w-8 h-8"
                  style={{ color: "var(--brand-accent)" }}
                />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Ready to create?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Start by separating stems from your favorite track, or jump into
                beat making and MIDI conversion.
              </p>
              <button
                type="button"
                onClick={() => handleNavigate("/editor", "editor")}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-primary-foreground transition-colors"
                style={{
                  background:
                    "linear-gradient(135deg, var(--primary-500), var(--primary-600))",
                }}
              >
                <Upload className="w-5 h-5" />
                Separate Your First Track
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// Kept internal for now; can be extracted once recent-work data shape stabilizes.
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
  const stemCount = job.stem_files.length || job.stems || 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 w-48 rounded-xl bg-surface-raised border border-border hover:border-primary-500/40 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left overflow-hidden group"
    >
      <div className="aspect-[16/10] bg-surface-base flex items-center justify-center border-b border-border">
        <Headphones className="w-7 h-7 text-muted-foreground" />
      </div>

      <div className="p-3">
        <div className="font-medium text-sm text-foreground truncate mb-1">
          {job.original_filename || "Untitled"}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{stemCount} stems</span>
          <span className="text-border">|</span>
          <span className="tabular-nums">{dateStr}</span>
        </div>
      </div>
    </button>
  );
}
