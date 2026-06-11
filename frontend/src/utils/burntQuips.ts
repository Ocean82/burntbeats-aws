/**
 * Burnt Quips — branded personality system for toast messages.
 * Not AI — just a curated randomized quip engine that gives the app character.
 * Categories map to common UX events; each returns a random branded message.
 */

const quips = {
  generic: [
    "Well, that went about as well as a screen door on a submarine.",
    "Oops. Looks like you broke it. Again.",
    "Error 404: Your luck not found.",
    "If I had a dollar for every error, I'd buy a better server.",
    "This is why we can't have nice things.",
    "Somewhere, a developer is crying.",
    "You broke it. But hey, at least you're consistent.",
  ],
  upload: [
    "Nice try, but that file doesn't belong here.",
    "Uploading that? Bold move. Too bad it failed.",
    "That file type? Not on my watch.",
    "File rejected. Standards are high around here.",
    "We only accept bangers. Try again.",
  ],
  uploadSuccess: [
    "File locked and loaded. Let's cook.",
    "Upload complete. Now the real work begins.",
    "Got it. Processing your audio — sit tight.",
  ],
  splitStart: [
    "Tearing this track apart. One moment.",
    "Splitting stems… the AI is doing its thing.",
    "Deconstructing your audio. Stand by.",
    "Breaking it down — molecule by molecule.",
  ],
  splitSuccess: [
    "Stems are ready. Go make something fire.",
    "Done. Your tracks are separated and waiting.",
    "Split complete. Time to remix reality.",
    "Boom. Four stems, zero compromises.",
  ],
  splitError: [
    "The stem service choked. Try a different file?",
    "Something went sideways during separation.",
    "Couldn't split that one. File might be too short or corrupted.",
    "Processing failed. The audio gods are not pleased.",
  ],
  exportSuccess: [
    "Export complete. Go drop that on the world.",
    "Your master is ready. Download and dominate.",
    "Rendered and delivered. You're welcome.",
    "Exported. Another banger for the collection.",
  ],
  exportError: [
    "Export failed. The render gremlins struck again.",
    "Couldn't finish the export. Try again?",
    "Something broke during export. We're on it.",
  ],
  auth: [
    "Authentication failed. Did you forget your own password?",
    "Access denied. Maybe next time, superstar.",
    "You shall not pass. (Gandalf voice)",
  ],
  timeout: [
    "Still waiting? Maybe grab a coffee.",
    "This is slower than dial-up. Hang tight.",
    "Timeout. Even snails move faster.",
    "The server is thinking really hard. Too hard, apparently.",
  ],
  success: [
    "Look at you, actually succeeding.",
    "It worked. Miracles do happen.",
    "Achievement unlocked: basic competence.",
    "Nailed it. Don't let it go to your head.",
  ],
  undo: [
    "Undone. Like it never happened.",
    "Rolled back. Clean slate.",
    "Changes reversed. No judgment.",
  ],
  redo: [
    "Changed your mind about changing your mind? Noted.",
    "Re-applied. Make up your mind though.",
    "Redo complete. Commitment is hard.",
  ],
  reset: [
    "Channel reset. Back to factory fresh.",
    "Wiped clean. Start over, do better.",
    "Reset complete. Blank canvas energy.",
  ],
  midiConvert: [
    "Transcribing your audio to MIDI. Hold tight.",
    "Listening to every note… translating to MIDI.",
    "Converting audio to notes. The machine is concentrating.",
  ],
  midiSuccess: [
    "MIDI transcription complete. Every note captured.",
    "Notes extracted. Your piano roll awaits.",
    "Transcription done. Time to edit those notes.",
  ],
  queueWait: [
    "You're in the queue. Good things come to those who wait.",
    "Processing queue is backed up. Your turn is coming.",
    "Queued up. Grab a snack while you wait.",
  ],
  limiterEngaged: [
    "Limiter engaged. Your ears are safe now.",
    "Brick wall activated. No clipping allowed.",
  ],
  limiterDisengaged: [
    "Limiter off. Live dangerously.",
    "Protection removed. Full send.",
  ],
} as const;

type QuipCategory = keyof typeof quips;

/**
 * Get a random branded quip for a given category.
 * Falls back to 'generic' if the category doesn't exist.
 */
export function getBurntQuip(category: string): string {
  const pool = quips[category as QuipCategory] ?? quips.generic;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get a quip suitable for toast display — returns both message and a suggested toast type.
 */
export function getBurntToast(category: string): {
  message: string;
  type: "success" | "error" | "info";
} {
  const message = getBurntQuip(category);

  const errorCategories = new Set([
    "generic",
    "splitError",
    "exportError",
    "auth",
    "timeout",
  ]);
  const successCategories = new Set([
    "uploadSuccess",
    "splitSuccess",
    "exportSuccess",
    "success",
    "midiSuccess",
  ]);

  if (errorCategories.has(category)) return { message, type: "error" };
  if (successCategories.has(category)) return { message, type: "success" };
  return { message, type: "info" };
}

/** All available quip categories (for documentation / dev tooling). */
export const QUIP_CATEGORIES = Object.keys(quips) as QuipCategory[];
