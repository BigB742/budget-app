import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../config";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always navigate — don't reveal whether the email exists
      navigate(`/reset-password?email=${encodeURIComponent(email)}`);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>Forgot password?</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Enter your email and we'll send you a reset code.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Sending..." : "Send reset code"}
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
};

export default ForgotPassword;
