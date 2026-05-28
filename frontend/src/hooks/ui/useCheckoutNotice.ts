import { useState, useEffect } from "react";

export function useCheckoutNotice() {
  const [checkoutNotice, setCheckoutNotice] = useState<string | null>(null);

  useEffect(() => {
    const msg = window.sessionStorage.getItem("burntbeats_checkout_notice");
    if (!msg) return;
    setCheckoutNotice(msg);
    window.sessionStorage.removeItem("burntbeats_checkout_notice");
  }, []);

  return { checkoutNotice, setCheckoutNotice };
}
