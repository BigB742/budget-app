import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords don't match."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: form.password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        {done ? (
          <>
            <h2 style={{ fontSize: "1.15rem" }}>Password updated</h2>
            <p style={{ color: "var(--text-secondary)" }}>You can now log in with your new password.</p>
            <Link to="/login" className="primary-button" style={{ marginTop: "1rem", display: "inline-flex", textDecoration: "none" }}>Log in</Link>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>Set new password</h2>
            <form onSubmit={handleSubmit} className="auth-form">
              <label>New password<input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} required /></label>
              <label>Confirm password<input type="password" value={form.confirm} onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))} required /></label>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>{loading ? "Updating..." : "Update password"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
