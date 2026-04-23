import { useEffect, useRef, useState } from "react";

import { currency } from "../utils/currency";

// Count-up animation for focal dollar amounts. Numbers should feel alive:
// on mount we lerp from the previous value (or 0) to the incoming value
// over `duration` ms using an ease-out curve, then settle. Uses
// requestAnimationFrame so it respects the main thread and stops cleanly.
//
// Props
// - value: the target number to display (required)
// - format: "currency" | "plain"   default "currency"
// - duration: ms to run the count-up   default 800
// - decimals: only applies to format="plain"   default 0
// - className: forwarded to the wrapping <span>
// - style: forwarded to the wrapping <span>
const easeOutSoft = (t) => {
  // cubic-bezier(0.22, 1, 0.36, 1) approximation via a closed form.
  // Matches the --ease-out-soft token in design-system.css so animated
  // numbers land at the same rhythm as page-entrance motion.
  return 1 - Math.pow(1 - t, 3);
};

const AnimatedNumber = ({
  value,
  format = "currency",
  duration = 800,
  decimals = 0,
  className,
  style,
}) => {
  const [display, setDisplay] = useState(value ?? 0);
  const rafRef = useRef(null);
  const startTsRef = useRef(0);
  const fromRef = useRef(value ?? 0);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;

    // Skip the count-up when the user prefers reduced motion.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    const from = Number.isFinite(fromRef.current) ? fromRef.current : 0;
    const to = Number(value);
    if (from === to) { setDisplay(to); return; }

    startTsRef.current = 0;
    const tick = (ts) => {
      if (!startTsRef.current) startTsRef.current = ts;
      const elapsed = ts - startTsRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutSoft(t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const formatted =
    format === "currency"
      ? currency.format(display)
      : display.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {formatted}
    </span>
  );
};

export default AnimatedNumber;
