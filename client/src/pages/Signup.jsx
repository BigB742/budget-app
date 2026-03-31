import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:5001/api/auth/signup";

const Signup = () => {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirmPassword: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => { setForm((p) => ({ ...p, [e.target.name]: e.target.value })); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      const response = await fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create account.");
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
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <p className="auth-subtitle">Create your account and take control of your money.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>Full name<input type="text" name="firstName" value={form.firstName} onChange={handleChange} placeholder="First name" required /></label>
          <label>&nbsp;<input type="text" name="lastName" value={form.lastName} onChange={handleChange} placeholder="Last name" required /></label>
          <label>Email<input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></label>
          <label>Phone (optional)<input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="(555) 123-4567" /></label>
          <label>Password<input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Create a strong password" required /></label>
          <label>Confirm password<input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} placeholder="Confirm password" required /></label>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Creating account..." : "Sign Up"}</button>
          {error && <p className="status status-error">{error}</p>}
        </form>
        <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
      </div>
    </div>
  );
};

export default Signup;
