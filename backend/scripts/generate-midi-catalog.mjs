import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, "..");
const INDEX_PATH = path.join(BACKEND_DIR, "data", "midi-catalog", "index.json");
const FILES_DIR = path.join(BACKEND_DIR, "data", "midi-catalog", "files");
const TICKS_PER_BEAT = 480;

const NOTE_OFFSETS = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function encodeVarLen(value) {
  let buffer = value & 0x7f;
  const out = [];
  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= 0x80 | (value & 0x7f);
  }
  while (true) {
    out.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return out;
}

function uint32(value) {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function uint16(value) {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function parseKeySignature(rawKey) {
  const value = typeof rawKey === "string" ? rawKey.trim() : "C major";
  const [rootToken = "C", modeToken = "major"] = value.split(/\s+/);
  const root = NOTE_OFFSETS[rootToken] ?? 0;
  const isMinor = modeToken.toLowerCase().startsWith("m");
  return {
    rootMidi: 60 + root,
    scale: isMinor ? MINOR_SCALE : MAJOR_SCALE,
    isMinor,
  };
}

function parseTimeSignature(value) {
  const match =
    typeof value === "string" ? value.match(/^(\d+)\/(\d+)$/) : null;
  const numerator = match ? Number(match[1]) : 4;
  const denominator = match ? Number(match[2]) : 4;
  return { numerator, denominator };
}

function beatsPerBar(entry) {
  return parseTimeSignature(entry.category?.time_signature).numerator;
}

function chordFromDegree(rootMidi, scale, degree) {
  const d0 = degree % scale.length;
  const d1 = (degree + 2) % scale.length;
  const d2 = (degree + 4) % scale.length;
  const wrap1 = degree + 2 >= scale.length ? 12 : 0;
  const wrap2 = degree + 4 >= scale.length ? 12 : 0;
  return [
    rootMidi + scale[d0],
    rootMidi + scale[d1] + wrap1,
    rootMidi + scale[d2] + wrap2,
  ];
}

function addNote(events, tick, pitch, duration, velocity = 88, channel = 0) {
  events.push({ tick, order: 1, bytes: [0x90 | channel, pitch, velocity] });
  events.push({
    tick: tick + duration,
    order: 0,
    bytes: [0x80 | channel, pitch, 0],
  });
}

function addChord(events, tick, chord, duration, velocity = 78, channel = 0) {
  for (const pitch of chord) {
    addNote(events, tick, pitch, duration, velocity, channel);
  }
}

function buildProgressionEvents(entry, rootMidi, scale) {
  const events = [];
  const bar = beatsPerBar(entry) * TICKS_PER_BEAT;
  const degrees = scale === MINOR_SCALE ? [0, 5, 2, 6] : [0, 4, 5, 3];
  for (let i = 0; i < degrees.length; i++) {
    const tick = i * bar;
    const chord = chordFromDegree(rootMidi, scale, degrees[i]);
    addChord(events, tick, chord, bar - TICKS_PER_BEAT / 6, 82);
    addNote(
      events,
      tick,
      rootMidi - 12 + scale[degrees[i] % scale.length],
      bar - TICKS_PER_BEAT / 8,
      72,
    );
  }
  return events;
}

function buildMelodyEvents(entry, rootMidi, scale) {
  const events = [];
  const step = TICKS_PER_BEAT / 2;
  const sequence = [0, 2, 4, 5, 4, 2, 1, 0, 4, 5, 6, 4, 2, 1, 0, 6];
  sequence.forEach((degree, index) => {
    const octave = degree >= scale.length ? 12 : 0;
    const pitch = rootMidi + scale[degree % scale.length] + octave;
    addNote(events, index * step, pitch, step, 92);
  });
  return events;
}

function buildGrooveEvents(entry, rootMidi, scale) {
  const events = [];
  const step = TICKS_PER_BEAT / 2;
  for (let i = 0; i < 16; i++) {
    const tick = i * step;
    const bassPitch = rootMidi - 24 + scale[i % 3 === 2 ? 4 : 0];
    addNote(events, tick, bassPitch, step * 0.9, 84, 1);
    if (i % 2 === 1) {
      addNote(
        events,
        tick,
        rootMidi + 12 + scale[(i / 2) % scale.length],
        step * 0.6,
        68,
      );
    }
  }
  return events;
}

function buildArrangementEvents(entry, rootMidi, scale) {
  const events = [];
  const bar = beatsPerBar(entry) * TICKS_PER_BEAT;
  const progression = [0, 5, 3, 4, 0, 5, 6, 4];
  progression.forEach((degree, index) => {
    const tick = index * bar;
    const chord = chordFromDegree(rootMidi, scale, degree);
    addChord(events, tick, chord, bar - TICKS_PER_BEAT / 8, 80);
    addNote(
      events,
      tick,
      rootMidi - 12 + scale[degree % scale.length],
      bar - TICKS_PER_BEAT / 8,
      74,
      1,
    );
    addNote(
      events,
      tick + TICKS_PER_BEAT * 2,
      rootMidi + 12 + scale[(degree + 4) % scale.length],
      TICKS_PER_BEAT,
      76,
    );
  });
  return events;
}

function buildClassicalEvents(entry, rootMidi, scale) {
  const events = [];
  const step = TICKS_PER_BEAT / 2;
  const pattern = [0, 2, 4, 2, 0, 2, 4, 6, 4, 2, 1, 0, 2, 4, 2, 0];
  pattern.forEach((degree, index) => {
    const octave = degree >= scale.length ? 12 : 0;
    const pitch = rootMidi + scale[degree % scale.length] + octave;
    addNote(events, index * step, pitch, step * 0.95, 76);
  });
  return events;
}

function buildEventsForEntry(entry) {
  const { rootMidi, scale } = parseKeySignature(entry.category?.key);
  const type = entry.category?.type;
  if (type === "progression")
    return buildProgressionEvents(entry, rootMidi, scale);
  if (type === "melody") return buildMelodyEvents(entry, rootMidi, scale);
  if (type === "groove" || type === "loop")
    return buildGrooveEvents(entry, rootMidi, scale);
  if (type === "arrangement")
    return buildArrangementEvents(entry, rootMidi, scale);
  return buildClassicalEvents(entry, rootMidi, scale);
}

function buildTrackModel(entry) {
  const tempo = Math.max(60, Number(entry.analysis?.estimatedTempo) || 120);
  const microsecondsPerBeat = Math.round(60000000 / tempo);
  const { numerator, denominator } = parseTimeSignature(
    entry.category?.time_signature,
  );
  const denominatorPower = Math.max(0, Math.round(Math.log2(denominator || 4)));
  const generatedEvents = buildEventsForEntry(entry);
  const titleBytes = Buffer.from(entry.title, "utf8");
  const lastTick = generatedEvents.reduce(
    (max, event) => Math.max(max, event.tick),
    0,
  );
  const noteCount = generatedEvents.filter(
    (event) => (event.bytes[0] & 0xf0) === 0x90 && event.bytes[2] > 0,
  ).length;
  const events = [
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x51, 0x03, ...uint32(microsecondsPerBeat).slice(1)],
    },
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x58, 0x04, numerator, denominatorPower, 24, 8],
    },
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x03, titleBytes.length, ...titleBytes],
    },
    ...generatedEvents,
  ];

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track = [];
  let previousTick = 0;
  for (const event of events) {
    const delta = event.tick - previousTick;
    track.push(...encodeVarLen(delta), ...event.bytes);
    previousTick = event.tick;
  }
  track.push(...encodeVarLen(TICKS_PER_BEAT / 4), 0xff, 0x2f, 0x00);

  return {
    track,
    analysis: {
      estimatedTempo: tempo,
      length: Math.max(1, Math.ceil(lastTick / TICKS_PER_BEAT)),
      track_count: 1,
      note_count: noteCount,
    },
  };
}

function buildMidiFile(entry) {
  const { track, analysis } = buildTrackModel(entry);
  return {
    buffer: Buffer.from([
      0x4d,
      0x54,
      0x68,
      0x64,
      ...uint32(6),
      ...uint16(0),
      ...uint16(1),
      ...uint16(TICKS_PER_BEAT),
      0x4d,
      0x54,
      0x72,
      0x6b,
      ...uint32(track.length),
      ...track,
    ]),
    analysis,
  };
}

function buildGenreStatistics(entries) {
  return entries.reduce((acc, entry) => {
    const genre = entry.category?.genre;
    if (!genre) return acc;
    acc[genre] = (acc[genre] || 0) + 1;
    return acc;
  }, {});
}

async function main() {
  const raw = await readFile(INDEX_PATH, "utf8");
  const catalog = JSON.parse(raw);
  await mkdir(FILES_DIR, { recursive: true });

  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];
  const normalizedEntries = [];

  for (const entry of entries) {
    const { buffer, analysis } = buildMidiFile(entry);
    await writeFile(path.join(FILES_DIR, `${entry.id}.mid`), buffer);
    normalizedEntries.push({
      ...entry,
      analysis,
    });
  }

  const nextCatalog = {
    ...catalog,
    generated_at: new Date().toISOString(),
    statistics: {
      total_entries: normalizedEntries.length,
      by_genre: buildGenreStatistics(normalizedEntries),
    },
    entries: normalizedEntries,
  };

  await writeFile(
    `${INDEX_PATH}`,
    `${JSON.stringify(nextCatalog, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Generated ${normalizedEntries.length} MIDI catalog files in ${FILES_DIR}`,
  );
}

main().catch((error) => {
  console.error("Failed to generate MIDI catalog:", error);
  process.exitCode = 1;
});
