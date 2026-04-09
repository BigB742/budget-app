import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";

const ResetPassword = () => {
  const [params] = useSearchParams();
  const email = params.get("email") || "";

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);

  const handleChange = (i, val) => {
    const v = val.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      setDigits(text.split(""));
      refs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < 6) { setError("Please enter all 6 digits."); return; }
    if (!newPassword) { setError("Please enter a new password."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed.");
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const boxStyle = {
    width: "3rem", height: "3.5rem", textAlign: "center",
    fontSize: "1.5rem", fontWeight: 700,
    border: "2px solid var(--border)", borderRadius: "0.5rem",
    background: "var(--card)", color: "var(--text)", outline: "none",
  };

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>PayPulse</h1>
          <h2 style={{ fontSize: "1.15rem" }}>Password updated</h2>
          <p style={{ color: "var(--text-secondary)" }}>You can now log in with your new password.</p>
          <Link to="/login" className="primary-button" style={{ marginTop: "1rem", display: "inline-flex", textDecoration: "none" }}>Log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>Reset your password</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          Enter the 6-digit code we sent to <strong>{email || "your email"}</strong> and your new password.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", margin: "0.25rem 0 1.25rem" }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                style={boxStyle}
                autoFocus={i === 0}
              />
            ))}
          </div>
          <label>
            New password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Create a new password" />
          </label>
          <label>
            Confirm new password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Confirm your new password" />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Updating..." : "Reset password"}
          </button>
        </form>
        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
};

export default ResetPassword;
