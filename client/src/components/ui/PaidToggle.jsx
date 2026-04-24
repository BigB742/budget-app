import { useState } from "react";

/**
 * Mark-as-paid / Undo toggle (§7). Props:
 *   paid:      current paid state
 *   label:     composition text for aria-label, e.g.
 *              "Netflix, $15.99, due Oct 25"
 *   onToggle:  () => Promise<void> | void — callers perform the PATCH
 *              and reflect the new state by re-rendering with updated
 *              paid=...
 *   disabled:  optional, disables the button without a pending flag
 *
 * The button is aria-pressed and announces its action through
 * aria-label composition so screen readers always know what "Undo"
 * would undo.
 */
export default function PaidToggle({ paid, label, onToggle, disabled }) {
  const [pending, setPending] = useState(false);
  const text = paid ? "Undo" : "Mark paid";
  const handleClick = async () => {
    if (pending || disabled) return;
    setPending(true);
    try {
      await onToggle?.();
    } finally {
      setPending(false);
    }
  };
  return (
    <button
      type="button"
      className={`pp-paid-toggle${paid ? " is-paid" : ""}`}
      aria-pressed={paid}
      aria-label={`${text}: ${label || ""}`.trim()}
      disabled={pending || disabled}
      onClick={handleClick}
    >
      {pending ? "…" : text}
    </button>
  );
}
