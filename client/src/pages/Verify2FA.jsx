import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_URL } from "../config";
import { storeUser } from "../utils/safeStorage";

const Verify2FA = () => {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-2fa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp: code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code.");
      localStorage.setItem("token", data.token);
      if (data.user) storeUser(data.user);
      navigate("/app");
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleResend = async () => {
    try {
      await fetch(`${API_URL}/api/auth/send-2fa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setResent(true);
      setTimeout(() => setResent(false), 60000);
    } catch { /* ignore */ }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>Enter your login code</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>We sent a 6-digit code to {email}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} required style={{ fontSize: "1.5rem", textAlign: "center", letterSpacing: "0.3em", fontWeight: 700 }} />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" style={{ width: "100%" }} disabled={loading || code.length < 6}>{loading ? "Verifying..." : "Verify"}</button>
        </form>
        <p style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {resent ? "Code sent!" : <button type="button" onClick={handleResend} style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", fontSize: "0.78rem" }}>Resend code</button>}
        </p>
      </div>
    </div>
  );
};

export default Verify2FA;
