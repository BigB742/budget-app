import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../config";
import { storeUser } from "../utils/safeStorage";

const COUNTRY_CODES = [
  { code: "+1", country: "US", label: "+1 (USA)" },
  { code: "+52", country: "MX", label: "+52 (Mexico)" },
  { code: "+1", country: "CA", label: "+1 (Canada)" },
  { code: "+44", country: "GB", label: "+44 (UK)" },
  { code: "+55", country: "BR", label: "+55 (Brazil)" },
  { code: "+57", country: "CO", label: "+57 (Colombia)" },
  { code: "+54", country: "AR", label: "+54 (Argentina)" },
  { code: "+34", country: "ES", label: "+34 (Spain)" },
];

const Signup = () => {
  const [form, setForm] = useState({
    firstName: "", lastName: "", dateOfBirth: "", email: "",
    countryCode: "+1", phone: "", password: "", confirmPassword: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const passwordsMatch = form.password === form.confirmPassword;
  const passwordMismatch = form.confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = form.firstName && form.lastName && form.dateOfBirth && form.email && form.password && form.confirmPassword && passwordsMatch && agreed && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!passwordsMatch) { setError("Passwords don't match."); return; }
    if (!agreed) { setError("Please agree to the Terms of Service."); return; }
    setLoading(true);
    try {
      const phone = form.phone ? `${form.countryCode}${form.phone.replace(/\D/g, "")}` : "";
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Humanize common backend signup errors. The backend already
        // returns "Email already in use." for the duplicate-key case
        // (authRoutes.js), but Mongoose can also surface raw E11000
        // text if a future code path bubbles it up — catch both.
        const raw = (data.error || "").toLowerCase();
        let friendly = data.error || "Signup failed.";
        if (raw.includes("already in use") || raw.includes("e11000") || raw.includes("duplicate key")) {
          friendly = "That email is already registered. Try logging in instead.";
        } else if (raw.includes("password must")) {
          friendly = "Password must be at least 8 characters.";
        }
        throw new Error(friendly);
      }
      if (data.needsVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(data.email)}`);
      } else {
        localStorage.setItem("token", data.token);
        if (data.user) storeUser(data.user);
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
          <p className="brand-sub">by Productos La Loma</p>
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
            <label>Date of birth<input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} required /></label>
            <label>Email<input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Create a strong password" required /></label>
            <label>
              Confirm password
              <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required style={passwordMismatch ? { borderColor: "var(--red)" } : undefined} />
              {passwordMismatch && <span className="auth-field-error">Passwords do not match.</span>}
            </label>
            <label>Phone number
              <div className="auth-phone-row">
                <select name="countryCode" value={form.countryCode} onChange={handleChange} className="auth-country-select">
                  {COUNTRY_CODES.map((c) => <option key={c.country} value={c.code}>{c.label}</option>)}
                </select>
                <input type="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="555-123-4567" className="auth-phone-input" />
              </div>
            </label>
            <label className="auth-checkbox-row">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I agree to the <Link to="/terms" target="_blank">Terms of Service</Link> and understand that my subscription will auto-renew as described.</span>
            </label>
            {error && <p className="auth-error">{error}</p>}
            <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={!canSubmit}>{loading ? "Creating account..." : "Create account"}</button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
