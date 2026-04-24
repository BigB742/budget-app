import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from "@floating-ui/react";
import { authFetch } from "../apiClient";
import { storeUser } from "../utils/safeStorage";
import { tourSteps, tourStepCount } from "../onboarding/tourSteps";

const getFirstName = () => {
  try { return JSON.parse(localStorage.getItem("user"))?.firstName || ""; } catch { return ""; }
};

// Scroll a target element into the viewport center and wait for the
// scroll to settle. `scrollend` doesn't fire if no scroll actually
// occurred (target already visible), so we race it with a 600ms
// fallback timer.
function revealTarget(el) {
  if (!el) return Promise.resolve();
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    document.addEventListener("scrollend", finish, { once: true });
    setTimeout(finish, 600);
  });
}

export default function TourOverlay({ onFinish }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState(null);
  const [spotlight, setSpotlight] = useState(null);
  const current = tourSteps[stepIndex];
  const firstName = getFirstName();

  // Floating UI placement — middleware mirrors the §10 brief: offset,
  // flip to fallback side when the primary side overflows, shift so
  // the tooltip never crosses the viewport edge.
  const { refs, floatingStyles, update } = useFloating({
    placement: current?.placement || "bottom",
    whileElementsMounted: autoUpdate,
    middleware: [offset(12), flip({ fallbackAxisSideDirection: "end" }), shift({ padding: 12 })],
  });

  // Dev-only audit. Warns once per selector on mount if anything
  // doesn't resolve so broken tours show up in the console during
  // development instead of spotlighting empty space at runtime.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    tourSteps.forEach((s, i) => {
      if (!s.target) return;
      if (!document.querySelector(s.target)) {
        // eslint-disable-next-line no-console
        console.warn(`[tour] step ${i + 1}/${tourSteps.length} selector not found: ${s.target}`);
      }
    });
  }, []);

  // Resolve + reveal + anchor the target on step changes. For the
  // final step we drop the anchor so the tooltip becomes a centered
  // full-screen card (handled in render below).
  useEffect(() => {
    if (!current || current.final) { setTargetEl(null); return; }
    const el = current.target ? document.querySelector(current.target) : null;
    if (!el) { setTargetEl(null); return; }
    let cancelled = false;
    revealTarget(el).then(() => {
      if (cancelled) return;
      setTargetEl(el);
      refs.setReference(el);
    });
    return () => { cancelled = true; };
  }, [current, refs]);

  // Measure spotlight rectangle once the target is pinned. useFloating
  // already handles the tooltip; this is only for the dimming cutout.
  useEffect(() => {
    if (!targetEl) { setSpotlight(null); return undefined; }
    const measure = () => {
      const r = targetEl.getBoundingClientRect();
      setSpotlight({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
      update();
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [targetEl, update]);

  const finish = useCallback(async () => {
    try {
      await authFetch("/api/user/me", {
        method: "PUT",
        body: JSON.stringify({ tourCompleted: true }),
      });
    } catch { /* ok */ }
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      u.tourCompleted = true;
      u.tourCompletedAt = new Date().toISOString();
      storeUser(u);
    } catch { /* ok */ }
    onFinish?.();
  }, [onFinish]);

  // Keyboard: Left/Right cycles, Escape ends.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); finish(); }
      else if (e.key === "ArrowRight") setStepIndex((i) => Math.min(tourSteps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setStepIndex((i) => Math.max(0, i - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish]);

  const modalRoot = typeof document !== "undefined"
    ? document.getElementById("modal-root")
    : null;
  if (!modalRoot || !current) return null;

  // Final card: centered, no anchor, primary CTA closes the tour.
  if (current.final) {
    return createPortal(
      <div className="pp-tour-overlay">
        <div className="pp-tour-final">
          <h2 className="pp-tour-final-title">You're all set{firstName ? `, ${firstName}` : ""}.</h2>
          <p className="pp-tour-final-body">PayPulse is ready. The more you use it, the more accurate your balance gets — start by checking your bills and logging your first expense.</p>
          <button type="button" className="primary-button pp-tour-final-btn" onClick={finish}>
            Start your trial
          </button>
        </div>
      </div>,
      modalRoot,
    );
  }

  const stepLabel = `Step ${stepIndex + 1} of ${tourStepCount}`;

  return createPortal(
    <div className="pp-tour-overlay">
      {spotlight && (
        <div
          className="pp-tour-spotlight"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
      <div
        ref={refs.setFloating}
        className="pp-tour-tooltip"
        style={floatingStyles}
        role="dialog"
        aria-modal="false"
        aria-labelledby="pp-tour-title"
        aria-describedby="pp-tour-body"
      >
        <div className="pp-tour-tt-title" id="pp-tour-title">{current.title}</div>
        <div className="pp-tour-tt-body" id="pp-tour-body">{current.body}</div>
        <div className="pp-tour-tt-footer">
          <span className="pp-tour-tt-count" aria-label={stepLabel}>{stepLabel}</span>
          <div className="pp-tour-tt-actions">
            <button type="button" className="pp-tour-skip" onClick={finish}>Skip tour</button>
            <button
              type="button"
              className="primary-button pp-tour-next"
              onClick={() => setStepIndex((i) => i + 1)}
            >
              {stepIndex === tourStepCount - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    modalRoot,
  );
}
