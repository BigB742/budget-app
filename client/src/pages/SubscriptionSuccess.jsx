import { Link } from "react-router-dom";

const SubscriptionSuccess = () => (
  <div className="sub-page">
    <div className="sub-card-active">
      <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>&#x2713;</div>
      <h1>You're now a PayPulse Premium member!</h1>
      <p className="muted">Thank you for upgrading. You now have full access to all Premium features.</p>
      <Link to="/app" className="primary-button" style={{ marginTop: "1.25rem" }}>Go to dashboard</Link>
    </div>
  </div>
);

export default SubscriptionSuccess;
