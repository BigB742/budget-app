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
        <h1>
          Your bank says $2,341.<br />
          After bills, you actually have $847.<br />
          <span className="lp-highlight">
            That difference is the reason you overdraft.
          </span>
        </h1>
        <p className="lp-hero-sub">
          PayPulse shows you your REAL spending power -- not your bank balance,
          but the money that is actually yours after every bill, subscription,
          and obligation between now and your next paycheck.
        </p>
        <div className="lp-hero-btns">
          <Link to="/signup" className="primary-button lp-cta">
            Get started free
          </Link>
        </div>
      </div>
    </section>

    {/* How it works */}
    <section className="lp-section" id="how">
      <h2 className="lp-section-title">Three steps. Thirty seconds. Total clarity.</h2>
      <div className="lp-steps">
        <div className="lp-step">
          <div className="lp-step-num">1</div>
          <h3>Tell us your paycheck</h3>
          <p>
            Enter how much you bring home and when you get paid.
            Biweekly, weekly, twice a month -- we handle it all.
            Takes about 30 seconds.
          </p>
        </div>
        <div className="lp-step">
          <div className="lp-step-num">2</div>
          <h3>Add your bills</h3>
          <p>
            Rent, car payment, phone, Netflix, insurance -- drop in
            everything that pulls from your account each month.
          </p>
        </div>
        <div className="lp-step">
          <div className="lp-step-num">3</div>
          <h3>See your real number</h3>
          <p>
            We subtract every dollar you owe before your next payday.
            What is left is what you can actually spend -- no guessing,
            no mental math, no surprises.
          </p>
        </div>
      </div>
    </section>

    {/* Features */}
    <section className="lp-section lp-gray">
      <h2 className="lp-section-title">Built for people who budget by paycheck</h2>
      <div className="lp-features">
        <div className="lp-feature">
          <h3>Always know what is yours to spend</h3>
          <p>
            Your bank balance lies to you. It includes money already
            spoken for. PayPulse strips that away and shows the number
            that actually matters -- your true available cash.
          </p>
        </div>
        <div className="lp-feature">
          <h3>Never get caught off guard</h3>
          <p>
            Bill reminders hit your inbox before charges hit your account.
            No more scrambling to cover a payment you forgot was coming.
          </p>
        </div>
        <div className="lp-feature">
          <h3>See 12 months ahead<span className="lp-badge">Premium</span></h3>
          <p>
            Future paycheck projections show you exactly where you will
            stand 3, 6, even 12 months from now -- so you can plan that
            trip, that move, that big purchase with confidence.
          </p>
        </div>
        <div className="lp-feature">
          <h3>Your money, your data</h3>
          <p>
            No bank connection required. No passwords handed over. You
            enter your own numbers, you control everything, and nothing
            gets miscategorized by some algorithm.
          </p>
        </div>
      </div>
    </section>

    {/* Testimonials */}
    <section className="lp-section lp-testimonials">
      <h2 className="lp-section-title">What people are saying</h2>
      <div className="lp-quotes">
        <div className="lp-quote-card">
          <p>
            "I used to check my bank and think I had money. Then rent
            would hit and I would be negative. PayPulse fixed that in
            one day. I finally know what I can actually spend."
          </p>
          <span className="lp-quote-author">-- Marcus T., warehouse supervisor</span>
        </div>
        <div className="lp-quote-card">
          <p>
            "My husband and I get paid on different weeks. This app
            finally lets us see the full picture without a spreadsheet.
            We stopped overdrafting within the first month."
          </p>
          <span className="lp-quote-author">-- Daniela R., medical assistant</span>
        </div>
        <div className="lp-quote-card">
          <p>
            "I am not bad with money. I just never had a tool that
            thought about money the way I do -- paycheck to paycheck.
            PayPulse gets it."
          </p>
          <span className="lp-quote-author">-- James K., delivery driver</span>
        </div>
      </div>
    </section>

    {/* Pricing */}
    <section className="lp-section" id="pricing">
      <h2 className="lp-section-title">Simple pricing. No surprises.</h2>
      <div className="lp-pricing">
        <div className="lp-price-card">
          <h3>Free</h3>
          <p className="lp-price">$0<span>/month forever</span></p>
          <ul>
            <li>Real balance tracking</li>
            <li>Up to 5 bills</li>
            <li>Basic calendar view</li>
            <li>Bill reminders</li>
          </ul>
          <Link to="/signup" className="primary-button" style={{ width: "100%" }}>
            Get started free
          </Link>
        </div>
        <div className="lp-price-card lp-premium">
          <div className="lp-save-badge">Save 33% annually</div>
          <h3>Premium</h3>
          <p className="lp-price">$4.99<span>/month or $39.99/year</span></p>
          <ul>
            <li>Everything in Free</li>
            <li>Unlimited bills and history</li>
            <li>12-month paycheck projections</li>
            <li>Spending trends and insights</li>
            <li>Priority support</li>
            <li>No ads</li>
          </ul>
          <Link to="/signup" className="primary-button" style={{ width: "100%" }}>
            Start 3-day free trial
          </Link>
          <p className="lp-trial-note">
            Card required. Cancel before day 3 and you will not be charged.
          </p>
          <Link
            to="/signup"
            className="ghost-button"
            style={{ width: "100%", marginTop: "0.5rem", textAlign: "center", display: "block" }}
          >
            Get annual -- best value
          </Link>
        </div>
      </div>
    </section>

    {/* Footer */}
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand"><span className="lp-dot" />PayPulse</div>
        <div className="lp-footer-links">
          <a href="#pricing">Pricing</a>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>
        <p className="lp-footer-copy">&copy; 2026 Productos La Loma</p>
      </div>
    </footer>
  </div>
);

export default Landing;
