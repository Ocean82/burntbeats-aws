import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { API_BASE, isInternalHealthPanelEnabled } from "../config";
import { useDevOverlayDismissed } from "./dev-overlay-dismiss";

const POLL_MS = 30000;

type HealthStatus = "ok" | "degraded" | "error";

interface BackendHealthPayload {
  status: HealthStatus;
  uptime_seconds: number;
  database?: {
    connected?: boolean;
    latencyMs?: number;
    error?: string;
  };
  services?: Record<
    string,
    { reachable?: boolean; status?: string; error?: string }
  >;
  storage?: {
    midi_backend?: { ok?: boolean; error?: string };
    midi_shared?: { aligned?: boolean; reason?: string | null };
  };
  catalogs?: {
    midi?: {
      status: HealthStatus;
      total_entries: number;
      valid_files: number;
      issue_count: number;
      issues: Array<{ id?: string; reason?: string; field?: string }>;
      generated_at?: string | null;
    };
  };
}

function StatusBadge({ status }: { status: HealthStatus | boolean }) {
  const normalized: HealthStatus =
    typeof status === "boolean" ? (status ? "ok" : "degraded") : status;
  const cls =
    normalized === "ok"
      ? "border-success-400/35 bg-success-500/12 text-success-200"
      : normalized === "degraded"
        ? "border-warning-400/35 bg-warning-500/12 text-warning-100"
        : "border-destructive-400/35 bg-destructive-500/12 text-destructive-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {normalized}
    </span>
  );
}

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp) return "Never";
  const deltaSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSec < 5) return "just now";
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const deltaMin = Math.round(deltaSec / 60);
  return `${deltaMin}m ago`;
}

function formatUptime(seconds?: number) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function DevHealthPanel({
  visible: visibleProp,
  onVisibleChange,
  showToggle = true,
  embedded = false,
}: {
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  showToggle?: boolean;
  embedded?: boolean;
} = {}) {
  const [internalVisible, setInternalVisible] = useState(false);
  const { dismissed, dismiss } = useDevOverlayDismissed();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<BackendHealthPayload | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const enabled = isInternalHealthPanelEnabled();

  const visible = visibleProp ?? internalVisible;
  const setVisible = onVisibleChange ?? setInternalVisible;

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (!res.ok) throw new Error(`Health request failed (${res.status})`);
      const json = (await res.json()) as BackendHealthPayload;
      setPayload(json);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load health status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timeoutId = window.setTimeout(() => {
      void loadHealth();
    }, 0);
    const intervalId = window.setInterval(() => {
      void loadHealth();
    }, POLL_MS);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [enabled, loadHealth]);

  const failingServices = useMemo(() => {
    const services = payload?.services ?? {};
    return Object.entries(services).filter(
      ([, value]) => value.reachable === false,
    );
  }, [payload]);

  if (!enabled || (!embedded && dismissed)) return null;

  const healthBody = (
    <>
      <div className="mb-sm flex items-center justify-between gap-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-300">
            Internal health
          </p>
          <p className="text-[10px] text-muted-foreground">
            Updated {formatRelativeTime(lastUpdatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-xs">
          {payload ? <StatusBadge status={payload.status} /> : null}
          <button
            type="button"
            onClick={() => void loadHealth()}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] text-secondary-foreground transition hover:text-foreground"
            aria-label="Refresh internal health panel"
          >
            <span className="inline-flex items-center gap-1">
              <RefreshCw
                className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive-500/30 bg-destructive-950/20 px-sm py-sm text-destructive-200">
          <div className="flex items-center gap-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            Health fetch failed
          </div>
          <p className="mt-1 text-[10px] text-destructive-200/80">{error}</p>
        </div>
      ) : loading && !payload ? (
        <div className="flex items-center gap-xs rounded-lg border border-border bg-muted/20 px-sm py-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading health data…
        </div>
      ) : payload ? (
        <div className="space-y-sm">
          <div className="grid grid-cols-2 gap-sm">
            <div className="rounded-lg border border-border bg-muted/10 px-sm py-sm">
              <div className="mb-1 flex items-center gap-xs text-muted-foreground">
                <Server className="h-3.5 w-3.5" />
                <span>Backend</span>
              </div>
              <div className="flex items-center justify-between gap-xs">
                <span>Uptime</span>
                <span className="font-mono text-foreground">
                  {formatUptime(payload.uptime_seconds)}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/10 px-sm py-sm">
              <div className="mb-1 flex items-center gap-xs text-muted-foreground">
                <Database className="h-3.5 w-3.5" />
                <span>Database</span>
              </div>
              <div className="flex items-center justify-between gap-xs">
                <span>Connected</span>
                <StatusBadge status={Boolean(payload.database?.connected)} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {payload.database?.latencyMs != null
                  ? `${payload.database.latencyMs}ms`
                  : payload.database?.error || "No latency data"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/10 px-sm py-sm">
            <div className="mb-1 flex items-center gap-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              <span>MIDI storage & catalog</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-xs">
                <span>Shared storage</span>
                <StatusBadge
                  status={Boolean(payload.storage?.midi_shared?.aligned)}
                />
              </div>
              <div className="flex items-center justify-between gap-xs">
                <span>Catalog</span>
                <StatusBadge
                  status={payload.catalogs?.midi?.status ?? "error"}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {payload.catalogs?.midi
                  ? `${payload.catalogs.midi.valid_files}/${payload.catalogs.midi.total_entries} valid files · ${payload.catalogs.midi.issue_count} issues`
                  : "Catalog health unavailable"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/10 px-sm py-sm">
            <div className="mb-1 flex items-center gap-xs text-muted-foreground">
              {failingServices.length === 0 ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success-300" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5 text-warning-300" />
              )}
              <span>Services</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(payload.services ?? {}).map(([name, value]) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-xs"
                >
                  <span className="capitalize">{name}</span>
                  <StatusBadge
                    status={Boolean(
                      value.reachable && value.status === "ok",
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          {(payload.catalogs?.midi?.issues?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-warning-500/30 bg-warning-950/20 px-sm py-sm text-warning-100">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
                Catalog issues
              </p>
              <ul className="space-y-1 text-[10px] text-warning-50/85">
                {payload.catalogs?.midi?.issues
                  .slice(0, 3)
                  .map((issue, index) => (
                    <li key={`${issue.id ?? "issue"}-${index}`}>
                      {(issue.id ?? "catalog") +
                        ": " +
                        (issue.reason ?? "unknown")}
                      {issue.field ? ` (${issue.field})` : ""}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return (
      <section
        aria-label="Internal health panel"
        data-testid="dev-health-embedded"
      >
        {healthBody}
      </section>
    );
  }

  return (
    <>
      {showToggle && (
        <div
          data-dev-overlay="health-toggle-legacy"
          className="fixed right-4 top-4 z-60 flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="rounded-lg border border-border bg-chrome px-sm py-1.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground backdrop-blur-md transition hover:text-foreground"
            aria-label={
              visible ? "Hide internal health panel" : "Show internal health panel"
            }
          >
            {visible ? "Hide health" : "Show health"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg border border-border bg-chrome px-1.5 py-1 text-[10px] text-muted-foreground backdrop-blur-md transition hover:text-foreground"
            aria-label="Dismiss dev overlay panels for this session"
            title="Hide dev tools until you click Restore"
          >
            ×
          </button>
        </div>
      )}
      {visible && (
        <section
          aria-label="Internal health panel"
          className="fixed right-4 top-12 z-50 w-88 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-chrome p-sm text-[11px] text-secondary-foreground shadow-elevation-md backdrop-blur-md pointer-events-none"
        >
          {healthBody}
        </section>
      )}
    </>
  );
}
