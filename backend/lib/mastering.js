// @ts-check
/**
 * Build FFmpeg filter chains from mastering preset settings.
 */
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Promise<any> | null} */
let presetsPromise = null;

/**
 * @returns {Promise<{ presets: any[] }>}
 */
export async function loadMasteringPresets() {
  if (!presetsPromise) {
    const presetPath = path.join(__dirname, "..", "data", "mastering-presets.json");
    presetsPromise = readFile(presetPath, "utf-8").then((raw) => JSON.parse(raw));
  }
  return presetsPromise;
}

/**
 * @param {string} presetId
 * @returns {Promise<any | null>}
 */
export async function getMasteringPreset(presetId) {
  const data = await loadMasteringPresets();
  return data.presets.find((p) => p.id === presetId) || null;
}

/**
 * @param {any} settings
 * @returns {string}
 */
export function buildMasteringFilterChain(settings) {
  const filters = [];

  if (settings?.eq?.enabled) {
    const eq = settings.eq;
    if (eq.lowShelf) {
      filters.push(
        `lowshelf=f=${eq.lowShelf.frequency}:g=${eq.lowShelf.gain}:width_type=q:w=${eq.lowShelf.q}`,
      );
    }
    if (eq.lowMid) {
      filters.push(
        `equalizer=f=${eq.lowMid.frequency}:t=q:w=${eq.lowMid.q}:g=${eq.lowMid.gain}`,
      );
    }
    if (eq.highMid) {
      filters.push(
        `equalizer=f=${eq.highMid.frequency}:t=q:w=${eq.highMid.q}:g=${eq.highMid.gain}`,
      );
    }
    if (eq.presence) {
      filters.push(
        `equalizer=f=${eq.presence.frequency}:t=q:w=${eq.presence.q}:g=${eq.presence.gain}`,
      );
    }
    if (eq.highShelf) {
      filters.push(
        `highshelf=f=${eq.highShelf.frequency}:g=${eq.highShelf.gain}:width_type=q:w=${eq.highShelf.q}`,
      );
    }
  }

  if (settings?.compressor?.enabled) {
    const c = settings.compressor;
    filters.push(
      `acompressor=threshold=${c.threshold}dB:ratio=${c.ratio}:attack=${c.attack}:release=${c.release}:knee=${c.knee}:makeup=${c.makeupGain}dB`,
    );
  }

  if (settings?.stereoEnhancer?.enabled && settings.stereoEnhancer.width !== 100) {
    const width = Math.max(0, Math.min(200, settings.stereoEnhancer.width));
    filters.push(`stereotools=muting=0:slev=1:sbal=0:mlev=1:mpan=0:swidth=${width / 100}`);
  }

  if (settings?.exciter?.enabled) {
    const ex = settings.exciter;
    const mix = Math.max(0, Math.min(1, ex.amount / 100));
    filters.push(
      `highpass=f=${ex.frequency},asplit=2[ex][dry];[ex]acrusher=level_in=1:level_out=1:mode=lin:aa=1[cr];[cr]volume=${mix}[wet];[dry][wet]amix=inputs=2:weights=1 ${mix}`,
    );
  }

  if (settings?.loudness) {
    const loud = settings.loudness;
    filters.push(
      `loudnorm=I=${loud.targetLUFS}:TP=${loud.truePeak}:LRA=${loud.dynamicRange}`,
    );
  }

  if (settings?.limiter?.enabled) {
    const lim = settings.limiter;
    filters.push(
      `alimiter=limit=${Math.pow(10, lim.ceiling / 20)}:attack=${lim.release}:release=${lim.release}`,
    );
  }

  return filters.join(",");
}

/**
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {any} preset
 * @returns {string[]}
 */
export function buildMasteringFfmpegArgs(inputPath, outputPath, preset) {
  const filterChain = buildMasteringFilterChain(preset.settings);
  const args = ["-i", inputPath, "-vn"];
  if (filterChain) {
    args.push("-af", filterChain);
  }
  args.push("-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", "-y", outputPath);
  return args;
}
