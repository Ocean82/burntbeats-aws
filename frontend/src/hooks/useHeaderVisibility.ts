import { useEffect, useRef, useState } from "react";

export function useHeaderVisibility() {
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        if (currentScrollY < 10) {
          setHeaderVisible(true);
        } else if (currentScrollY > lastScrollY.current + 5) {
          setHeaderVisible(false);
        } else if (currentScrollY < lastScrollY.current - 5) {
          setHeaderVisible(true);
        }
        lastScrollY.current = currentScrollY;
        ticking = false;
      });
      ticking = true;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { headerVisible };
}
