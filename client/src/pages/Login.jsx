import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";

const Login = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reason = params.get("reason");

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsVerification) {
          setNeedsVerification(true);
          setError("Please verify your email before logging in.");
        } else {
          // Humanize common backend messages.
          const raw = (data.error || "").toLowerCase();
          let friendly = "Something went wrong. Please try again.";
          if (raw.includes("invalid credentials")) friendly = "That email and password don't match. Please try again.";
          else if (raw.includes("too many")) friendly = "Too many attempts. Please wait a few minutes and try again.";
          throw new Error(friendly);
        }
        return;
      }
      // Handle 2FA challenge
      if (data.requires2FA) {
        navigate(`/verify-2fa?email=${encodeURIComponent(data.email)}`);
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
      await fetch(`${API_URL}/api/auth/resend-verification`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email }) });
      setError("Verification email sent! Check your inbox.");
      setNeedsVerification(false);
    } catch { /* ignore */ }
  };

  return (
    <div className="auth-split">
      <div className="auth-brand-panel">
        <div className="auth-brand-content">
          <div className="auth-brand-logo"><span className="lp-dot" />PayPulse</div>
          <p className="auth-brand-tagline">You got paid. But do you actually know what's yours to spend?</p>
          <ul className="auth-brand-list">
            <li>See your real spendable balance</li>
            <li>Never miss a bill again</li>
            <li>Know exactly where your money goes</li>
          </ul>
          <p className="brand-sub">by Productos La Loma</p>
        </div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h1>Welcome back</h1>
          {reason === "timeout" && <p className="auth-info">Session expired for your security. Please log in again.</p>}
          <form onSubmit={handleSubmit} className="auth-form">
            <label>Email<input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" value={form.password} onChange={handleChange} placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;" required /></label>
            {error && <p className="auth-error">{error}</p>}
            {needsVerification && <button type="button" className="secondary-button" style={{ width: "100%" }} onClick={handleResend}>Resend verification email</button>}
            <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>{loading ? "Signing in..." : "Log in"}</button>
          </form>
          <p className="auth-switch"><Link to="/forgot-password" style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Forgot password?</Link></p>
          <p className="auth-switch">Don't have an account? <Link to="/signup">Create one</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Login;
