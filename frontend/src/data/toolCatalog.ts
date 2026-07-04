import type { ToolId } from "@/hooks/useToolUsage";
import type { AppView } from "@/hooks/workflow/useEditorViewRouting";

/** Display ids include hub-only entries (e.g. patterns launcher). */
export type ToolCatalogId = ToolId | "patterns";

export type ToolStemColor = "vocals" | "drums" | "melody";

export interface ToolDefinition {
  id: ToolCatalogId;
  /** Tool id used for usage tracking in localStorage. */
  usageId: ToolId;
  /** App view when opened from the hub (patterns maps to beats). */
  appView: AppView;
  primaryName: string;
  nickname?: string;
  description: string;
  cta: string;
  route: string;
  stemColor?: ToolStemColor;
  headerTabLabel: string;
  isPrimary: boolean;
  showInHeader: boolean;
  /** data-tour attribute for onboarding spotlight */
  tourId: string;
}

export const BACK_TO_HOME_LABEL = "Back to Home";

export const TOOL_CATALOG: ToolDefinition[] = [
  {
    id: "editor",
    usageId: "editor",
    appView: "editor",
    primaryName: "Split a Song",
    nickname: "Rip it apart",
    description:
      "Extract vocals, drums, bass, and more — great for karaoke, remixing, or sampling.",
    cta: "Start Splitting",
    route: "/editor",
    stemColor: "vocals",
    headerTabLabel: "Split",
    isPrimary: true,
    showInHeader: true,
    tourId: "tool-split",
  },
  {
    id: "beats",
    usageId: "beats",
    appView: "beats",
    primaryName: "Beat Maker",
    nickname: "The Kitchen",
    description: "Build drum patterns with presets and export.",
    cta: "Open Beat Maker",
    route: "/beats?tab=drums",
    stemColor: "drums",
    headerTabLabel: "Beats",
    isPrimary: true,
    showInHeader: true,
    tourId: "tool-beats",
  },
  {
    id: "midi",
    usageId: "midi",
    appView: "midi",
    primaryName: "Sound → Notes",
    nickname: "Note Hunter",
    description: "Turn any recording into editable sheet music.",
    cta: "Start Converting",
    route: "/midi",
    stemColor: "melody",
    headerTabLabel: "Notes",
    isPrimary: true,
    showInHeader: true,
    tourId: "tool-notes",
  },
  {
    id: "speech",
    usageId: "speech",
    appView: "speech",
    primaryName: "Clean Up Vocals",
    nickname: "Mic Fix",
    description: "Remove noise and improve voice clarity.",
    cta: "Clean Vocals",
    route: "/speech",
    headerTabLabel: "Vocals",
    isPrimary: false,
    showInHeader: true,
    tourId: "tool-vocals",
  },
  {
    id: "tuner",
    usageId: "tuner",
    appView: "tuner",
    primaryName: "Guitar Tuner",
    description: "Visual pitch tuner for guitar and bass.",
    cta: "Open Tuner",
    route: "/tuner",
    headerTabLabel: "Tuner",
    isPrimary: false,
    showInHeader: true,
    tourId: "tool-tuner",
  },
  {
    id: "patterns",
    usageId: "beats",
    appView: "beats",
    primaryName: "Beat Templates",
    nickname: "Blueprint Rack",
    description: "Browse drum presets and rhythm templates.",
    cta: "Browse Templates",
    route: "/beats?tab=drums&focus=patterns",
    headerTabLabel: "Beats",
    isPrimary: false,
    showInHeader: false,
    tourId: "tool-patterns",
  },
  {
    id: "my-stems",
    usageId: "my-stems",
    appView: "my-stems",
    primaryName: "Your Splits",
    nickname: "The Vault",
    description: "Your separated tracks and downloads.",
    cta: "Open Vault",
    route: "/library",
    headerTabLabel: "Splits",
    isPrimary: false,
    showInHeader: true,
    tourId: "tool-splits",
  },
];

const byId = new Map(TOOL_CATALOG.map((t) => [t.id, t]));

export function getTool(id: ToolCatalogId): ToolDefinition {
  const tool = byId.get(id);
  if (!tool) throw new Error(`Unknown tool catalog id: ${id}`);
  return tool;
}

export function getPrimaryTools(): ToolDefinition[] {
  return TOOL_CATALOG.filter((t) => t.isPrimary);
}

export function getSecondaryTools(): ToolDefinition[] {
  return TOOL_CATALOG.filter((t) => !t.isPrimary);
}

export function getHeaderTools(): ToolDefinition[] {
  return TOOL_CATALOG.filter((t) => t.showInHeader);
}

export function getToolByAppView(view: AppView): ToolDefinition | undefined {
  return TOOL_CATALOG.find((t) => t.appView === view && t.showInHeader);
}
