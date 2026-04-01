import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000; // 25 minutes

const SessionTimeout = () => {
  const navigate = useNavigate();
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef(null);
  const warningRef = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login?reason=timeout");
  }, [navigate]);

  const resetTimers = useCallback(() => {
    setShowWarning(false);
    clearTimeout(timerRef.current);
    clearTimeout(warningRef.current);
    warningRef.current = setTimeout(() => setShowWarning(true), WARNING_MS);
    timerRef.current = setTimeout(logout, TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    const events = ["click", "scroll", "keydown", "mousemove", "touchstart"];
    const handler = () => { if (!showWarning) resetTimers(); };
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetTimers();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimeout(timerRef.current);
      clearTimeout(warningRef.current);
    };
  }, [resetTimers, showWarning]);

  if (!showWarning) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 100 }}>
      <div className="modal-card" style={{ maxWidth: 360, textAlign: "center" }}>
        <h4 style={{ margin: "0 0 0.5rem" }}>Still there?</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          You've been inactive. You'll be logged out in 5 minutes for your security.
        </p>
        <button type="button" className="primary-button" style={{ width: "100%" }} onClick={resetTimers}>
          Stay logged in
        </button>
      </div>
    </div>
  );
};

export default SessionTimeout;
