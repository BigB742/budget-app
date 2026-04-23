import { useState } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../apiClient";
import { useSubscription } from "../hooks/useSubscription";

const Subscription = () => {
  const { status, isPremium, isTrialing, trialDaysLeft } = useSubscription();
  const [loading, setLoading] = useState(null); // "monthly" | "annual" | null
  const [error, setError] = useState("");

  const handleSubscribe = async (plan) => {
    setLoading(plan);
    setError("");
    try {
      const data = await authFetch("/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      // Surface the backend error message instead of the generic fallback.
      // authFetch throws an Error whose .message is the server's `error` field.
      const msg = err?.message || "Something went wrong. Try again.";
      console.error("[Subscription] checkout failed:", err);
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  if (isPremium) {
    return (
      <div className="sub-page">
        <div className="sub-card-active">
          <h1>You're a Premium member</h1>
          <p>Status: <strong style={{ color: "var(--teal)" }}>{status === "premium_annual" ? "Annual plan" : "Monthly plan"}</strong></p>
          <p className="muted">Manage your subscription in Stripe's customer portal.</p>
          <Link to="/app" className="primary-button" style={{ marginTop: "1rem" }}>Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="sub-page">
      <h1 className="sub-heading">Upgrade to Premium</h1>
      <p className="sub-subtitle">Unlock the full power of PayPulse</p>

      {isTrialing && (
        <div className="sub-trial-banner">
          You're on a free trial. {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left
        </div>
      )}

      {error && (
        <div className="sub-error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="sub-plans">
        {/* Monthly */}
        <div className="sub-plan-card">
          <h3>Monthly</h3>
          <p className="sub-price">$4.99<span>/month</span></p>
          <ul>
            <li>Unlimited bills and history</li>
            <li>12-month paycheck projections</li>
            <li>Spending trends and insights</li>
            <li>No ads</li>
          </ul>
          <p className="sub-trial-note">Includes 3-day free trial</p>
          <button type="button" className="primary-button" style={{ width: "100%" }} onClick={() => handleSubscribe("monthly")} disabled={loading === "monthly"}>
            {loading === "monthly" ? "Redirecting..." : "Start free trial"}
          </button>
        </div>

        {/* Annual */}
        <div className="sub-plan-card sub-plan-best">
          <div className="sub-best-badge">Best value</div>
          <h3>Annual</h3>
          <p className="sub-price">$39.99<span>/year</span></p>
          <p className="sub-savings">Save 33% vs monthly</p>
          <ul>
            <li>Everything in Monthly</li>
            <li>Priority support</li>
            <li>Lock in the best price</li>
          </ul>
          <button type="button" className="primary-button" style={{ width: "100%" }} onClick={() => handleSubscribe("annual")} disabled={loading === "annual"}>
            {loading === "annual" ? "Redirecting..." : "Get annual plan"}
          </button>
        </div>
      </div>

      <Link to="/app" className="sub-back">Back to dashboard</Link>
    </div>
  );
};

export default Subscription;
