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
const FRONTEND_URL = process.env.APP_URL || "https://paypulse-frontend.vercel.app";

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
  if (user.stripeCustomerId) {
    console.log("[Stripe] Reusing cached customer", user.stripeCustomerId, "for", user.email);
    return user.stripeCustomerId;
  }

  const existing = await stripe.customers.list({ email: user.email, limit: 1 });
  if (existing.data && existing.data.length > 0) {
    const found = existing.data[0];
    console.log("[Stripe] Adopted existing Stripe customer", found.id, "for", user.email);
    user.stripeCustomerId = found.id;
    await user.save();
    return found.id;
  }

  const created = await stripe.customers.create({
    email: user.email,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
    metadata: { userId: String(user._id) },
  });
  console.log("[Stripe] Created new Stripe customer", created.id, "for", user.email);
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
    console.log("[Stripe] Checkout session created:", session.id, "for user", user.email, "| plan:", plan);
    res.json({ url: session.url });
  } catch (error) {
    // Log full error for Vercel runtime logs
    console.error("[Stripe] Checkout session error:", error?.type, "|", error?.code, "|", error?.message);
    console.error("[Stripe] Full error:", error);

    // Surface Stripe's error message to the frontend when possible. The old
    // generic "Failed to create checkout session." swallowed details like
    // "No such price: price_xxx" that would have pinpointed the live/test
    // price-ID mismatch immediately.
    const isStripeError = error?.type?.startsWith?.("Stripe");
    const status = isStripeError ? 400 : 500;
    res.status(status).json({
      error: isStripeError
        ? `Stripe error: ${error.message}`
        : "Failed to create checkout session.",
      code: error?.code,
      type: error?.type,
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
        console.warn("[Stripe] stripeSubscriptionId on user didn't resolve:", e.message);
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
      console.log("[Stripe] cancel-subscription: no active sub for", user.email);
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
    console.log("[Stripe] cancel_at_period_end=true for sub", sub.id, "| status:", canceled.status);

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
    console.error("[Stripe] Cancel subscription error:", error);
    const isStripeError = error?.type?.startsWith?.("Stripe");
    res.status(isStripeError ? 400 : 500).json({
      error: isStripeError ? `Stripe error: ${error.message}` : "Failed to cancel subscription.",
    });
  }
});

// POST /webhook — handles Stripe webhook events
router.post("/webhook", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured." });
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Handle both raw Buffer (local dev) and pre-parsed body (Vercel serverless)
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log("[Stripe Webhook] Event received:", event.type, "| Event ID:", event.id);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification FAILED:", err.message);
    console.error("[Stripe Webhook] Body type:", typeof req.body, "| isBuffer:", Buffer.isBuffer(req.body));
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
        console.log(`[Stripe Webhook] Upgraded ${user.email} → ${subStatus}`);

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

        // trialing → trialing, active → premium, canceled/incomplete_expired/unpaid/past_due → free.
        const downgradeStatuses = ["canceled", "incomplete_expired", "unpaid", "past_due", "incomplete", "paused"];
        if (subscription.status === "trialing") {
          user.isPremium = true;
          user.subscriptionStatus = "trialing";
          if (subscription.trial_end) user.trialEndDate = new Date(subscription.trial_end * 1000);
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
        } else if (subscription.status === "active") {
          user.isPremium = true;
          user.subscriptionStatus = "premium";
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
        } else if (downgradeStatuses.includes(subscription.status)) {
          user.isPremium = false;
          user.subscriptionStatus = "free";
        }
        await user.save();
        console.log(`[Stripe Webhook] subscription.updated ${user.email} → ${user.subscriptionStatus} (Stripe: ${subscription.status})`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) break;

        user.subscriptionStatus = "free";
        user.isPremium = false;
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = undefined;
        await user.save();
        try { await removePremiumBill(user._id); } catch (e) { console.error("[Stripe Webhook] removePremiumBill failed:", e.message); }
        console.log(`[Stripe Webhook] subscription.deleted ${user.email} → free`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (!user) break;

        user.subscriptionStatus = "expired";
        user.isPremium = false;
        await user.save();
        console.log(`[Stripe Webhook] invoice.payment_failed ${user.email} → expired`);
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
