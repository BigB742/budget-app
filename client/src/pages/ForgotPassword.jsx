import { useState } from "react";
import { Link } from "react-router-dom";
import { API_URL } from "../config";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setSent(true);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        {sent ? (
          <>
            <h2 style={{ fontSize: "1.15rem" }}>Check your email</h2>
            <p style={{ color: "var(--text-secondary)" }}>If an account exists for {email}, we sent a password reset link.</p>
            <Link to="/login" className="primary-button" style={{ marginTop: "1rem", display: "inline-flex", textDecoration: "none" }}>Back to login</Link>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>Forgot password?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>Enter your email and we'll send you a reset link.</p>
            <form onSubmit={handleSubmit} className="auth-form">
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>{loading ? "Sending..." : "Send reset link"}</button>
            </form>
            <p className="auth-switch"><Link to="/login">Back to login</Link></p>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
