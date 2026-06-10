/** Layout state for the workspace phase. */
export interface WorkspaceLayoutState {
  mixerExpanded: boolean;
  toggleMixer: () => void;
  viewportSize: { width: number; height: number };
}

/** Quality mode for the stem splitting process. */
export type SplitQualityMode = 'low' | 'medium' | 'high';

/** Persisted split result stored in sessionStorage for workspace restoration. */
export interface PersistedSplitResult {
  stemIds: string[];
  stemCount: number;
  quality: SplitQualityMode;
  fileName: string;
  timestamp: number;
}
