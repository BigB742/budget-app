import { Link } from "react-router-dom";

const Terms = () => (
  <div className="terms-page">
    <div className="terms-inner">
      <h1>Terms of Service</h1>
      <p className="terms-updated">Last updated: April 2026</p>

      <h2>Who We Are</h2>
      <p>PayPulse is a personal finance budgeting tool created by Productos La Loma, based in Pacoima, California. We help you track your income, bills, and expenses so you always know what you actually have to spend.</p>

      <h2>What This Service Does</h2>
      <p>PayPulse is a budgeting tool, not a bank, not a financial advisor, and not a lending service. We do not hold your money, make transactions on your behalf, or provide investment advice. The information provided by PayPulse is for personal budgeting purposes only.</p>

      <div className="terms-highlight">
        <h2>Auto-Renewal Disclosure (California)</h2>
        <p>This disclosure is required by California Business and Professions Code Section 17600.</p>
        <ul>
          <li><strong>Free trial:</strong> Your subscription includes a 3-day free trial. During this period you have full access to all Premium features at no charge.</li>
          <li><strong>Automatic charges:</strong> Unless you cancel before the trial ends, your subscription will automatically renew at <strong>$4.99 per month</strong>. You will be charged on the day the trial ends and on that same date every month thereafter.</li>
          <li><strong>How to cancel:</strong> You can cancel at any time by going to Settings, then Subscription, then Cancel. If you cancel during the trial, you will not be charged.</li>
          <li><strong>After cancellation:</strong> You will retain access to Premium features until the end of your current billing period. After that, your account will revert to the Free tier.</li>
          <li><strong>No partial refunds</strong> are issued for unused portions of a billing period.</li>
        </ul>
      </div>

      <h2>Annual Plan</h2>
      <p>The annual plan is $39.99 per year, charged upfront. There is no free trial for the annual plan. Refunds are available within 7 days of purchase. After 7 days, no refunds are issued.</p>

      <h2>Your Data and Privacy</h2>
      <p>We collect the following information: your name, email address, date of birth, phone number (optional), and any financial data you choose to enter (income, bills, expenses). We do not sell your data to third parties. Your data is used solely to provide and improve the PayPulse service.</p>

      <h2>Age Requirement</h2>
      <p>You must be at least 13 years old to use PayPulse. If you are under 18, you should have a parent or guardian review these terms.</p>

      <h2>Limitation of Liability</h2>
      <p>PayPulse is provided as-is. We are not responsible for financial decisions you make based on the data displayed in the app. While we strive for accuracy, PayPulse is a budgeting tool and should not be relied upon as the sole basis for any financial decision.</p>

      <h2>Governing Law</h2>
      <p>These terms are governed by the laws of the State of California, United States of America.</p>

      <h2>Contact</h2>
      <p>For questions about these terms, contact us at <a href="mailto:contacto@productoslaloma.com">contacto@productoslaloma.com</a>.</p>

      <p className="terms-back"><Link to="/">Back to PayPulse</Link></p>
    </div>
  </div>
);

export default Terms;
