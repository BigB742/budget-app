import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const CheckEmail = () => {
  const [params] = useSearchParams();
  const email = params.get("email") || "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await fetch("http://localhost:5001/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch { /* ignore */ }
    finally { setResending(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Check your email</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          We sent a verification link to <strong>{email}</strong>. Click it to activate your account.
        </p>
        {resent ? (
          <p style={{ color: "var(--teal)", fontWeight: 600, marginTop: "0.75rem" }}>Email sent! Check your inbox.</p>
        ) : (
          <button type="button" className="secondary-button" style={{ marginTop: "0.75rem" }} onClick={handleResend} disabled={resending}>
            {resending ? "Sending..." : "Resend verification email"}
          </button>
        )}
        <p className="auth-footer"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
};

export default CheckEmail;
