import { create } from "zustand";

export type ModalKey = "help" | "export" | "presets" | "game" | "upsell";

export type EditorPhase = "upload" | "split" | "configure" | "mix";

interface UiState {
  // Modal visibility
  activeModals: Partial<Record<ModalKey, boolean>>;
  openModal: (key: ModalKey) => void;
  closeModal: (key: ModalKey) => void;
  toggleModal: (key: ModalKey) => void;

  // Sidebar / Panels
  isSidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  
  // Tabs / Views
  pricingInitialTab: "subscriptions" | "packs";
  setPricingInitialTab: (tab: "subscriptions" | "packs") => void;

  // Feedback / Toasts
  undoToast: string | null;
  setUndoToast: (msg: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeModals: {},
  openModal: (key) => set((state) => ({ activeModals: { ...state.activeModals, [key]: true } })),
  closeModal: (key) => set((state) => ({ activeModals: { ...state.activeModals, [key]: false } })),
  toggleModal: (key) => set((state) => ({ activeModals: { ...state.activeModals, [key]: !state.activeModals[key] } })),

  isSidebarOpen: false,
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  pricingInitialTab: "subscriptions",
  setPricingInitialTab: (tab) => set({ pricingInitialTab: tab }),

  undoToast: null,
  setUndoToast: (msg) => set({ undoToast: msg }),
}));
