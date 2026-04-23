import { useEffect, useRef } from "react";

const SideSheet = ({
  open,
  onClose,
  title,
  subtitle,
  headerExtra = null,
  children,
  width = 480,
  ariaLabel,
}) => {
  const sheetRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;
    const focusable = el.querySelector(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    (focusable || el).focus?.();
  }, [open]);

  return (
    <>
      <div
        className={`pp-sheet-backdrop${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        ref={sheetRef}
        className={`pp-sheet${open ? " open" : ""}`}
        style={{ "--pp-sheet-width": `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || "Details"}
        aria-hidden={!open}
        tabIndex={-1}
      >
        <header className="pp-sheet-header">
          <div className="pp-sheet-header-text">
            {title && <h2 className="pp-sheet-title">{title}</h2>}
            {subtitle && <p className="pp-sheet-subtitle">{subtitle}</p>}
          </div>
          {headerExtra}
          <button
            type="button"
            className="pp-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="pp-sheet-body">{children}</div>
      </aside>
    </>
  );
};

export default SideSheet;
