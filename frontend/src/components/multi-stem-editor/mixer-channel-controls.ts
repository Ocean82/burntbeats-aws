import { cn } from "../../utils/cn";

export type ChannelButtonKind = "mute" | "solo";

const COMPACT_BASE =
  "tap-feedback flex h-11 w-11 items-center justify-center rounded text-meta font-bold ring-1 transition-[color,background-color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out-quart)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.95]";

const COMPACT_INACTIVE =
  "bg-white/5 text-white/50 ring-transparent hover:bg-white/10 hover:text-white/70 hover:ring-white/10";

const COMPACT_ACTIVE: Record<ChannelButtonKind, string> = {
  mute: "bg-red-500/40 text-red-100 ring-2 ring-red-400/60 shadow-[0_0_10px_rgba(239,68,68,0.45)]",
  solo: "bg-yellow-400/35 text-yellow-100 ring-2 ring-yellow-300/50 shadow-[0_0_10px_rgba(250,204,21,0.4)]",
};

const PANEL_BASE =
  "min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-150";

const PANEL_INACTIVE =
  "border-white/10 bg-white/5 text-white/70";

const PANEL_ACTIVE: Record<ChannelButtonKind, string> = {
  mute:
    "border-red-400/60 bg-red-500/40 text-red-100 ring-2 ring-red-400/60 shadow-[0_0_16px_rgba(239,68,68,0.45)] scale-[1.03]",
  solo:
    "border-yellow-300/60 bg-yellow-400/35 text-yellow-100 ring-2 ring-yellow-300/50 shadow-[0_0_20px_rgba(250,204,21,0.45)] scale-[1.03]",
};

const PANEL_HOVER: Record<ChannelButtonKind, string> = {
  mute: "hover:border-red-400/30 hover:text-red-200",
  solo: "hover:border-yellow-300/40 hover:text-yellow-200",
};

export function channelMuteSoloButtonClass(
  active: boolean,
  kind: ChannelButtonKind,
  variant: "compact" | "panel" = "compact",
): string {
  if (variant === "compact") {
    return cn(
      COMPACT_BASE,
      active ? COMPACT_ACTIVE[kind] : COMPACT_INACTIVE,
    );
  }
  return cn(
    PANEL_BASE,
    active ? PANEL_ACTIVE[kind] : cn(PANEL_INACTIVE, PANEL_HOVER[kind]),
  );
}
