// @ts-check
/**
 * Intent-driven stem split request parsing (mirrors stem_service.routing.schema).
 */

/** @typedef {'extract' | 'remove' | 'full_separation'} SplitTask */
/** @typedef {'fast' | 'high' | 'speed' | 'quality'} SplitQualityInput */

/**
 * @typedef {object} SplitIntent
 * @property {SplitTask} task
 * @property {string[]} [targets]
 * @property {'2' | '4'} [mode]
 * @property {'fast' | 'high'} [quality]
 */

const EXTRACT_TARGETS = new Set([
  "vocals",
  "drums",
  "bass",
  "guitar",
  "other",
  "instrumental",
]);

const PREMIUM_TARGETS = new Set(["drums", "bass", "guitar", "other"]);

/**
 * @param {Record<string, unknown> | undefined} body
 * @returns {{ intent: SplitIntent | null; stems: string; quality: string | undefined; intentJson: string | null; error: string | null }}
 */
export function parseSplitRequestBody(body) {
  const intentField = body?.intent;
  if (intentField != null && String(intentField).trim()) {
    try {
      const parsed = JSON.parse(String(intentField));
      const validated = validateIntentObject(parsed);
      if (validated.error) {
        return {
          intent: null,
          stems: "2",
          quality: undefined,
          intentJson: null,
          error: validated.error,
        };
      }
      const intent = validated.intent;
      return {
        intent,
        stems: legacyStemsFromIntent(intent),
        quality: legacyQualityFromIntent(intent),
        intentJson: JSON.stringify(intent),
        error: null,
      };
    } catch {
      return {
        intent: null,
        stems: "2",
        quality: undefined,
        intentJson: null,
        error: "Invalid intent JSON",
      };
    }
  }

  if (body?.task && String(body.task).trim()) {
    try {
      const intent = buildIntentFromFormFields(body);
      return {
        intent,
        stems: legacyStemsFromIntent(intent),
        quality: legacyQualityFromIntent(intent),
        intentJson: JSON.stringify(intent),
        error: null,
      };
    } catch (e) {
      return {
        intent: null,
        stems: "2",
        quality: undefined,
        intentJson: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  const stems = (body?.stems && String(body.stems)) || "4";
  const quality =
    body?.quality != null ? String(body.quality) : undefined;
  return { intent: null, stems, quality, intentJson: null, error: null };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {SplitIntent}
 */
function buildIntentFromFormFields(body) {
  const task = String(body.task).trim().toLowerCase();
  const result = validateIntentObject({
    task,
    targets: parseTargetsCsv(body.targets),
    mode: body.mode != null ? String(body.mode).trim() : undefined,
    quality: body.quality != null ? String(body.quality).trim().toLowerCase() : "high",
  });
  if (result.error || !result.intent) {
    throw new Error(result.error || "Invalid intent");
  }
  return result.intent;
}

/**
 * @param {unknown} raw
 * @returns {{ intent: SplitIntent | null; error: string | null }}
 */
function validateIntentObject(raw) {
  if (!raw || typeof raw !== "object") {
    return { intent: null, error: "intent must be an object" };
  }
  /** @type {Record<string, unknown>} */
  const data = raw;
  const task = String(data.task || "").toLowerCase();
  if (!["extract", "remove", "full_separation"].includes(task)) {
    return { intent: null, error: "task must be extract, remove, or full_separation" };
  }

  let quality = String(data.quality || "high").toLowerCase();
  if (quality === "speed") quality = "fast";
  if (quality === "quality") quality = "high";
  if (quality !== "fast" && quality !== "high") {
    return { intent: null, error: "quality must be fast or high" };
  }

  /** @type {string[]} */
  const targets = Array.isArray(data.targets)
    ? data.targets.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];

  let mode = data.mode != null ? String(data.mode).trim() : undefined;
  if (mode && mode !== "2" && mode !== "4") {
    return { intent: null, error: "mode must be 2 or 4" };
  }

  if (task === "full_separation") {
    if (targets.length) {
      return { intent: null, error: "targets must be omitted for full_separation" };
    }
    return {
      intent: {
        task: "full_separation",
        mode: mode === "2" ? "2" : "4",
        quality: /** @type {'fast' | 'high'} */ (quality),
      },
      error: null,
    };
  }

  if (task === "remove") {
    if (!targets.length) {
      return { intent: null, error: "remove requires targets" };
    }
    if (!targets.every((t) => t === "vocals")) {
      return { intent: null, error: "remove currently supports vocals only" };
    }
    return {
      intent: { task: "remove", targets, quality: /** @type {'fast' | 'high'} */ (quality) },
      error: null,
    };
  }

  if (!targets.length) {
    return { intent: null, error: "extract requires at least one target" };
  }
  for (const t of targets) {
    if (!EXTRACT_TARGETS.has(t)) {
      return { intent: null, error: `unknown target: ${t}` };
    }
  }
  return {
    intent: { task: "extract", targets, quality: /** @type {'fast' | 'high'} */ (quality) },
    error: null,
  };
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseTargetsCsv(raw) {
  if (raw == null) return [];
  return String(raw)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {SplitIntent} intent
 * @returns {string}
 */
export function legacyStemsFromIntent(intent) {
  if (intent.task === "full_separation") {
    return intent.mode === "2" ? "2" : "4";
  }
  if (intent.task === "remove") return "2";
  const count = intent.targets?.length ?? 1;
  return count >= 4 ? "4" : "2";
}

/**
 * @param {SplitIntent} intent
 * @returns {string | undefined}
 */
export function legacyQualityFromIntent(intent) {
  return intent.quality === "fast" ? "speed" : "quality";
}

/**
 * @param {SplitIntent | null} intent
 * @param {string} stems
 * @param {string | undefined} quality
 * @returns {boolean}
 */
export function isPremiumIntentRequest(intent, stems, quality) {
  if (intent) {
    if (intent.task === "full_separation" && intent.mode === "4") return true;
    if (intent.quality === "high") return true;
    if (intent.task === "extract" && intent.targets) {
      const nonVocal = intent.targets.filter((t) => t !== "vocals");
      if (nonVocal.some((t) => PREMIUM_TARGETS.has(t))) return true;
      if (nonVocal.length > 1) return true;
    }
    return false;
  }
  return stems === "4" || quality === "quality";
}
