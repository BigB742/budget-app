const express = require("express");
const Stripe = require("stripe");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");
const { upsertPremiumBill, removePremiumBill } = require("../utils/subscriptionBill");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Frontend base URL for Stripe redirect URLs. Override in env for local dev
// (APP_URL=http://localhost:5173) so checkout redirects back to your local
// server instead of the deployed one.
const FRONTEND_URL = process.env.APP_URL || "https://paypulse.money";

// Price IDs come from env vars only — NO fallbacks. Price IDs are
// environment-specific in Stripe: a test ID will never resolve against
// a live secret key and vice versa. Keeping a hardcoded fallback causes
// the exact failure we had on the live cutover: Stripe returns a cryptic
// "No such price" error and the frontend shows "Something went wrong".
//
// If these are missing the route responds 503 with an explicit error
// so the misconfiguration is visible in logs and in the UI.
const PLANS = {
  monthly: {
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID,
    trialDays: 3,
  },
  annual: {
    priceId: process.env.STRIPE_ANNUAL_PRICE_ID,
    trialDays: 0,
  },
};

// Resolve (or create) a Stripe customer for this user. Guarantees we never
// create a duplicate customer for the same email:
//   1. If Mongo already has user.stripeCustomerId → reuse it.
//   2. Else search Stripe by email — if a customer exists there, adopt it
//      and persist the id to Mongo.
//   3. Else explicitly create a new customer, persist the id to Mongo.
// The checkout session always receives `customer: <id>`, never
// `customer_email`, so Stripe has no opportunity to mint a second customer.
async function resolveStripeCustomer(user) {
  // Audit-trail logging removed per security audit. Re-enable via a real
  // logger (pino/winston) when one is wired up — payment customer
  // resolution is operationally important to trace.
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const existing = await stripe.customers.list({ email: user.email, limit: 1 });
  if (existing.data && existing.data.length > 0) {
    const found = existing.data[0];
    user.stripeCustomerId = found.id;
    await user.save();
    return found.id;
  }

  const created = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { userId: String(user._id) },
  });
  user.stripeCustomerId = created.id;
  await user.save();
  return created.id;
}

// POST /create-checkout-session — creates a Stripe Checkout session
router.post("/create-checkout-session", authRequired, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured." });
  try {
    const { plan } = req.body; // "monthly" or "annual"
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ error: "Invalid plan. Use 'monthly' or 'annual'." });

    // Fail fast with a clear error if the price IDs haven't been configured.
    if (!planConfig.priceId) {
      const envVar = plan === "annual" ? "STRIPE_ANNUAL_PRICE_ID" : "STRIPE_MONTHLY_PRICE_ID";
      console.error(`[Stripe] ${envVar} is not set — cannot create checkout session.`);
      return res.status(503).json({
        error: `Stripe ${plan} plan is not configured. Contact support.`,
        details: `Missing env var: ${envVar}`,
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const customerId = await resolveStripeCustomer(user);

    const sessionParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      // Force card capture up front even on trial sign-ups. Without this
      // Stripe allows "collect later" for subscriptions with a trial, so a
      // user could start a trial, never enter a card, and the conversion
      // on day 3 would just silently fail with no billing attempt.
      payment_method_collection: "always",
      success_url: `${FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/subscription/cancel`,
      client_reference_id: String(user._id),
      customer: customerId,
      metadata: { userId: String(user._id), plan },
    };

    // Add trial for monthly plan
    if (planConfig.trialDays > 0) {
      sessionParams.subscription_data = { trial_period_days: planConfig.trialDays };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (error) {
    // Log full error server-side for monitoring; never expose details
    // (type, code, raw message) to the client. The error code can leak
    // info about backend configuration to attackers.
    console.error("[Stripe] Checkout session error:", error?.type, "|", error?.code, "|", error?.message);
    res.status(500).json({
      success: false,
      error: "We couldn't start your checkout. Try again or contact support.",
    });
  }
});

// DELETE /subscription — cancel the authenticated user's Stripe
// subscription at period end. User keeps premium access until then.
router.delete("/subscription", authRequired, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured." });
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });
    if (!user.stripeCustomerId) {
      return res.status(400).json({ error: "No Stripe customer on file for this user." });
    }

    // Find the live subscription. Prefer the one saved on the user doc,
    // fall back to listing by customer and picking the first active or
    // trialing one.
    let sub = null;
    if (user.stripeSubscriptionId) {
      try {
        sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } catch (e) {
        // Stale subscription ID on user — fall through to list-by-customer.
        console.error("[Stripe] stripeSubscriptionId on user didn't resolve:", e.message);
      }
    }
    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) {
      const list = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 10 });
      sub = list.data.find((s) => s.status === "active" || s.status === "trialing");
    }
    if (!sub) {
      // Nothing to cancel — return 200 with a friendly message rather than
      // a 404. The UI should never show a raw error when the user clicks
      // cancel and there simply isn't an active sub (e.g. already canceled,
      // or state drift between Mongo and Stripe).
      return res.json({
        success: true,
        wasTrialing: false,
        endDate: null,
        message: "No active subscription found.",
      });
    }

    // Cancel at period end — Stripe will fire customer.subscription.updated
    // now (we'll mark the user canceled) and customer.subscription.deleted
    // later when the period actually ends (we'll clear isPremium + delete bill).
    const canceled = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });

    const wasTrialing = sub.status === "trialing";
    // For trialing subs the access end is the trial end; for active it's the current period end.
    const endUnix = wasTrialing ? (sub.trial_end || canceled.current_period_end) : canceled.current_period_end;
    const endDate = endUnix ? new Date(endUnix * 1000) : null;

    user.subscriptionStatus = "canceled";
    if (endDate) user.subscriptionEndDate = endDate;
    // isPremium stays TRUE — user retains access until endDate. The
    // subscription.deleted webhook will flip isPremium to false when Stripe
    // finishes the cancellation.
    await user.save();

    // Remove the "PayPulse Premium" recurring bill now so it stops appearing
    // on future calendar/bills views. (If we waited for subscription.deleted
    // it would sit there as a dead row for up to a month.)
    await removePremiumBill(user._id);

    res.json({
      success: true,
      wasTrialing,
      endDate: endDate ? endDate.toISOString() : null,
      message: wasTrialing
        ? "Trial canceled — you won't be charged."
        : "Subscription canceled — access continues until the end of the billing period.",
    });
  } catch (error) {
    console.error("[Stripe] Cancel subscription error:", error?.message);
    res.status(500).json({
      success: false,
      error: "Failed to cancel subscription. Try again or contact support.",
    });
  }
});

// POST /webhook — handles Stripe webhook events
router.post("/webhook", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured." });
  const sig = req.headers["stripe-signature"];
  let event;

  // Stripe signs the exact raw byte sequence. If body-parser has already
  // JSON-parsed it, we cannot reconstruct those bytes via JSON.stringify
  // (key order and whitespace differ), so HMAC verification will always
  // fail. We rely on `app.use("/api/stripe/webhook", express.raw(...))`
  // being mounted in index.js BEFORE express.json(). If req.body isn't a
  // Buffer here, that mount order is broken — fail loudly instead of
  // silently producing a bad signature.
  if (!Buffer.isBuffer(req.body)) {
    console.error("[Stripe Webhook] req.body is not a raw Buffer — express.raw() mount missing or ordered after express.json(). Signature verification cannot proceed.");
    return res.status(500).send("Webhook Error: raw body unavailable");
  }

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification FAILED:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const userId = session.client_reference_id || session.metadata?.userId;

        // Find user — email first, userId fallback.
        let user = null;
        if (customerEmail) user = await User.findOne({ email: customerEmail.toLowerCase() });
        if (!user && userId) user = await User.findById(userId);
        if (!user) {
          console.error("[Stripe Webhook] checkout.session.completed — no user found. email:", customerEmail, "userId:", userId);
          break;
        }

        // Use Stripe's authoritative subscription status so trial subs get
        // "trialing" (not "premium") and trial_end is persisted.
        let subStatus = "premium";
        let trialEnd = null;
        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            if (sub.status === "trialing") {
              subStatus = "trialing";
              if (sub.trial_end) trialEnd = new Date(sub.trial_end * 1000);
            }
          } catch (e) {
            console.error("[Stripe Webhook] subscription retrieve failed:", e.message);
          }
        }

        user.subscriptionStatus = subStatus;
        user.isPremium = true;
        if (!user.premiumSince) user.premiumSince = new Date();
        if (trialEnd) {
          user.trialStartDate = user.trialStartDate || new Date();
          user.trialEndDate = trialEnd;
        }
        if (session.customer) user.stripeCustomerId = session.customer;
        if (session.subscription) user.stripeSubscriptionId = session.subscription;
        await user.save();
        // Operational audit-trail logging removed per security audit.

        try {
          await upsertPremiumBill(user._id, trialEnd || new Date());
        } catch (billErr) {
          console.error("[Stripe Webhook] upsertPremiumBill failed:", billErr.message);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) break;

        // Map Stripe status → internal subscriptionStatus. "active" maps to
        // the existing "premium" enum value so the frontend useSubscription
        // hook continues to recognize paid users. past_due/unpaid preserve
        // that information (instead of collapsing to "free") so the user
        // sees an actionable "payment failed — update card" state.
        if (subscription.status === "trialing") {
          user.isPremium = true;
          user.subscriptionStatus = "trialing";
          if (subscription.trial_end) user.trialEndDate = new Date(subscription.trial_end * 1000);
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
        } else if (subscription.status === "active") {
          user.isPremium = true;
          user.subscriptionStatus = "premium";
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
        } else if (subscription.status === "past_due" || subscription.status === "unpaid") {
          user.isPremium = false;
          user.subscriptionStatus = "past_due";
        } else if (["canceled", "incomplete_expired", "incomplete", "paused"].includes(subscription.status)) {
          user.isPremium = false;
          user.subscriptionStatus = "free";
        }
        await user.save();
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook] customer.subscription.deleted received — sub:", subscription.id, "customer:", subscription.customer);
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) {
          console.log("[Stripe Webhook] customer.subscription.deleted — no matching user for sub/customer");
          break;
        }

        user.subscriptionStatus = "canceled";
        user.isPremium = false;
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = undefined;
        // Stamp the moment Stripe confirmed the cancellation so the DB
        // carries an audit trail of when the user actually dropped off.
        user.subscriptionCancelledAt = new Date();
        await user.save();
        console.log("[Stripe Webhook] customer.subscription.deleted — user", String(user._id), "canceled, isPremium=false, stripeSubscriptionId cleared");
        try { await removePremiumBill(user._id); } catch (e) { console.error("[Stripe Webhook] removePremiumBill failed:", e.message); }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (!user) break;

        user.subscriptionStatus = "past_due";
        user.isPremium = false;
        await user.save();
        break;
      }
    }
  } catch (err) {
    console.error("[Stripe Webhook] Handler error:", err.message);
    console.error("[Stripe Webhook] Stack:", err.stack);
  }

  res.json({ received: true });
});

module.exports = router;
