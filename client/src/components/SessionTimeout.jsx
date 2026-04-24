import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./ui/Modal";

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

  return (
    <Modal
      isOpen={showWarning}
      onClose={resetTimers}
      titleId="session-timeout-title"
      size="sm"
    >
      <h2 id="session-timeout-title" className="pp5-modal-title" style={{ textAlign: "center", marginBottom: 8 }}>
        Still there?
      </h2>
      <p className="pp5-modal-description" style={{ textAlign: "center" }}>
        You've been inactive. You'll be logged out in 5 minutes for your security.
      </p>
      <button
        type="button"
        className="pp5-btn pp5-btn-primary pp5-btn-block"
        style={{ width: "100%", marginTop: 20 }}
        onClick={resetTimers}
      >
        Stay logged in
      </button>
    </Modal>
  );
};

export default SessionTimeout;
