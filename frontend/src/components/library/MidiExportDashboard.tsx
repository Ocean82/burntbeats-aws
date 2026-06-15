/**
 * MidiExportDashboard — batch export UI for MIDI conversion history.
 */
import { Download, Loader2, Package, RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { authHeaders } from "../../api/auth";
import { API_BASE } from "../../config";
import { useMidiHistory, type MidiHistoryRecord } from "../../hooks/useMidiHistory";
import { midiErrorMessage } from "../../utils/midiErrors";
import { cn } from "../../utils/cn";
import { EmptyState, JobStatusChip, PanelHeader, SectionLabel } from "../ui";

type DashboardTab = "history" | "export";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function MidiExportDashboard() {
  const { records, isLoading, error, refetch } = useMidiHistory();
  const [tab, setTab] = useState<DashboardTab>("history");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const available = useMemo(
    () => records.filter((r) => r.file_available && r.notes_detected > 0),
    [records],
  );

  const recordById = useMemo(
    () => new Map(records.map((r) => [r.job_id, r])),
    [records],
  );

  const stats = useMemo(() => {
    const totalNotes = records.reduce((s, r) => s + r.notes_detected, 0);
    const totalDuration = records.reduce((s, r) => s + r.duration_seconds, 0);
    return {
      jobs: records.length,
      available: available.length,
      totalNotes,
      totalDuration: Math.round(totalDuration),
    };
  }, [records, available]);

  const toggleSelect = useCallback((jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(available.map((r) => r.job_id)));
  }, [available]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const downloadRecord = useCallback(async (record: MidiHistoryRecord) => {
    const headers = await authHeaders();
    const url = `${API_BASE}/api/midi/file/${record.job_id}/output.mid`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(midiErrorMessage("download"));
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = `${record.stem_name || "midi"}-${record.job_id.slice(0, 8)}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(obj);
  }, []);

  const exportSelected = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setExporting(true);
    setExportError(null);
    try {
      const selectedRecords = ids
        .map((id) => recordById.get(id))
        .filter((r): r is MidiHistoryRecord => !!r && r.file_available && r.notes_detected > 0);
      if (!selectedRecords.length) {
        throw new Error(midiErrorMessage("empty_export"));
      }

      const headers = await authHeaders();
      const payload = {
        mode: "stems",
        format: "midi1",
        selected_stems: selectedRecords.map((r) => r.stem_name || r.job_id.slice(0, 8)),
        source_jobs: selectedRecords.map((r) => ({
          job_id: r.job_id,
          stem_name: r.stem_name || r.job_id.slice(0, 8),
          bpm: r.analysis?.suggested_bpm ?? 120,
        })),
      };
      const createRes = await fetch(`${API_BASE}/api/midi/export`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(
          midiErrorMessage(
            "export_history",
            typeof data.error === "string" ? data.error : null,
          ),
        );
      }
      const created = (await createRes.json()) as {
        export_id: string;
        export_token: string;
        status_url?: string;
        archive_url?: string;
      };
      const statusUrl = created.status_url;
      const archiveUrl = created.archive_url;
      if (!statusUrl || !archiveUrl || !created.export_token) {
        throw new Error("Incomplete export response");
      }

      let attempts = 0;
      while (attempts < 160) {
        const statusRes = await fetch(statusUrl, {
          headers: { ...headers, "x-job-token": created.export_token },
        });
        if (!statusRes.ok) {
          const data = await statusRes.json().catch(() => ({}));
          throw new Error(
            midiErrorMessage(
              "export_history",
              typeof data.error === "string" ? data.error : null,
            ),
          );
        }
        const statusData = (await statusRes.json()) as {
          status: string;
          error?: string;
        };
        if (statusData.status === "completed") break;
        if (statusData.status === "failed") {
          throw new Error(
            midiErrorMessage("export_history", statusData.error ?? null),
          );
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (attempts >= 160) {
        throw new Error(midiErrorMessage("export_history", "Export timed out"));
      }

      const archiveRes = await fetch(archiveUrl, {
        headers: { ...headers, "x-job-token": created.export_token },
      });
      if (!archiveRes.ok) throw new Error(midiErrorMessage("export_history", "Archive download failed"));
      const blob = await archiveRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `midi-export-${selectedRecords.length}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : midiErrorMessage("export_history"),
      );
    } finally {
      setExporting(false);
    }
  }, [selected, recordById]);

  const renderRow = (record: MidiHistoryRecord) => {
    const isSelected = selected.has(record.job_id);
    const canExport = record.file_available && record.notes_detected > 0;
    return (
      <li
        key={record.job_id}
        className={cn(
          "flex flex-col gap-xs rounded-lg border px-sm py-sm sm:flex-row sm:items-center sm:justify-between",
          isSelected ? "border-primary-400/35 bg-primary-500/5" : "border-border bg-muted/30",
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-sm">
          {tab === "export" && canExport && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(record.job_id)}
              className="mt-1"
              aria-label={`Select ${record.stem_name || record.job_id}`}
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium capitalize text-foreground">
              {record.stem_name || "Conversion"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(record.created_at)} · {record.notes_detected} notes ·{" "}
              {Math.round(record.duration_seconds)}s
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          <JobStatusChip
            variant={canExport ? "done" : "queued"}
            label={canExport ? "Ready" : record.notes_detected === 0 ? "Empty" : "Unavailable"}
          />
          {canExport && (
            <button
              type="button"
              onClick={() => void downloadRecord(record)}
              className="midi-btn text-xs"
              aria-label="Download MIDI"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="ui-panel overflow-hidden" data-testid="midi-export-dashboard">
      <PanelHeader
        title="MIDI Export"
        subtitle="History and batch export"
        actions={
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-secondary-foreground"
            aria-label="Refresh history"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        }
      />

      <div className="border-b border-border/60 px-md py-sm">
        <div className="inline-flex rounded-md border border-border p-0.5" role="tablist">
          {(["history", "export"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-sm py-1 text-xs font-medium capitalize transition",
                tab === t
                  ? "bg-accent-midi/20 text-accent-midi-200"
                  : "text-muted-foreground hover:text-secondary-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-sm border-b border-border/60 px-md py-sm sm:grid-cols-4">
        <Stat label="Jobs" value={stats.jobs} />
        <Stat label="Available" value={stats.available} />
        <Stat label="Total notes" value={stats.totalNotes} />
        <Stat label="Duration (s)" value={stats.totalDuration} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-xs py-xl text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading history…
        </div>
      ) : error ? (
        <EmptyState title="Could not load history" description={error} />
      ) : records.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No conversions yet"
          description="Completed MIDI conversions appear here."
        />
      ) : (
        <div className="p-md">
          {tab === "export" && (
            <div className="mb-sm flex flex-wrap items-center gap-sm">
              <SectionLabel>Batch export</SectionLabel>
              <button type="button" onClick={selectAll} className="text-xs text-accent-midi-300 underline">
                Select all
              </button>
              <button type="button" onClick={clearSelection} className="text-xs text-muted-foreground underline">
                Clear
              </button>
              <button
                type="button"
                onClick={() => void exportSelected()}
                disabled={exporting || selected.size === 0}
                className="midi-btn text-xs ml-auto"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Package className="h-3.5 w-3.5" />
                )}
                Export {selected.size} as ZIP
              </button>
            </div>
          )}
          {exportError && (
            <p className="mb-sm text-xs text-destructive-300" role="alert">
              {exportError}
            </p>
          )}
          <ul className="space-y-xs">{records.map(renderRow)}</ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-sm py-xs text-center">
      <p className="text-lg font-semibold tabular-nums text-accent-midi-200">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
