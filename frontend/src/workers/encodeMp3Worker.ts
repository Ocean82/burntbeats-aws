import lamejs from "lamejs";

// Worker: receives { wavBuffer: ArrayBuffer, kbps: number }
// Posts back { mp3Buffer: ArrayBuffer }

self.addEventListener("message", async (ev) => {
  const data = ev.data;
  try {
    const wavBuffer: ArrayBuffer = data.wavBuffer;
    const kbps: number = data.kbps ?? 192;

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

    // Find data chunk
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

    // Concatenate chunks
    let total = 0;
    for (const c of chunks) total += c.byteLength;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      out.set(new Uint8Array(c), pos);
      pos += c.byteLength;
    }

    // Post back transferable ArrayBuffer
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    self.postMessage({ mp3Buffer: out.buffer }, [out.buffer]);
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    self.postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
});
