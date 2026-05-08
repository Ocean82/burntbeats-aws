/**
 * API barrel — re-exports all public symbols to preserve existing import paths.
 *
 * Consumers can continue to use:
 *   import { splitStems, SplitQuality, ... } from "../api";
 *
 * Or import from specific sub-modules for tighter coupling:
 *   import { authHeaders } from "../api/auth";
 */

// Auth
export { setTokenProvider, clearJobToken } from "./auth";

// Types
export type {
  SplitResponse,
  BeatGridMetadata,
  StemJobStatus,
  SplitQuality,
  ServerExportMasterRequest,
} from "./types";

// Validation (re-export only what was previously public — type guards were internal)
// None were previously exported, but keep available for advanced consumers.

// Stem file operations
export {
  parseJobIdFromStemFileUrl,
  fetchStemWavAsArrayBuffer,
  fetchStemWavAsBlob,
  getStemFileUrl,
} from "./stems";

// Job status
export {
  getStemJobStatus,
  pollStemJobUntilDone,
  streamStemJobUntilDone,
} from "./jobStatus";

// High-level operations
export {
  startStemSplit,
  splitStems,
  startExpand,
  expandStems,
  serverExportMasterWav,
} from "./operations";

// Legal
export { acceptLegal } from "./legal";
