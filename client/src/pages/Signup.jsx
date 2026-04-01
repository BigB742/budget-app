import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../config";

const Signup = () => {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed.");
      if (data.needsVerification) {
        navigate(`/check-email?email=${encodeURIComponent(data.email)}`);
      } else {
        localStorage.setItem("token", data.token);
        if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
        navigate("/app");
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
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
        </div>
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h1>Create your account</h1>
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-name-row">
              <label>First name<input type="text" name="firstName" value={form.firstName} onChange={handleChange} required /></label>
              <label>Last name<input type="text" name="lastName" value={form.lastName} onChange={handleChange} required /></label>
            </div>
            <label>Email<input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Create a strong password" required /></label>
            <label>Confirm password<input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required /></label>
            <label>Phone number (optional)<input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="(555) 123-4567" /></label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
