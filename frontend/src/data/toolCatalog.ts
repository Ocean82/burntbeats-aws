import type { ToolId } from "@/hooks/useToolUsage";
import type { AppView } from "@/hooks/workflow/useEditorViewRouting";

/** Canonical user-facing tool names, nicknames, routes, and header labels.
 *  All in-app copy for tools should come from here — not hardcoded in pages. */

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
  /** Header tab display order (lower = earlier). */
  headerSortOrder?: number;
  isPrimary: boolean;
  showInHeader: boolean;
  /** data-tour attribute for onboarding spotlight */
  tourId: string;
  /** Optional panel title override (defaults to primaryName). */
  panelTitle?: string;
  panelSubtitle?: string;
  emptyStateTitle?: string;
  errorLoadTitle?: string;
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
    headerSortOrder: 1,
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
    headerSortOrder: 4,
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
    headerSortOrder: 3,
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
    headerSortOrder: 2,
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
    headerSortOrder: 5,
    panelSubtitle: "Tune up before you record or convert",
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
    headerSortOrder: 6,
    emptyStateTitle: "No tracks yet",
    errorLoadTitle: "Couldn't load your tracks",
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

export type ToolCopyField = keyof Pick<
  ToolDefinition,
  | "primaryName"
  | "nickname"
  | "description"
  | "cta"
  | "headerTabLabel"
  | "panelTitle"
  | "panelSubtitle"
  | "emptyStateTitle"
  | "errorLoadTitle"
>;

export function getToolCopy(id: ToolCatalogId, field: ToolCopyField): string {
  const tool = getTool(id);
  const value = tool[field];
  if (field === "panelTitle") return tool.panelTitle ?? tool.primaryName;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Tool ${id} has no copy for field: ${field}`);
  }
  return value;
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

export function getHeaderToolsOrdered(): ToolDefinition[] {
  return getHeaderTools().sort(
    (a, b) => (a.headerSortOrder ?? 99) - (b.headerSortOrder ?? 99),
  );
}

export function getToolByAppView(view: AppView): ToolDefinition | undefined {
  return TOOL_CATALOG.find((t) => t.appView === view && t.showInHeader);
}
