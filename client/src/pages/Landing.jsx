import { Link } from "react-router-dom";

const Landing = () => (
  <div className="lp">
    {/* Nav */}
    <nav className="lp-nav">
      <div className="lp-brand"><span className="lp-dot" />PayPulse</div>
      <div className="lp-nav-right">
        <Link to="/login" className="lp-nav-link">Log in</Link>
        <Link to="/signup" className="primary-button">Get started free</Link>
      </div>
    </nav>

    {/* Hero */}
    <section className="lp-hero">
      <div className="lp-hero-inner">
        <h1>You check your bank account.<br />You see $1,000. You feel good.<br /><span className="lp-highlight">But after your bills — you actually have $647.</span></h1>
        <p className="lp-hero-sub">PayPulse shows you your REAL balance. Not what the bank shows you. What you actually have to spend until your next paycheck.</p>
        <div className="lp-hero-btns">
          <Link to="/signup" className="primary-button lp-cta">Get started free</Link>
          <a href="#how" className="ghost-button lp-cta-ghost">See how it works</a>
        </div>
      </div>
    </section>

    {/* How it works */}
    <section className="lp-section" id="how">
      <h2 className="lp-section-title">How it works</h2>
      <div className="lp-steps">
        <div className="lp-step"><span className="lp-step-icon">&#x1F4B5;</span><h3>Enter your paycheck</h3><p>Tell us when you get paid and how much. Takes 30 seconds.</p></div>
        <div className="lp-step"><span className="lp-step-icon">&#x1F4C5;</span><h3>Add your bills</h3><p>Add what you owe each month — rent, phone, subscriptions, anything.</p></div>
        <div className="lp-step"><span className="lp-step-icon">&#x2705;</span><h3>See your real balance</h3><p>We subtract everything you owe before your next paycheck. That's your actual money.</p></div>
      </div>
    </section>

    {/* Why PayPulse */}
    <section className="lp-section lp-gray">
      <h2 className="lp-section-title">Built for people who live paycheck to paycheck</h2>
      <div className="lp-features">
        <div className="lp-feature"><h3>No bank connection needed</h3><p>You enter your own data. Nothing gets miscategorized. You stay in control.</p></div>
        <div className="lp-feature"><h3>Bill reminders</h3><p>Get emailed before a bill hits so you never get caught off guard.</p></div>
        <div className="lp-feature"><h3>Future paycheck projections</h3><p>See what you'll have 3, 6, even 12 paychecks from now.</p></div>
        <div className="lp-feature"><h3>AI financial coach<span className="lp-badge">Coming soon</span></h3><p>Ask anything. "Can I afford this?" Get an honest answer based on YOUR actual numbers.</p></div>
      </div>
    </section>

    {/* Pricing */}
    <section className="lp-section" id="pricing">
      <h2 className="lp-section-title">Simple pricing</h2>
      <div className="lp-pricing">
        <div className="lp-price-card">
          <h3>Free</h3>
          <p className="lp-price">$0<span>/month forever</span></p>
          <ul><li>Real balance tracking</li><li>Up to 5 bills</li><li>Basic calendar</li><li>Bill reminders</li></ul>
          <Link to="/signup" className="primary-button" style={{ width: "100%" }}>Get started free</Link>
        </div>
        <div className="lp-price-card lp-premium">
          <div className="lp-save-badge">Save 28% annually</div>
          <h3>Premium</h3>
          <p className="lp-price">$6.99<span>/month or $59.99/year</span></p>
          <ul><li>Everything in Free</li><li>Unlimited bills &amp; history</li><li>AI financial coach</li><li>12-month projections</li><li>Debt payoff calculator</li><li>No ads</li></ul>
          <Link to="/signup" className="primary-button" style={{ width: "100%" }}>Start free trial</Link>
          <p className="lp-trial-note">7 days free, cancel anytime</p>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand"><span className="lp-dot" />PayPulse</div>
        <div className="lp-footer-links"><a href="#pricing">Pricing</a><Link to="/login">Log in</Link><Link to="/signup">Sign up</Link></div>
        <p className="lp-footer-copy">&copy; 2026 Productos La Loma</p>
      </div>
    </footer>
  </div>
);

export default Landing;
