import { useState, useCallback } from "react";

export function useModalManager() {
  const [activeModals, setActiveModals] = useState<Record<string, boolean>>({});

  const openModal = useCallback((key: string) => {
    setActiveModals((prev) => ({ ...prev, [key]: true }));
  }, []);

  const closeModal = useCallback((key: string) => {
    setActiveModals((prev) => ({ ...prev, [key]: false }));
  }, []);

  const isModalOpen = useCallback((key: string) => !!activeModals[key], [activeModals]);

  return {
    openModal,
    closeModal,
    isModalOpen,
    activeModals,
  };
}
