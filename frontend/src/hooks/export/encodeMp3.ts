/**
 * WAV → MP3 encoding using lamejs, offloaded to a worker when available.
 * Returns a Promise<Blob> (async) to avoid blocking the main thread.
 */

export async function encodeWavToMp3(wavBuffer: ArrayBuffer, kbps = 192): Promise<Blob> {
  // Prefer worker-based encoding (non-blocking). Fall back to in-thread encode if worker fails.
  if (typeof window !== "undefined" && typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("../../workers/encodeMp3Worker.ts", import.meta.url), { type: "module" });
      interface EncodeMp3WorkerMessage {
        mp3Buffer?: ArrayBuffer
        error?: string
      }
      const mp3Buf = await new Promise<ArrayBuffer>((resolve, reject) => {
        const onMsg = (ev: MessageEvent<EncodeMp3WorkerMessage>) => {
          const d = ev.data;
          if (d?.mp3Buffer) {
            worker.removeEventListener("message", onMsg);
            worker.terminate();
            resolve(d.mp3Buffer as ArrayBuffer);
          } else if (d?.error) {
            worker.removeEventListener("message", onMsg);
            worker.terminate();
            reject(new Error(d.error));
          }
        };
        worker.addEventListener("message", onMsg);
        // Transfer the wav buffer to the worker for zero-copy
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        worker.postMessage({ wavBuffer, kbps }, [wavBuffer]);
      });
      return new Blob([new Uint8Array(mp3Buf)], { type: "audio/mpeg" });
    } catch (err) {
      // Fall through to main-thread encode on error
      console.warn("MP3 worker failed, falling back to main-thread encode:", err);
    }
  }

  // Fallback: synchronous in-thread encode (keeps original behavior)
  // Import lamejs dynamically to avoid bundling cost unless used.
  const { default: lamejs } = await import("lamejs");
  const wavView = new DataView(wavBuffer);
  const riff = String.fromCharCode(
    wavView.getUint8(0),
    wavView.getUint8(1),
    wavView.getUint8(2),
    wavView.getUint8(3)
  );
  if (riff !== "RIFF") throw new Error("Invalid WAV file");

  const numChannels = wavView.getUint16(22, true);
  const sampleRate = wavView.getUint32(24, true);
  const bitsPerSample = wavView.getUint16(34, true);
  if (bitsPerSample !== 16) throw new Error("Only 16-bit WAV is supported for MP3 export");
  if (numChannels !== 1 && numChannels !== 2) throw new Error("Only mono/stereo WAV is supported for MP3 export");

  let dataOffset = -1;
  let dataLength = 0;
  let offset = 12;
  while (offset + 8 <= wavBuffer.byteLength) {
    const chunkId = String.fromCharCode(
      wavView.getUint8(offset),
      wavView.getUint8(offset + 1),
      wavView.getUint8(offset + 2),
      wavView.getUint8(offset + 3)
    );
    const chunkSize = wavView.getUint32(offset + 4, true);
    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  if (dataOffset < 0) throw new Error("WAV data chunk not found");

  const sampleCount = dataLength / (bitsPerSample / 8) / numChannels;
  const left = new Int16Array(sampleCount);
  const right = new Int16Array(sampleCount);
  let idx = dataOffset;
  for (let i = 0; i < sampleCount; i++) {
    left[i] = wavView.getInt16(idx, true);
    idx += 2;
    if (numChannels === 2) {
      right[i] = wavView.getInt16(idx, true);
      idx += 2;
    } else {
      right[i] = left[i];
    }
  }

  const encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const chunkSize = 1152;
  const chunks: ArrayBuffer[] = [];
  for (let i = 0; i < sampleCount; i += chunkSize) {
    const leftChunk = left.subarray(i, i + chunkSize);
    const rightChunk = right.subarray(i, i + chunkSize);
    const frame = encoder.encodeBuffer(leftChunk, rightChunk);
    if (frame.length > 0) {
      const bytes = new Uint8Array(frame);
      chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  }
  const finalFrame = encoder.flush();
  if (finalFrame.length > 0) {
    const bytes = new Uint8Array(finalFrame);
    chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return new Blob(chunks, { type: "audio/mpeg" });
}
