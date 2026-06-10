/** Layout dimension and timing constants for the stem editor UI. */
export const LAYOUT = {
  /** Header bar height in px */
  HEADER_HEIGHT: 56,
  /** Transport bar height in px */
  TRANSPORT_HEIGHT: 48,
  /** Tool sidebar width in px */
  TOOL_SIDEBAR_WIDTH: 64,
  /** Effects panel width in px */
  EFFECTS_PANEL_WIDTH: 320,
  /** Maximum mixer height as ratio of workspace height */
  MIXER_MAX_HEIGHT_RATIO: 0.3,
  /** Minimum waveform display height in px */
  WAVEFORM_MIN_HEIGHT: 200,
  /** Panel border radius in px */
  PANEL_BORDER_RADIUS: 16,
  /** Default transition duration in ms */
  TRANSITION_DURATION: 300,
  /** Effects panel slide animation duration in ms */
  EFFECTS_SLIDE_DURATION: 250,
  /** Tablet breakpoint in px */
  BREAKPOINT_TABLET: 768,
  /** Desktop breakpoint in px */
  BREAKPOINT_DESKTOP: 1024,
} as const;
