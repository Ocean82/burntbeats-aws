import type { EditableNote } from "../components/midi-convert/editorTypes";

const MIN_NOTE_DURATION = 0.01;

export function resolvePitchOverlaps(notes: EditableNote[]): EditableNote[] {
  const byPitch = new Map<number, EditableNote[]>();

  for (const note of notes) {
    const bucket = byPitch.get(note.pitch) ?? [];
    bucket.push({ ...note });
    byPitch.set(note.pitch, bucket);
  }

  const resolved: EditableNote[] = [];

  for (const group of byPitch.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return a.duration - b.duration;
    });

    const kept: EditableNote[] = [];

    for (const note of sorted) {
      const previous = kept[kept.length - 1];
      if (!previous) {
        kept.push(note);
        continue;
      }

      const previousEnd = previous.start + previous.duration;
      if (note.start >= previousEnd - MIN_NOTE_DURATION) {
        kept.push(note);
        continue;
      }

      if (note.start <= previous.start + MIN_NOTE_DURATION) {
        kept[kept.length - 1] = note;
        continue;
      }

      previous.duration = Math.max(MIN_NOTE_DURATION, note.start - previous.start);
      kept.push(note);
    }

    resolved.push(...kept.filter((note) => note.duration >= MIN_NOTE_DURATION));
  }

  return resolved.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    return a.duration - b.duration;
  });
}

export function sanitizeSelectedIds<T extends { id: string }>(
  notes: T[],
  selectedIds: Set<string>,
): Set<string> {
  const validIds = new Set(notes.map((note) => note.id));
  return new Set([...selectedIds].filter((id) => validIds.has(id)));
}
