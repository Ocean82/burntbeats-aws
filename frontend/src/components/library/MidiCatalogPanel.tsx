/**
 * MidiCatalogPanel — browse progressions and rhythm patterns from the catalog.
 */
import { Download, Loader2, Music2, Pause, Play, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { PolySynth } from "tone";
import { authHeaders } from "../../api/auth";
import { catalogFileUrl, useMidiCatalog } from "../../hooks/useMidiCatalog";
import type { MidiCatalogEntry } from "../../hooks/useMidiCatalog";
import { parseMidiBuffer } from "../../utils/parseMidiNotes";
import { cn } from "../../utils/cn";
import { EmptyState, FilterBar } from "../ui";
import { useToast } from "../../store/toastStore";

const EMBER = "text-primary-300";
const ICE = "text-accent-midi-200";
const GOLD = "text-warning-300";

const catalogTabClass = (active: boolean) =>
  cn(
    "rounded px-sm py-1 text-xs font-medium capitalize transition",
    active
      ? "bg-primary-500/20 text-primary-200"
      : "text-muted-foreground hover:text-secondary-foreground",
  );

export function MidiCatalogPanel() {
  const catalog = useMidiCatalog();
  const { toast } = useToast();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const synthRef = useRef<InstanceType<typeof PolySynth> | null>(null);
  const scheduledRef = useRef<number[]>([]);

  const stopPreview = useCallback(() => {
    for (const id of scheduledRef.current) {
      Tone.getTransport().clear(id);
    }
    scheduledRef.current = [];
    Tone.getTransport().stop();
    Tone.getTransport().position = 0;
    synthRef.current?.releaseAll();
    setPlayingId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const playEntry = useCallback(
    async (entry: MidiCatalogEntry) => {
      if (playingId === entry.id) {
        stopPreview();
        return;
      }
      stopPreview();
      setPreviewLoading(entry.id);
      try {
        await Tone.start();
        const headers = await authHeaders();
        const res = await fetch(catalogFileUrl(entry.id), { headers });
        if (!res.ok) throw new Error("Preview unavailable");
        const buffer = await res.arrayBuffer();
        const { notes, bpm } = parseMidiBuffer(buffer);
        if (!notes.length) {
          throw new Error(
            "This catalog file does not contain playable MIDI notes.",
          );
        }

        if (!synthRef.current) {
          synthRef.current = new PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.3 },
          }).toDestination();
          synthRef.current.volume.value = -8;
        }

        const transport = Tone.getTransport();
        transport.bpm.value = bpm;
        const minStart = Math.min(...notes.map((n) => n.start));
        const maxEnd = Math.max(...notes.map((n) => n.start + n.duration));
        const total = maxEnd - minStart;

        for (const note of notes) {
          const t = note.start - minStart;
          const freq = Tone.Frequency(note.pitch, "midi").toFrequency();
          const eventId = transport.schedule((time: number) => {
            synthRef.current?.triggerAttackRelease(
              freq,
              Math.max(note.duration, 0.05),
              time,
              Math.max(0.1, note.velocity / 127),
            );
          }, t);
          scheduledRef.current.push(eventId);
        }

        const endId = transport.schedule(() => stopPreview(), total + 0.1);
        scheduledRef.current.push(endId);
        transport.start();
        setPlayingId(entry.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Preview unavailable";
        toast(message, { type: "error" });
      } finally {
        setPreviewLoading(null);
      }
    },
    [playingId, stopPreview, toast],
  );

  const downloadEntry = useCallback(
    async (entry: MidiCatalogEntry) => {
      if (downloadingId) return;
      setDownloadingId(entry.id);
      try {
        const headers = await authHeaders();
        const res = await fetch(catalogFileUrl(entry.id), { headers });
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = entry.filename || `${entry.id}.mid`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Download failed";
        toast(message, { type: "error" });
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadingId, toast],
  );

  return (
    <div data-testid="midi-catalog-panel">
      <FilterBar>
        <div
          className="inline-flex rounded-md border border-border p-0.5"
          role="tablist"
        >
          {catalog.filters.tab === "progression" ? (
            <button
              type="button"
              role="tab"
              aria-selected="true"
              onClick={() => catalog.setTab("progression")}
              className={catalogTabClass(true)}
            >
              Progressions
            </button>
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected="false"
              onClick={() => catalog.setTab("progression")}
              className={catalogTabClass(false)}
            >
              Progressions
            </button>
          )}
          {catalog.filters.tab === "rhythm" ? (
            <button
              type="button"
              role="tab"
              aria-selected="true"
              onClick={() => catalog.setTab("rhythm")}
              className={catalogTabClass(true)}
            >
              Rhythms
            </button>
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected="false"
              onClick={() => catalog.setTab("rhythm")}
              className={catalogTabClass(false)}
            >
              Rhythms
            </button>
          )}
        </div>

        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search catalog…"
            value={catalog.filters.q}
            onChange={(e) => catalog.setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted py-1 pl-7 pr-sm text-xs text-foreground"
            aria-label="Search catalog"
          />
        </div>

        <select
          value={catalog.filters.genre}
          onChange={(e) => catalog.setGenre(e.target.value)}
          className="rounded-md border border-border bg-muted px-sm py-1 text-xs"
          aria-label="Filter by genre"
        >
          <option value="">All genres</option>
          {catalog.genreOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={catalog.filters.key}
          onChange={(e) => catalog.setKey(e.target.value)}
          className="rounded-md border border-border bg-muted px-sm py-1 text-xs"
          aria-label="Filter by key"
        >
          <option value="">All keys</option>
          {catalog.keyOptions.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        <select
          value={catalog.filters.tempo}
          onChange={(e) => catalog.setTempo(e.target.value)}
          className="rounded-md border border-border bg-muted px-sm py-1 text-xs"
          aria-label="Filter by tempo"
        >
          <option value="">All tempos</option>
          {catalog.tempoOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <span className={cn("text-xs tabular-nums", ICE)}>
          {catalog.total} result{catalog.total === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {catalog.isLoading ? (
        <div className="flex items-center justify-center gap-xs py-xl text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading catalog…
        </div>
      ) : catalog.error ? (
        <EmptyState
          title="Could not load catalog"
          description={catalog.error}
          action={
            <button
              type="button"
              onClick={catalog.refetch}
              className="midi-btn text-xs"
            >
              Retry
            </button>
          }
        />
      ) : catalog.entries.length === 0 ? (
        <EmptyState
          icon={<Music2 className="h-8 w-8" />}
          title="No matches"
          description="Try adjusting your search or filters."
        />
      ) : (
        <ul className="divide-y divide-border/60 max-h-[480px] overflow-y-auto">
          {catalog.entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-xs px-md py-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-xs text-[10px]">
                  <span
                    className={cn(
                      "rounded-full border border-primary-400/30 px-2 py-0.5",
                      EMBER,
                    )}
                  >
                    {entry.category.genre}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border border-accent-midi/30 px-2 py-0.5",
                      ICE,
                    )}
                  >
                    {entry.category.key}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border border-warning-400/30 px-2 py-0.5",
                      GOLD,
                    )}
                  >
                    {entry.analysis.estimatedTempo} BPM
                  </span>
                  <span className="text-muted-foreground">
                    {entry.category.complexity} ·{" "}
                    {entry.category.time_signature}
                  </span>
                </div>
                {entry.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-xs">
                <button
                  type="button"
                  onClick={() => void playEntry(entry)}
                  disabled={previewLoading === entry.id}
                  className="midi-btn text-xs"
                  aria-label={
                    playingId === entry.id ? "Stop preview" : "Play preview"
                  }
                >
                  {previewLoading === entry.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : playingId === entry.id ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
                {downloadingId === entry.id ? (
                  <button
                    type="button"
                    disabled
                    className="midi-btn text-xs"
                    aria-label="Downloading MIDI"
                    aria-busy="true"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void downloadEntry(entry)}
                    className="midi-btn text-xs"
                    aria-label="Download MIDI"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
