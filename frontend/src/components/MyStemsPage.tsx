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
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  Music,
  Package,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  RefreshCw,
  ArrowLeft,
  Loader2,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react";
import JSZip from "jszip";
import { useStemHistory } from "../hooks/useStemHistory";
import { fetchStemDownloadUrl } from "../api/stemHistory";
import { downloadBlob, isTouchDevice } from "../utils/downloadHelper";
import { MyStemsPageSkeleton } from "./MyStemsPageSkeleton";
import { useToast } from "../store/toastStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MyStemsPageProps {
  onClose: () => void;
  onOpenInMixer?: (job: import("../api/stemHistory").StemHistoryJob) => void;
  loadingMixerJobId?: string | null;
}

type SortOption = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "stems-desc";

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
  loadingMixerJobId = null,
}: MyStemsPageProps) {
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});
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
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name-asc":
          return (a.original_filename ?? "").localeCompare(b.original_filename ?? "");
        case "name-desc":
          return (b.original_filename ?? "").localeCompare(a.original_filename ?? "");
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
    async (jobId: string, stemName: string) => {
      const key = `${jobId}:${stemName}`;
      setIsDownloading((prev) => ({ ...prev, [key]: true }));
      try {
        const url = await fetchStemDownloadUrl(jobId, stemName);
        const response = await fetch(url);
        if (!response.ok) throw new Error("Download failed");
        const blob = await response.blob();
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

      const availableStems = job.stem_files.filter((s) => s.s3_key !== null);
      if (availableStems.length === 0) return;

      setIsZipping(jobId);
      try {
        const zip = new JSZip();
        const mobile = isTouchDevice();

        if (mobile) {
          // Sequential fetching on mobile to reduce memory pressure
          for (const stem of availableStems) {
            const url = await fetchStemDownloadUrl(jobId, stem.stem_name);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${stem.stem_name}`);
            const blob = await response.blob();
            zip.file(`${stem.stem_name}.wav`, blob);
          }
        } else {
          // Parallel fetching on desktop
          const downloads = await Promise.all(
            availableStems.map(async (stem) => {
              const url = await fetchStemDownloadUrl(jobId, stem.stem_name);
              const response = await fetch(url);
              if (!response.ok) throw new Error(`Failed to fetch ${stem.stem_name}`);
              const blob = await response.blob();
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0b09] p-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="mt-3 text-sm text-white/80">{error}</p>
        <button
          onClick={refetch}
          className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2.5 text-sm font-medium text-amber-400 transition hover:bg-amber-500/30"
          aria-label="Retry loading stems"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Empty State
  // -------------------------------------------------------------------------

  if (totalJobs === 0) {
    return (
      <div className="flex min-h-screen flex-col bg-[#0d0b09]">
        <header className="flex items-center gap-3 border-b border-white/10 p-4 sm:p-6">
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to editor"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">My Stems</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
            <Music className="h-8 w-8 text-amber-400" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">No stems yet</h2>
          <p className="mt-2 max-w-xs text-sm text-white/65">
            Split your first track! Your separated stems will appear here for easy re-download.
          </p>
          <button
            onClick={onClose}
            className="fire-button mt-6 rounded-xl px-6 py-3 text-sm font-semibold transition"
          >
            Go to Editor
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render: Main Page
  // -------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen flex-col bg-[#0d0b09]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/10 p-4 sm:p-6">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label="Back to editor"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-white">My Stems</h1>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        {/* Storage Overview */}
        <section aria-label="Storage overview" className="mb-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-[#1a1412]/95 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-white/50">
              <Package className="h-4 w-4" />
              <span className="text-xs">Jobs</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-white">{totalJobs}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1a1412]/95 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-white/50">
              <Music className="h-4 w-4" />
              <span className="text-xs">Stems</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-white">{totalStems}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1a1412]/95 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-white/50">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Storage</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-white">
              {formatBytes(totalStorageBytes)}
            </p>
          </div>
        </section>

        {/* Search & Sort Controls */}
        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename…"
              aria-label="Search stems by filename"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/40 outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort stems"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none transition focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30"
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
              <p className="text-sm text-white/50">No jobs match your search.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAndSortedJobs.map((job) => {
                const isExpanded = expandedJobId === job.job_id;
                const availableStems = job.stem_files.filter((s) => s.s3_key !== null);
                const jobZipping = isZipping === job.job_id;

                return (
                  <div
                    key={job.job_id}
                    className="overflow-hidden rounded-3xl border border-white/10 bg-[#1a1412]/95"
                  >
                    {/* Card Header (clickable) */}
                    <button
                      onClick={() =>
                        setExpandedJobId(isExpanded ? null : job.job_id)
                      }
                      className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-white/5 sm:p-5"
                      aria-expanded={isExpanded}
                      aria-controls={`job-details-${job.job_id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-white">
                          {job.original_filename || "Untitled"}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1 text-xs text-white/50">
                            <Clock className="h-3 w-3" />
                            {formatRelativeDate(job.created_at)}
                          </span>
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                            {job.stem_files.length} stem{job.stem_files.length !== 1 ? "s" : ""}
                          </span>
                          {job.quality && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                              {job.quality}
                            </span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 shrink-0 text-white/40" />
                      ) : (
                        <ChevronDown className="h-5 w-5 shrink-0 text-white/40" />
                      )}
                    </button>

                    {/* Expanded Details */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          id={`job-details-${job.job_id}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-white/5 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                            {/* Stem Rows */}
                            <ul className="space-y-2" aria-label="Stem files">
                              {job.stem_files.map((stem) => {
                                const downloadKey = `${job.job_id}:${stem.stem_name}`;
                                const downloading = isDownloading[downloadKey] ?? false;
                                const unavailable = stem.s3_key === null;

                                return (
                                  <li
                                    key={stem.stem_name}
                                    className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 sm:px-4"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="block truncate text-sm text-white capitalize">
                                        {stem.stem_name}
                                      </span>
                                      {stem.file_size_bytes != null && (
                                        <span className="text-xs text-white/40">
                                          {formatBytes(stem.file_size_bytes)}
                                        </span>
                                      )}
                                    </div>
                                    {unavailable ? (
                                      <span className="shrink-0 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/40">
                                        Unavailable
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          handleDownloadStem(job.job_id, stem.stem_name)
                                        }
                                        disabled={downloading}
                                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 text-xs font-medium text-amber-400 transition hover:bg-amber-500/30 disabled:opacity-50"
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

                            {onOpenInMixer && availableStems.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onOpenInMixer(job)}
                                disabled={loadingMixerJobId === job.job_id}
                                className="fire-button mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
                              >
                                {loadingMixerJobId === job.job_id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading into mixer…
                                  </>
                                ) : (
                                  <>
                                    <SlidersHorizontal className="h-4 w-4" />
                                    Open in mixer
                                  </>
                                )}
                              </button>
                            )}

                            {/* Download All */}
                            {availableStems.length > 1 && (
                              <button
                                onClick={() => handleDownloadAll(job.job_id)}
                                disabled={jobZipping}
                                className="fire-button mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50"
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
