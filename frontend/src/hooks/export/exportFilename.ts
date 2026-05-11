/** Pure filename utilities for export naming. */

export function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

export function buildMasterExportFilename(uploadName: string, format: string): string {
  return `${stripFileExtension(uploadName)}_master.${format}`;
}
