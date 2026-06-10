/**
 * File validation utility for the Phase Controller.
 *
 * Validates that an audio file has a supported format and does not exceed the size limit.
 * Used during the "upload" phase to determine whether to transition to "configure".
 */

/** Supported audio formats (case-insensitive comparison) */
export const SUPPORTED_FORMATS = ['wav', 'mp3', 'flac', 'ogg', 'aac'] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

/** Maximum file size in bytes: 500 MB (inclusive) */
export const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

export interface FileMetadata {
  format: string;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validates file metadata for the upload phase.
 *
 * A file is valid if:
 * - Its format (case-insensitive) is one of: WAV, MP3, FLAC, OGG, AAC
 * - Its size is less than or equal to 500 MB (524,288,000 bytes)
 *
 * @param metadata - The file's format string and size in bytes
 * @returns Validation result with `valid` flag and optional error message
 */
export function validateFile(metadata: FileMetadata): ValidationResult {
  const normalizedFormat = metadata.format.toLowerCase().trim();

  const isFormatSupported = (SUPPORTED_FORMATS as readonly string[]).includes(normalizedFormat);
  const isSizeValid = metadata.size >= 0 && metadata.size <= MAX_FILE_SIZE_BYTES;

  if (!isFormatSupported && !isSizeValid) {
    return {
      valid: false,
      error: `Unsupported format "${metadata.format}" and file exceeds 500 MB limit.`,
    };
  }

  if (!isFormatSupported) {
    return {
      valid: false,
      error: `Unsupported format. Please use WAV, MP3, FLAC, OGG, or AAC.`,
    };
  }

  if (!isSizeValid) {
    return {
      valid: false,
      error: `File exceeds 500 MB limit.`,
    };
  }

  return { valid: true, error: null };
}
