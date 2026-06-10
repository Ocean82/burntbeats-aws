import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";
import { useToolDrawer } from "@/hooks/useToolDrawer";
import { useWorkspaceLayout } from "@/hooks/useWorkspaceLayout";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useWorkflow } from "@/contexts/WorkflowContext";
import { LAYOUT } from "@/constants/layout";
import { ToolSidebar } from "./ToolSidebar";
import { EffectsPanel } from "./EffectsPanel";
import { EffectsPanelBottomSheet } from "./EffectsPanelBottomSheet";
import { MixerConsole } from "./MixerConsole";

/**
 * Workspace — CSS Grid layout container for the post-split editing environment.
 *
 * Grid areas:
 *   - transport: full-width top bar
 *   - sidebar: left tool icon bar (collapses to horizontal toolbar on mobile)
 *   - waveform: center main content
 *   - effects: right slide-out panel (conditional)
 *   - mixer: full-width bottom section
 *
 * Requirements: 3.1, 3.3, 9.1
 */
export function Workspace() {
  const { isOpen, activeTool, toggle, close } = useToolDrawer();
  useWorkspaceLayout(); // MixerConsole uses this hook directly for collapse state
  const { stemStates } = useWorkflow();

  // Track which stem the effects panel applies to.
  // Defaults to the first available stem or empty string if no stems loaded.
  const stemIds = useMemo(() => Object.keys(stemStates), [stemStates]);
  const [activeStemId, _setActiveStemId] = useState<string>("");

  // Keep activeStemId in sync: if it's not in stemStates, reset to first available
  const resolvedStemId = useMemo(() => {
    if (activeStemId && stemIds.includes(activeStemId)) return activeStemId;
    return stemIds[0] ?? "";
  }, [activeStemId, stemIds]);

  const isDesktop = useMediaQuery(
    `(min-width: ${LAYOUT.BREAKPOINT_DESKTOP}px)`,
  );
  const isTablet = useMediaQuery(
    `(min-width: ${LAYOUT.BREAKPOINT_TABLET}px)`,
  );
  const isMobile = !isTablet;
  const isTallViewport = useMediaQuery(
    `(min-height: ${LAYOUT.BREAKPOINT_TABLET}px)`,
  );

  // Effects panel pushes waveform on desktop, overlays on tablet
  const effectsPushes = isDesktop && isOpen;
  const effectsOverlays = isTablet && !isDesktop && isOpen;

  // Grid template columns:
  // Desktop with effects open: sidebar | waveform (1fr) | effects (320px)
  // Desktop without effects: sidebar | waveform (1fr)
  // Mobile: full-width single column
  const gridTemplateColumns = isMobile
    ? "1fr"
    : effectsPushes
      ? `${LAYOUT.TOOL_SIDEBAR_WIDTH}px 1fr ${LAYOUT.EFFECTS_PANEL_WIDTH}px`
      : `${LAYOUT.TOOL_SIDEBAR_WIDTH}px 1fr`;

  // Grid template rows:
  // Mobile: transport | toolbar | waveform | mixer
  // Desktop: transport | waveform + mixer
  const gridTemplateRows = isMobile
    ? `${LAYOUT.TRANSPORT_HEIGHT}px auto 1fr auto`
    : `${LAYOUT.TRANSPORT_HEIGHT}px 1fr auto`;

  // Grid template areas
  const gridTemplateAreas = isMobile
    ? `"transport" "toolbar" "waveform" "mixer"`
    : effectsPushes
      ? `"transport transport transport" "sidebar waveform effects" "sidebar mixer mixer"`
      : `"transport transport" "sidebar waveform" "sidebar mixer"`;

  return (
    <div
      data-testid="workspace"
      className={cn(
        "grid w-full bg-[hsl(220,15%,8%)]",
        // No-scroll layout on tall+wide viewports (≥768px tall AND ≥1024px wide)
        isTallViewport && isDesktop && "overflow-hidden",
        // Allow vertical scrolling on short viewports or mobile
        (!isTallViewport || isMobile) && "overflow-y-auto",
      )}
      style={{
        height: `calc(100vh - ${LAYOUT.HEADER_HEIGHT}px)`,
        gridTemplateColumns,
        gridTemplateRows,
        gridTemplateAreas,
      }}
    >
      {/* TransportBar — spans full width, fixed at top */}
      <div
        data-testid="workspace-transport"
        className={cn(
          "border-b border-white/5 bg-[hsl(220,15%,10%)]/80 backdrop-blur-md",
          // Fixed on mobile or sticky on short (non-mobile) viewports
          isMobile && "sticky top-0 z-20",
          !isMobile && !isTallViewport && "sticky top-0 z-20",
        )}
        style={{
          gridArea: "transport",
          height: `${LAYOUT.TRANSPORT_HEIGHT}px`,
          borderRadius: 0,
        }}
      >
        {/* TransportBar component will be rendered here */}
      </div>

      {/* ToolSidebar — vertical on tablet+, horizontal toolbar on mobile */}
      {isMobile ? (
        <div
          data-testid="workspace-toolbar"
          className="flex items-center gap-1 border-b border-white/5 bg-[hsl(220,15%,10%)]/70 backdrop-blur-sm px-2"
          style={{ gridArea: "toolbar" }}
        >
          <ToolSidebar
            horizontal
            activeTool={activeTool}
            onToolToggle={toggle}
          />
        </div>
      ) : (
        <div
          data-testid="workspace-sidebar"
          className="flex flex-col items-center gap-1 border-r border-white/5 bg-[hsl(220,15%,10%)]/70 backdrop-blur-sm py-2"
          style={{
            gridArea: "sidebar",
            width: `${LAYOUT.TOOL_SIDEBAR_WIDTH}px`,
          }}
        >
          <ToolSidebar
            activeTool={activeTool}
            onToolToggle={toggle}
          />
        </div>
      )}

      {/* WaveformTimeline — center content area */}
      <div
        data-testid="workspace-waveform"
        className="relative min-h-0 overflow-hidden"
        style={{
          gridArea: "waveform",
          minHeight: `${LAYOUT.WAVEFORM_MIN_HEIGHT}px`,
        }}
      >
        {/* WaveformTimeline component will be rendered here */}

        {/* EffectsPanel overlay mode (tablet 768-1023px) */}
        {effectsOverlays && activeTool && (
          <div
            data-testid="workspace-effects-overlay"
            className="absolute inset-y-0 right-0 z-10 border-l border-white/5 bg-[hsl(220,15%,12%)]/80 backdrop-blur-md"
            style={{
              width: `${LAYOUT.EFFECTS_PANEL_WIDTH}px`,
              borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px 0 0 ${LAYOUT.PANEL_BORDER_RADIUS}px`,
            }}
          >
            <EffectsPanel
              activeTool={activeTool}
              onClose={close}
              isOverlay
              activeStemId={resolvedStemId}
            />
          </div>
        )}
      </div>

      {/* EffectsPanel — right column on desktop (only when pushed) */}
      <AnimatePresence>
        {effectsPushes && activeTool && (
          <div
            data-testid="workspace-effects"
            key="effects-panel"
            className="border-l border-white/5 bg-[hsl(220,15%,12%)]/80 backdrop-blur-md overflow-y-auto"
            style={{
              gridArea: "effects",
              width: `${LAYOUT.EFFECTS_PANEL_WIDTH}px`,
              borderRadius: `${LAYOUT.PANEL_BORDER_RADIUS}px 0 0 ${LAYOUT.PANEL_BORDER_RADIUS}px`,
            }}
          >
            <EffectsPanel
              activeTool={activeTool}
              onClose={close}
              activeStemId={resolvedStemId}
            />
          </div>
        )}
      </AnimatePresence>

      {/* MixerConsole — bottom, spans full width below sidebar+waveform */}
      <div
        data-testid="workspace-mixer"
        style={{ gridArea: "mixer" }}
      >
        <MixerConsole />
      </div>

      {/* Mobile bottom sheet for EffectsPanel */}
      <AnimatePresence>
        {isMobile && isOpen && activeTool && (
          <EffectsPanelBottomSheet
            activeTool={activeTool}
            onClose={close}
            activeStemId={resolvedStemId}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
