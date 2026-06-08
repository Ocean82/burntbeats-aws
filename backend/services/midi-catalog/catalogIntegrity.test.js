import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { CATALOG_FILES_DIR, CATALOG_INDEX_PATH } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readUint32(data, offset) {
  return (
    ((data[offset] << 24) |
      (data[offset + 1] << 16) |
      (data[offset + 2] << 8) |
      data[offset + 3]) >>>
    0
  );
}

function readVarLen(data, offset) {
  let value = 0;
  let i = offset;
  while (i < data.length) {
    const byte = data[i++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value, next: i };
}

function readUint16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function inspectMidi(buffer) {
  const data = new Uint8Array(buffer);
  if (data.length < 14 || readUint32(data, 0) !== 0x4d546864) {
    return null;
  }

  const trackCount = readUint16(data, 10);
  const division = readUint16(data, 12);
  const ticksPerBeat = division & 0x8000 ? 480 : division;

  let offset = 14;
  let noteCount = 0;
  let maxTick = 0;
  let tempo = 120;

  while (offset + 8 <= data.length) {
    if (readUint32(data, offset) !== 0x4d54726b) break;
    const trackLength = readUint32(data, offset + 4);
    offset += 8;
    const trackEnd = offset + trackLength;
    let runningStatus = 0;
    let tick = 0;

    while (offset < trackEnd && offset < data.length) {
      const delta = readVarLen(data, offset);
      tick += delta.value;
      offset = delta.next;
      if (offset >= trackEnd) break;

      let status = data[offset];
      if (status < 0x80) {
        if (runningStatus === 0) break;
        status = runningStatus;
      } else {
        offset += 1;
        runningStatus = status;
      }

      const type = status & 0xf0;
      if (type === 0x90) {
        const _pitch = data[offset++];
        const velocity = data[offset++];
        if (velocity > 0) noteCount += 1;
        maxTick = Math.max(maxTick, tick);
      } else if (type === 0x80) {
        offset += 2;
        maxTick = Math.max(maxTick, tick);
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        offset += 2;
      } else if (type === 0xc0 || type === 0xd0) {
        offset += 1;
      } else if (status === 0xff) {
        const metaType = data[offset++];
        const len = readVarLen(data, offset);
        offset = len.next;
        if (metaType === 0x51 && len.value === 3 && offset + 2 < trackEnd) {
          const microsecondsPerBeat =
            (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
          tempo = Math.round(60000000 / microsecondsPerBeat);
        }
        offset += len.value;
      } else if (status === 0xf0 || status === 0xf7) {
        const len = readVarLen(data, offset);
        offset = len.next + len.value;
      } else {
        break;
      }
    }

    offset = trackEnd;
  }

  return {
    trackCount,
    noteCount,
    estimatedTempo: tempo,
    length: Math.max(1, Math.ceil(maxTick / ticksPerBeat)),
  };
}

test("MIDI catalog files exist for every indexed entry and keep index metadata in sync", async () => {
  const raw = await readFile(CATALOG_INDEX_PATH, "utf8");
  const catalog = JSON.parse(raw);
  const entries = Array.isArray(catalog.entries) ? catalog.entries : [];

  assert.ok(entries.length > 0, "catalog should contain at least one entry");

  for (const entry of entries) {
    const filePath = path.join(CATALOG_FILES_DIR, `${entry.id}.mid`);
    await access(filePath);
    const midiBuffer = await readFile(filePath);
    const inspected = inspectMidi(midiBuffer);
    assert.ok(
      inspected,
      `catalog file ${path.relative(__dirname, filePath)} should be a valid MIDI file`,
    );
    assert.ok(
      inspected.noteCount > 0,
      `catalog file ${path.relative(__dirname, filePath)} should contain playable note events`,
    );
    assert.equal(
      entry.analysis?.track_count,
      inspected.trackCount,
      `${entry.id} track_count should match generated MIDI`,
    );
    assert.equal(
      entry.analysis?.note_count,
      inspected.noteCount,
      `${entry.id} note_count should match generated MIDI`,
    );
    assert.equal(
      entry.analysis?.estimatedTempo,
      inspected.estimatedTempo,
      `${entry.id} estimatedTempo should match generated MIDI`,
    );
    assert.equal(
      entry.analysis?.length,
      inspected.length,
      `${entry.id} length should match generated MIDI`,
    );
  }
});
