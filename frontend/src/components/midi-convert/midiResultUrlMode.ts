export type MidiResultMode = "view" | "edit";

export function readMidiResultModeFromUrl(
  search: string = typeof window !== "undefined" ? window.location.search : "",
): MidiResultMode | null {
  const mode = new URLSearchParams(search).get("mode");
  if (mode === "view" || mode === "edit") return mode;
  return null;
}

export function syncMidiResultModeToUrl(
  mode: MidiResultMode,
  search: string = typeof window !== "undefined" ? window.location.search : "",
  pathname: string = typeof window !== "undefined" ? window.location.pathname : "",
  hash: string = typeof window !== "undefined" ? window.location.hash : "",
): string {
  const params = new URLSearchParams(search);
  params.set("mode", mode);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
