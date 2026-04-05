import { Link } from "react-router-dom";

const SubscriptionCancel = () => (
  <div className="sub-page">
    <div className="sub-card-active">
      <h1>Subscription cancelled</h1>
      <p className="muted">You weren't charged. You can upgrade anytime from your dashboard.</p>
      <Link to="/app" className="primary-button" style={{ marginTop: "1.25rem" }}>Back to dashboard</Link>
    </div>
  </div>
);

export default SubscriptionCancel;
