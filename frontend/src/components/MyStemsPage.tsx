/**
 * MyStemsPage — User-facing "My Stems" page for browsing and re-downloading
 * previously separated stems from S3.
 *
 * Features:
 * - Storage overview (total jobs, stems, storage used)
 * - Client-side search by original filename
 * - Client-side sort (date, name, stem count)
 * - Expandable job cards with Framer Motion animations
 * - Individual stem download via presigned S3 URLs
 * - "Download All" ZIP bundle via JSZip
 * - Mobile-optimized with sequential fetching for ZIP
 */
import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { collapseMotion } from "../motion/presets";
import {
  Download,
  Music,
  Package,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  ArrowLeft,
  Loader2,
  SlidersHorizontal,
  Archive,
} from "lucide-react";
import { EmptyState } from "./ui/empty-state";
import { ErrorState } from "./ui/error-state";
import { useStemHistory } from "../hooks/useStemHistory";
import { useMidiHistory } from "../hooks/useMidiHistory";
import { API_BASE } from "../config";
import { authHeaders } from "../api/auth";
import { fetchStemWavAsBlob } from "../api/stems";
import { downloadBlob, isTouchDevice } from "../utils/downloadHelper";
import { MyStemsPageSkeleton } from "./MyStemsPageSkeleton";
import { SharePreviewButton } from "./SharePreviewButton";
import { useToast } from "../store/toastStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MyStemsPageProps {
  onClose: () => void;
  onOpenInMixer?: (job: import("../api/stemHistory").StemHistoryJob) => void;
  onOpenInMidi?: (job: import("../api/stemHistory").StemHistoryJob) => void;
  loadingMixerJobId?: string | null;
  loadingMidiJobId?: string | null;
}

type SortOption =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "stems-desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "stems-desc", label: "Most stems" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format bytes into a human-readable string (e.g. "35.2 MB"). */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/** Format an ISO date string as a relative time (e.g. "2 days ago"). */
function formatRelativeDate(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  if (diffWeek < 5) return `${diffWeek} week${diffWeek === 1 ? "" : "s"} ago`;
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MyStemsPage({
  onClose,
  onOpenInMixer,
  onOpenInMidi,
  loadingMixerJobId = null,
  loadingMidiJobId = null,
}: MyStemsPageProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const collapse = collapseMotion(reduceMotion);
  const { toast } = useToast();
  const {
    jobs,
    isLoading,
    error,
    totalJobs,
    totalStems,
    totalStorageBytes,
    refetch,
  } = useStemHistory();
  const { records: midiRecords } = useMidiHistory();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>(
    {},
  );
  const [isZipping, setIsZipping] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Filtering & Sorting
  // -------------------------------------------------------------------------

  const filteredAndSortedJobs = useMemo(() => {
    let result = jobs;

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((job) =>
        (job.original_filename ?? "").toLowerCase().includes(q),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "date-asc":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "name-asc":
          return (a.original_filename ?? "").localeCompare(
            b.original_filename ?? "",
          );
        case "name-desc":
          return (b.original_filename ?? "").localeCompare(
            a.original_filename ?? "",
          );
        case "stems-desc":
          return b.stem_files.length - a.stem_files.length;
        default:
          return 0;
      }
    });

    return result;
  }, [jobs, searchQuery, sortBy]);

  // -------------------------------------------------------------------------
  // Download Handlers
  // -------------------------------------------------------------------------

  const handleDownloadStem = useCallback(
    async (jobId: string, stemName: string, fileUrl: string) => {
      const key = `${jobId}:${stemName}`;
      setIsDownloading((prev) => ({ ...prev, [key]: true }));
      try {
        const blob = await fetchStemWavAsBlob(fileUrl);
        await downloadBlob(blob, `${stemName}.wav`);
      } catch (err) {
        console.error("Stem download failed:", err);
        toast(`Failed to download ${stemName}`, { type: "error" });
      } finally {
        setIsDownloading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [toast],
  );

  const handleDownloadAll = useCallback(
    async (jobId: string) => {
      const job = jobs.find((j) => j.job_id === jobId);
      if (!job) return;

      const availableStems = job.stem_files.filter(
        (s) =>
          s.available &&
          typeof s.file_url === "string" &&
          s.file_url.length > 0,
      );
      if (availableStems.length === 0) return;

      setIsZipping(jobId);
      try {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const mobile = isTouchDevice();

        if (mobile) {
          // Sequential fetching on mobile to reduce memory pressure
          for (const stem of availableStems) {
            const blob = await fetchStemWavAsBlob(stem.file_url);
            zip.file(`${stem.stem_name}.wav`, blob);
          }
        } else {
          // Parallel fetching on desktop
          const downloads = await Promise.all(
            availableStems.map(async (stem) => {
              const blob = await fetchStemWavAsBlob(stem.file_url);
              return { name: stem.stem_name, blob };
            }),
          );
          for (const { name, blob } of downloads) {
            zip.file(`${name}.wav`, blob);
          }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const filename = job.original_filename
          ? `${job.original_filename.replace(/\.[^.]+$/, "")}-stems.zip`
          : `stems-${jobId.slice(0, 8)}.zip`;
        await downloadBlob(zipBlob, filename);
      } catch (err) {
        console.error("ZIP download failed:", err);
        toast("Failed to create ZIP bundle", { type: "error" });
      } finally {
        setIsZipping(null);
      }
    },
    [jobs, toast],
  );

  const handleDownloadMidi = useCallback(
    async (midiJobId: string, stemName: string | null) => {
      const key = `midi:${midiJobId}`;
      setIsDownloading((prev) => ({ ...prev, [key]: true }));
      try {
        const url = `${API_BASE}/api/midi/file/${midiJobId}/output.mid`;
        const response = await fetch(url, { headers: await authHeaders() });
        if (!response.ok) {
          if (response.status === 403) {
            throw new Error("You do not have access to this MIDI file");
          }
          if (response.status === 404) {
            throw new Error("This MIDI file is no longer available");
          }
          if (response.status === 503) {
            throw new Error("MIDI storage is temporarily unavailable");
          }
          throw new Error("MIDI download failed");
        }
        const blob = await response.blob();
        const filename = stemName
          ? `${stemName}.mid`
          : `midi-${midiJobId.slice(0, 8)}.mid`;
        await downloadBlob(blob, filename);
      } catch (err) {
        console.error("MIDI download failed:", err);
        const message =
          err instanceof Error ? err.message : "Failed to download MIDI file";
        toast(message, { type: "error" });
      } finally {
        setIsDownloading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [toast],
  );

  // -------------------------------------------------------------------------
  // Render: Loading State
  // -------------------------------------------------------------------------

  if (isLoading) {
    return <MyStemsPageSkeleton />;
  }

  // -------------------------------------------------------------------------
  // Render: Error State
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-popover p-md">
        <ErrorState
          variant="server"
          title="Couldn't load your stems"
          description={error}
          onRetry={refetch}
        />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Empty State
  // -------------------------------------------------------------------------

  if (totalJobs === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-popover">
        <header className="flex items-center gap-sm border-b border-border p-md sm:p-lg">
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Back to editor"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">My Stems</h1>
        </header>
        <div className="flex flex-1 items-center justify-center p-md">
          <EmptyState
            icon={<Archive className="h-6 w-6" />}
            title="No stems yet"
            description="Split your first track — your separated stems will appear here for easy re-download"
            action={{ label: "Split Your First Track", onClick: onClose }}
          />
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Main Page
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-popover">
      {/* Header */}
      <header className="flex items-center gap-sm border-b border-border p-md sm:p-lg">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Back to editor"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">My Stems</h1>
      </header>

      <main className="flex-1 p-md sm:p-lg">
        {/* Storage Overview */}
        <section
          aria-label="Storage overview"
          className="mb-lg grid grid-cols-3 gap-sm"
        >
          <div className="rounded-2xl border border-border bg-popover/95 p-sm sm:p-md">
            <div className="flex items-center gap-xs text-muted-foreground">
              <Package className="h-4 w-4" />
              <span className="text-xs">Jobs</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {totalJobs}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-popover/95 p-sm sm:p-md">
            <div className="flex items-center gap-xs text-muted-foreground">
              <Music className="h-4 w-4" />
              <span className="text-xs">Stems</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {totalStems}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-popover/95 p-sm sm:p-md">
            <div className="flex items-center gap-xs text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Storage</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatBytes(totalStorageBytes)}
            </p>
          </div>
        </section>

        {/* Search & Sort Controls */}
        <section className="mb-md flex flex-col gap-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename…"
              aria-label="Search stems by filename"
              className="w-full rounded-xl border border-border bg-muted py-sm pl-10 pr-md text-sm text-foreground placeholder:text-placeholder-foreground outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-visible:border-primary-400/50 focus-visible:ring-2 focus-visible:ring-primary-400/30"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort stems"
            className="min-h-[44px] rounded-xl border border-border bg-muted px-sm py-sm text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-visible:border-primary-400/50 focus-visible:ring-2 focus-visible:ring-primary-400/30"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>

        {/* Job Cards */}
        <section aria-label="Stem separation jobs">
          {filteredAndSortedJobs.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs match your search.
              </p>
            </div>
          ) : (
            <div className="space-y-sm">
              {filteredAndSortedJobs.map((job) => {
                const isExpanded = expandedJobId === job.job_id;
                const detailsId = `job-details-${job.job_id}`;
                const availableStems = job.stem_files.filter(
                  (s) =>
                    s.available &&
                    typeof s.file_url === "string" &&
                    s.file_url.length > 0,
                );
                const jobZipping = isZipping === job.job_id;
                const jobMidiRecords = midiRecords.filter(
                  (r) => r.stem_job_id === job.job_id,
                );
                const hasMidi = jobMidiRecords.length > 0;

                return (
                  <div
                    key={job.job_id}
                    className="overflow-hidden rounded-3xl border border-border bg-popover/95"
                  >
                    {/* Card Header (clickable) */}
                    <button
                      onClick={() =>
                        setExpandedJobId(isExpanded ? null : job.job_id)
                      }
                      className="flex w-full items-center justify-between gap-sm p-md text-left transition hover:bg-muted sm:p-lg"
                      aria-expanded={isExpanded ? "true" : "false"}
                      aria-controls={detailsId}
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-foreground">
                          {job.original_filename || "Untitled"}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-xs">
                          <span className="flex items-center gap-2xs text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatRelativeDate(job.created_at)}
                          </span>
                          <span className="rounded-full bg-primary-500/15 px-xs py-0.5 text-xs font-medium text-primary-400">
                            {job.stem_files.length} stem
                            {job.stem_files.length !== 1 ? "s" : ""}
                          </span>
                          {job.quality && (
                            <span className="rounded-full bg-muted px-xs py-0.5 text-xs text-muted-foreground">
                              {job.quality}
                            </span>
                          )}
                          {hasMidi && (
                            <span className="rounded-full bg-accent-midi/15 px-xs py-0.5 text-xs font-medium text-accent-midi-300">
                              MIDI
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {/* Expanded Details */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div id={detailsId} {...collapse}>
                          <div className="border-t border-border px-md pb-md pt-sm sm:px-lg sm:pb-5">
                            {/* Stem Rows */}
                            <ul className="space-y-xs" aria-label="Stem files">
                              {job.stem_files.map((stem) => {
                                const downloadKey = `${job.job_id}:${stem.stem_name}`;
                                const downloading =
                                  isDownloading[downloadKey] ?? false;
                                const unavailable =
                                  !stem.available || !stem.file_url;

                                return (
                                  <li
                                    key={stem.stem_name}
                                    className="flex items-center justify-between gap-sm rounded-xl bg-muted px-sm py-sm sm:px-md"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="block truncate text-sm text-foreground capitalize">
                                        {stem.stem_name}
                                      </span>
                                      {stem.file_size_bytes != null && (
                                        <span className="text-xs text-muted-foreground">
                                          {formatBytes(stem.file_size_bytes)}
                                        </span>
                                      )}
                                    </div>
                                    {unavailable ? (
                                      <span className="shrink-0 rounded-lg bg-muted px-sm py-1.5 text-xs text-muted-foreground">
                                        Unavailable
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          handleDownloadStem(
                                            job.job_id,
                                            stem.stem_name,
                                            stem.file_url,
                                          )
                                        }
                                        disabled={downloading}
                                        className="flex h-9 shrink-0 items-center gap-xs rounded-lg bg-primary-500/20 px-sm text-xs font-medium text-primary-400 transition hover:bg-primary-500/30 disabled:opacity-50"
                                        aria-label={`Download ${stem.stem_name}`}
                                      >
                                        {downloading ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Download className="h-3.5 w-3.5" />
                                        )}
                                        {downloading ? "…" : "Download"}
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>

                            {/* MIDI Files Section */}
                            {hasMidi && (
                              <div className="mt-sm">
                                <h4 className="mb-xs flex items-center gap-xs text-xs font-medium text-accent-midi-400">
                                  <Music className="h-3.5 w-3.5" />
                                  MIDI Files
                                </h4>
                                <ul
                                  className="space-y-xs"
                                  aria-label="MIDI files"
                                >
                                  {jobMidiRecords.map((midi) => {
                                    const midiKey = `midi:${midi.job_id}`;
                                    const midiDownloading =
                                      isDownloading[midiKey] ?? false;
                                    const midiUnavailable =
                                      !midi.file_available;
                                    return (
                                      <li
                                        key={midi.job_id}
                                        className="flex items-center justify-between gap-sm rounded-xl bg-accent-midi-500/5 px-sm py-sm sm:px-md"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <span className="block truncate text-sm text-foreground capitalize">
                                            {midi.stem_name || "audio"}.mid
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {midi.notes_detected} notes
                                          </span>
                                        </div>
                                        <button
                                          onClick={() =>
                                            handleDownloadMidi(
                                              midi.job_id,
                                              midi.stem_name,
                                            )
                                          }
                                          disabled={
                                            midiDownloading || midiUnavailable
                                          }
                                          className="flex h-9 shrink-0 items-center gap-xs rounded-lg bg-accent-midi-500/20 px-sm text-xs font-medium text-accent-midi-400 transition hover:bg-accent-midi-500/30 disabled:opacity-50"
                                          aria-label={`Download MIDI for ${midi.stem_name || "audio"}`}
                                        >
                                          {midiDownloading ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <Download className="h-3.5 w-3.5" />
                                          )}
                                          {midiDownloading
                                            ? "…"
                                            : midiUnavailable
                                              ? "Unavailable"
                                              : "MIDI"}
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            )}

                            {availableStems.length > 0 && (
                              <div className="mt-sm flex flex-col gap-xs sm:flex-row">
                                {onOpenInMixer && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenInMixer(job)}
                                    disabled={loadingMixerJobId === job.job_id}
                                    className="fire-button tap-feedback flex flex-1 items-center justify-center gap-xs rounded-xl py-sm text-sm font-semibold transition disabled:opacity-50"
                                  >
                                    {loadingMixerJobId === job.job_id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading…
                                      </>
                                    ) : (
                                      <>
                                        <SlidersHorizontal className="h-4 w-4" />
                                        Open in mixer
                                      </>
                                    )}
                                  </button>
                                )}
                                {onOpenInMidi && (
                                  <button
                                    type="button"
                                    data-testid="my-stems-use-in-midi"
                                    onClick={() => onOpenInMidi(job)}
                                    disabled={loadingMidiJobId === job.job_id}
                                    className="flex flex-1 items-center justify-center gap-xs rounded-xl border border-accent-midi-400/40 bg-accent-midi-500/15 py-sm text-sm font-semibold text-accent-midi-100 transition hover:bg-accent-midi-500/25 disabled:opacity-50"
                                  >
                                    {loadingMidiJobId === job.job_id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading…
                                      </>
                                    ) : (
                                      <>
                                        <Music className="h-4 w-4" />
                                        Use in MIDI
                                      </>
                                    )}
                                  </button>
                                )}
                                <SharePreviewButton
                                  jobId={job.job_id}
                                  className="w-full sm:w-auto"
                                />
                              </div>
                            )}

                            {/* Download All */}
                            {availableStems.length > 1 && (
                              <button
                                onClick={() => handleDownloadAll(job.job_id)}
                                disabled={jobZipping}
                                className="fire-button tap-feedback mt-sm flex w-full items-center justify-center gap-xs rounded-xl py-sm text-sm font-semibold transition disabled:opacity-50"
                                aria-label="Download all stems as ZIP"
                              >
                                {jobZipping ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Creating ZIP…
                                  </>
                                ) : (
                                  <>
                                    <Package className="h-4 w-4" />
                                    Download All ({availableStems.length} stems)
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
