import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:5001/api/auth/login";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const response = await fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) {
        if (data.needsVerification) { setNeedsVerification(true); setError("Please verify your email first. Check your inbox."); }
        else throw new Error(data.error || "Failed to login.");
        return;
      }
      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/app");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    try {
      await fetch("http://localhost:5001/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email }) });
      setError("Verification email sent! Check your inbox.");
      setNeedsVerification(false);
    } catch { /* ignore */ }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <p className="auth-subtitle">Welcome back! Sign in to continue.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Email<input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></label>
          <label>Password<input type="password" name="password" value={form.password} onChange={handleChange} placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;" required /></label>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Signing in..." : "Log in"}</button>
          {error && <p className="status status-error">{error}</p>}
          {needsVerification && (
            <button type="button" className="secondary-button" style={{ marginTop: "0.25rem" }} onClick={handleResend}>Resend verification email</button>
          )}
        </form>
        <p className="auth-footer">Don't have an account? <Link to="/signup">Create one</Link></p>
      </div>
    </div>
  );
};

export default Login;
