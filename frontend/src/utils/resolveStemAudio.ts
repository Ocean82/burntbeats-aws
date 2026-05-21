/**
 * Resolve stem audio bytes from API job URLs or local blob/loaded files.
 */
import { fetchStemWavAsArrayBuffer, parseJobIdFromStemFileUrl } from "../api/stems";

export type StemAudioSource =
  | { kind: "api"; url: string }
  | { kind: "blob"; url: string; file?: File };

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error("Failed to read stem file"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read stem file"));
    reader.readAsArrayBuffer(file);
  });
}

export function stemEntryToAudioSource(entry: {
  id: string;
  url: string;
  file?: File;
}): StemAudioSource {
  if (entry.file != null) {
    return { kind: "blob", url: entry.url, file: entry.file };
  }
  if (entry.id.startsWith("loaded_") || entry.url.startsWith("blob:")) {
    return { kind: "blob", url: entry.url };
  }
  if (parseJobIdFromStemFileUrl(entry.url)) {
    return { kind: "api", url: entry.url };
  }
  return { kind: "blob", url: entry.url };
}

export async function resolveStemAudioArrayBuffer(
  source: StemAudioSource,
): Promise<ArrayBuffer> {
  if (source.kind === "api") {
    return fetchStemWavAsArrayBuffer(source.url);
  }
  if (source.file) {
    return readFileAsArrayBuffer(source.file);
  }
  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} loading stem`);
  }
  return res.arrayBuffer();
}
