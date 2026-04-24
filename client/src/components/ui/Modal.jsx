import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FocusTrap } from "focus-trap-react";

/**
 * Universal modal primitive. Portaled to #modal-root, viewport-centered,
 * body-scroll-locked, focus-trapped, ESC + backdrop dismissible, animated.
 *
 * Props:
 *   isOpen, onClose, titleId, describedById,
 *   size: "sm" | "md" | "lg"  (default "md")
 *   role: "dialog" | "alertdialog" (default "dialog")
 *   disableBackdropClose: bool — for destructive flows
 *   children
 */
export default function Modal({
  isOpen,
  onClose,
  titleId,
  describedById,
  size = "md",
  role = "dialog",
  disableBackdropClose = false,
  children,
}) {
  const [rendered, setRendered] = useState(isOpen);
  const [phase, setPhase] = useState(isOpen ? "open" : "closed");
  const contentRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      const id = requestAnimationFrame(() => setPhase("open"));
      return () => cancelAnimationFrame(id);
    }
    if (rendered) setPhase("closed");
    return undefined;
  }, [isOpen, rendered]);

  // Body scroll lock with scrollbar compensation + iOS scroll preservation.
  useLayoutEffect(() => {
    if (!rendered) return undefined;
    const scrollY = window.scrollY;
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prev = {
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    return () => {
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [rendered]);

  // ESC handler — stopPropagation so nested tours/sheets don't also react.
  useEffect(() => {
    if (!rendered) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rendered, onClose]);

  const onAnimationEnd = () => {
    if (phase === "closed") setRendered(false);
  };

  if (!rendered) return null;
  const root =
    typeof document !== "undefined" ? document.getElementById("modal-root") : null;
  if (!root) return null;

  return createPortal(
    <div
      className="pp-modal-backdrop"
      data-state={phase}
      onMouseDown={(e) => {
        if (disableBackdropClose) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
      onAnimationEnd={onAnimationEnd}
    >
      <FocusTrap
        active={phase === "open"}
        focusTrapOptions={{
          escapeDeactivates: false,
          clickOutsideDeactivates: false,
          returnFocusOnDeactivate: true,
          fallbackFocus: () => contentRef.current,
        }}
      >
        <div
          ref={contentRef}
          className={`pp-modal pp-modal--${size}`}
          data-state={phase}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedById}
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FocusTrap>
    </div>,
    root
  );
}
