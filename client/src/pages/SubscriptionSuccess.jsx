import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("confirming"); // "confirming" | "success" | "pending"

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5; // 5 × 2s = 10 seconds

    const checkOnce = async () => {
      try {
        const profile = await authFetch("/api/user/me");
        if (!profile || cancelled) return false;
        localStorage.setItem("user", JSON.stringify(profile));
        if (profile.isPremium) {
          setStatus("success");
          // Brief pause so the user sees the success message, then go to dashboard
          setTimeout(() => { if (!cancelled) navigate("/app"); }, 1200);
          return true;
        }
      } catch { /* network error — keep polling */ }
      return false;
    };

    const poll = async () => {
      if (cancelled) return;
      const done = await checkOnce();
      if (done) return;
      attempts++;
      if (attempts >= maxAttempts) {
        // Webhook hasn't updated the user in 10s — show pending state
        if (!cancelled) setStatus("pending");
        return;
      }
      setTimeout(poll, 2000);
    };

    // First check immediately, then poll every 2s
    poll();

    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="sub-page">
      <div className="sub-card-active">
        {status === "confirming" && (
          <>
            <div className="sub-spinner" aria-hidden="true" />
            <h1>Confirming your subscription...</h1>
            <p className="muted">This usually takes just a few seconds.</p>
          </>
        )}
        {status === "success" && (
          <>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem", color: "#22C55E" }}>&#x2713;</div>
            <h1>You're now a PayPulse Premium member!</h1>
            <p className="muted">Redirecting you to your dashboard...</p>
          </>
        )}
        {status === "pending" && (
          <>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>&#x23F3;</div>
            <h1>Payment received</h1>
            <p className="muted">Your Premium status is still activating. Please refresh the dashboard in a minute if it doesn't appear automatically.</p>
            <button type="button" className="primary-button" style={{ marginTop: "1.25rem" }} onClick={() => navigate("/app")}>Go to dashboard</button>
          </>
        )}
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
