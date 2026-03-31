import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setMessage("No verification token provided."); return; }
    (async () => {
      try {
        const res = await fetch(`http://localhost:5001/api/auth/verify-email?token=${token}`);
        const data = await res.json();
        if (res.ok && data.success) { setStatus("success"); setMessage("Email verified!"); }
        else { setStatus("error"); setMessage(data.error || "Verification failed."); }
      } catch { setStatus("error"); setMessage("Network error. Please try again."); }
    })();
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>PayPulse</h1>
        {status === "loading" && <p>Verifying your email...</p>}
        {status === "success" && (
          <>
            <p style={{ color: "var(--teal)", fontWeight: 700, fontSize: "1.1rem" }}>{message}</p>
            <p>Let's set up your account.</p>
            <Link to="/login" className="primary-button" style={{ display: "inline-flex", marginTop: "0.75rem", textDecoration: "none" }}>Log in to continue</Link>
          </>
        )}
        {status === "error" && (
          <>
            <p style={{ color: "var(--red)" }}>{message}</p>
            <Link to="/login" style={{ color: "var(--accent)" }}>Go to login</Link>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
