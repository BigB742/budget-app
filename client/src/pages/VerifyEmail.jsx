import { useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { API_URL } from "../config";

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const navigate = useNavigate();

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
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
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed.");
      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/app");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResent(false);
    try {
      await fetch(`${API_URL}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch { /* ignore */ }
    finally { setResending(false); }
  };

  const boxStyle = {
    width: "3rem", height: "3.5rem", textAlign: "center",
    fontSize: "1.5rem", fontWeight: 700,
    border: "2px solid var(--border)", borderRadius: "0.5rem",
    background: "var(--card)", color: "var(--text)",
    outline: "none", transition: "border-color 0.15s",
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Check your email</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          We sent a 6-digit code to <strong>{email || "your email"}</strong>. Enter it below.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", margin: "0.5rem 0 1.25rem" }}>
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
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Verifying..." : "Verify email"}
          </button>
        </form>
        <p style={{ marginTop: "1.25rem", textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Didn't get it?{" "}
          <button type="button" className="link-button" onClick={handleResend} disabled={resending} style={{ fontSize: "0.85rem" }}>
            {resending ? "Sending..." : "Resend code"}
          </button>
        </p>
        {resent && (
          <p style={{ color: "var(--teal)", textAlign: "center", fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Code resent! Check your inbox.
          </p>
        )}
        <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          Don't see the email? Check your spam or junk folder.
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
