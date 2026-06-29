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
import type { StemHistoryJob } from "@/api/stemHistory";

export function HubPage() {
  const [, navigate] = useLocation();
  const { user } = useUser();
  const { jobs, isLoading, totalJobs } = useStemHistory();

  const hasActivity = jobs.length > 0;
  const firstName = user?.firstName || "Creator";

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const completedCount = jobs.filter((j) => j.status === "completed").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="px-6 pt-12 pb-8 md:px-12 lg:px-16">
        <div className="max-w-7xl mx-auto">
          {/* Welcome + Stats */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-2">
                Welcome back, {firstName}
              </h1>
              <p className="text-muted-foreground text-lg">
                What are you creating today?
              </p>
            </div>

            {/* Quick Stats - only if user has activity */}
            {hasActivity && !isLoading && (
              <div className="flex gap-6 md:gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums text-primary-500">
                    {totalJobs}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Stems Separated
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums text-ice-500">
                    {completedCount}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Completed
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Cards - Asymmetric Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-12">
            {/* Large Card: Stem Separator */}
            <button
              type="button"
              onClick={() => handleNavigate("/editor")}
              className="lg:col-span-7 group relative overflow-hidden rounded-2xl bg-surface-raised border border-border hover:border-primary-500/50 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left"
              style={{ minHeight: 240 }}
            >
              {/* Thermal glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, var(--stem-vocals-soft) 0%, transparent 60%)",
                  }}
                />
              </div>

              <div className="relative p-8 h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-6">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: "var(--stem-vocals-soft)",
                      }}
                    >
                      <Upload
                        className="w-6 h-6"
                        style={{ color: "var(--stem-vocals)" }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Isolate & Remix
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Separate Stems
                  </h2>
                  <p className="text-muted-foreground leading-relaxed max-w-md">
                    Extract vocals, drums, bass, and more from any audio track.
                    Perfect for karaoke, remixing, or sampling.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-primary-500 font-medium mt-6">
                  <span>Start Splitting</span>
                  <svg
                    className="w-4 h-4 transition-transform group-hover:translate-x-1"
                    style={{
                      transitionDuration: "var(--motion-normal)",
                      transitionTimingFunction: "var(--ease-out-quart)",
                    }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </button>

            {/* Stacked Cards: Beat Maker + MIDI Converter */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Beat Maker */}
              <button
                type="button"
                onClick={() => handleNavigate("/beats")}
                className="group relative overflow-hidden rounded-2xl bg-surface-raised border border-border hover:border-[var(--stem-drums)]/50 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left flex-1"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, var(--stem-drums-soft) 0%, transparent 60%)",
                    }}
                  />
                </div>

                <div className="relative p-6 h-full flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: "var(--stem-drums-soft)" }}
                    >
                      <Music
                        className="w-5 h-5"
                        style={{ color: "var(--stem-drums)" }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Create
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-1">
                      Make Beats
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Step sequencer with pattern presets and MIDI export
                    </p>
                  </div>
                </div>
              </button>

              {/* MIDI Converter */}
              <button
                type="button"
                onClick={() => handleNavigate("/midi")}
                className="group relative overflow-hidden rounded-2xl bg-surface-raised border border-border hover:border-[var(--accent-midi)]/50 transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left flex-1"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, var(--accent-midi-muted) 0%, transparent 60%)",
                    }}
                  />
                </div>

                <div className="relative p-6 h-full flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: "var(--accent-midi-muted)" }}
                    >
                      <Piano
                        className="w-5 h-5"
                        style={{ color: "var(--accent-midi)" }}
                        strokeWidth={1.5}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Transcribe
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground mb-1">
                      Audio to MIDI
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Convert any recording to editable MIDI notation
                    </p>
                  </div>
                </div>
              </button>
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
            <ToolCard
              icon={<Mic className="w-5 h-5" />}
              label="Clean Speech"
              description="Remove background noise"
              accentColor="var(--ice-500)"
              accentBg="var(--accent-info-soft)"
              onClick={() => handleNavigate("/speech")}
            />
            <ToolCard
              icon={<Guitar className="w-5 h-5" />}
              label="Guitar Tuner"
              description="Visual pitch tuner"
              accentColor="var(--success)"
              accentBg="var(--success-muted)"
              onClick={() => handleNavigate("/tuner")}
            />
            <ToolCard
              icon={<Sparkles className="w-5 h-5" />}
              label="MIDI Catalog"
              description="Browse patterns & templates"
              accentColor="var(--accent-midi)"
              accentBg="var(--accent-midi-muted)"
              onClick={() => handleNavigate("/beats")}
            />
            <ToolCard
              icon={<FolderOpen className="w-5 h-5" />}
              label="My Library"
              description="Your stems & downloads"
              accentColor="var(--ice-500)"
              accentBg="var(--accent-info-soft)"
              onClick={() => handleNavigate("/my-stems")}
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
                  onClick={() => handleNavigate(`/my-stems`)}
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
                onClick={() => handleNavigate("/editor")}
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

// Secondary tool card
function ToolCard({
  icon,
  label,
  description,
  accentColor,
  accentBg,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  accentColor: string;
  accentBg: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-xl bg-surface-raised border border-border transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left p-4"
      style={{ minHeight: 96 }}
    >
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at top left, ${accentBg} 0%, transparent 70%)`,
          transitionDuration: "var(--motion-normal)",
        }}
      />

      <div className="relative">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors"
          style={{ background: accentBg, color: accentColor }}
        >
          {icon}
        </div>
        <div className="font-medium text-sm text-foreground leading-tight">
          {label}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {description}
        </div>
      </div>
    </button>
  );
}

// Recent work card
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
