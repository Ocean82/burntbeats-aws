import { useState } from "react";

function readCheckoutNoticeFromSession(): string | null {
  if (typeof window === "undefined") return null;
  const msg = window.sessionStorage.getItem("burntbeats_checkout_notice");
  if (!msg) return null;
  window.sessionStorage.removeItem("burntbeats_checkout_notice");
  return msg;
}

export function useCheckoutNotice() {
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(
    readCheckoutNoticeFromSession,
  );

  return { checkoutNotice, setCheckoutNotice };
}
