import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../apiClient";

const SubscriptionSuccess = () => {
  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "pending"

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 6; // ~12 seconds total

    const checkStatus = async () => {
      try {
        const profile = await authFetch("/api/user/me");
        if (profile) {
          localStorage.setItem("user", JSON.stringify(profile));
          if (profile.isPremium || profile.subscriptionStatus?.startsWith("premium") || profile.subscriptionStatus === "trialing") {
            setStatus("success");
            return true;
          }
        }
      } catch { /* ignore */ }
      return false;
    };

    const poll = async () => {
      const done = await checkStatus();
      if (done) return;
      attempts++;
      if (attempts >= maxAttempts) {
        setStatus("pending");
        return;
      }
      setTimeout(poll, 2000);
    };

    poll();
  }, []);

  return (
    <div className="sub-page">
      <div className="sub-card-active">
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>&#x2713;</div>
        {status === "verifying" && (
          <>
            <h1>Processing your payment...</h1>
            <p className="muted">We're confirming your subscription. This usually takes a few seconds.</p>
          </>
        )}
        {status === "success" && (
          <>
            <h1>You're now a PayPulse Premium member!</h1>
            <p className="muted">Thank you for upgrading. You now have full access to all Premium features.</p>
          </>
        )}
        {status === "pending" && (
          <>
            <h1>Payment received!</h1>
            <p className="muted">Your premium status may take a moment to activate. Try refreshing the dashboard in a minute.</p>
          </>
        )}
        <Link to="/app" className="primary-button" style={{ marginTop: "1.25rem" }}>Go to dashboard</Link>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
