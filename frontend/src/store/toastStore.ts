/**
 * Toast notification store — lightweight Zustand store for app-wide toasts.
 */
import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "undo";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction;
  createdAt: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let nextId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++nextId}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, createdAt: Date.now() }],
    }));
    return id;
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearAll: () => set({ toasts: [] }),
}));

/** Convenience hook for dispatching toasts. */
export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  const removeToast = useToastStore((s) => s.removeToast);

  return {
    toast: (
      message: string,
      options: {
        type?: ToastType;
        duration?: number;
        action?: ToastAction;
      } = {},
    ) => {
      const { type = "info", duration = 4000, action } = options;
      return addToast({ message, type, duration, action });
    },
    dismiss: removeToast,
  };
}
