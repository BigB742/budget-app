const express = require("express");
const Stripe = require("stripe");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const FRONTEND_URL = process.env.APP_URL || "https://paypulse-frontend.vercel.app";

// Price IDs live in env vars so we can swap live/test without a code change.
// The fallbacks below are the test-mode IDs from PayPulse's test Stripe
// account — they only work when STRIPE_SECRET_KEY is a test key. In
// production, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_ANNUAL MUST be set to
// live price IDs (price_xxx created in the live Stripe dashboard).
const PLANS = {
  monthly: {
    priceId: process.env.STRIPE_PRICE_MONTHLY || "price_1TKXPzG0K5DOC4SQnXTMze8Q",
    trialDays: 3,
  },
  annual: {
    priceId: process.env.STRIPE_PRICE_ANNUAL || "price_1TKXQGG0K5DOC4SQ2EzwQL3y",
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

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const customerId = await resolveStripeCustomer(user);

    const sessionParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: "https://paypulse-frontend.vercel.app/subscription/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://paypulse-frontend.vercel.app/subscription/cancel",
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
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: "Failed to create checkout session." });
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
        console.log("[Stripe Webhook] Step 1: checkout.session.completed received");
        console.log("[Stripe Webhook] Step 2: session id =", session.id, "| customer =", session.customer, "| subscription =", session.subscription);

        // Extract email from both possible locations
        const customerEmail = session.customer_email || session.customer_details?.email;
        const userId = session.client_reference_id || session.metadata?.userId;
        console.log("[Stripe Webhook] Step 3: customer_email =", customerEmail, "| metadata userId =", userId);

        // Find user — try email first (per ITEM 1 spec), fall back to metadata userId
        let user = null;
        if (customerEmail) {
          user = await User.findOne({ email: customerEmail.toLowerCase() });
          console.log("[Stripe Webhook] Step 4a: lookup by email →", user ? `found user ${user._id}` : "not found");
        }
        if (!user && userId) {
          user = await User.findById(userId);
          console.log("[Stripe Webhook] Step 4b: fallback lookup by userId →", user ? `found user ${user._id}` : "not found");
        }
        if (!user) {
          console.error("[Stripe Webhook] Step 5: NO USER FOUND — cannot upgrade to premium. email:", customerEmail, "userId:", userId);
          break;
        }

        console.log("[Stripe Webhook] Step 6: upgrading user", user.email, "to premium");
        user.subscriptionStatus = "premium";
        user.isPremium = true;
        if (!user.premiumSince) user.premiumSince = new Date();
        if (session.customer) user.stripeCustomerId = session.customer;
        if (session.subscription) user.stripeSubscriptionId = session.subscription;
        const saved = await user.save();
        console.log("[Stripe Webhook] Step 7: SAVED ✓", { id: saved._id, email: saved.email, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium, stripeCustomerId: saved.stripeCustomerId });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook] Step 1: subscription.updated | subId:", subscription.id, "| status:", subscription.status);

        // Find user by subscription ID first, then by customer ID as fallback
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) { console.log("[Stripe Webhook] Step 2: No user found for subscription", subscription.id); break; }
        console.log("[Stripe Webhook] Step 2: Found user:", user._id, user.email);

        // active/trialing → premium. canceled/incomplete_expired/unpaid/past_due → free.
        const activeStatuses = ["active", "trialing"];
        const downgradeStatuses = ["canceled", "incomplete_expired", "unpaid", "past_due", "incomplete", "paused"];

        if (activeStatuses.includes(subscription.status)) {
          user.isPremium = true;
          user.subscriptionStatus = "premium";
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
          console.log("[Stripe Webhook] Step 3: Setting user to premium (status:", subscription.status, ")");
        } else if (downgradeStatuses.includes(subscription.status)) {
          user.isPremium = false;
          user.subscriptionStatus = "free";
          console.log("[Stripe Webhook] Step 3: Downgrading user to free (status:", subscription.status, ")");
        } else {
          console.log("[Stripe Webhook] Step 3: Unrecognized status:", subscription.status, "— leaving unchanged");
        }
        const saved = await user.save();
        console.log("[Stripe Webhook] Step 4: SAVED ✓", { id: saved._id, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook] subscription.deleted | subId:", subscription.id);
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) { console.log("[Stripe Webhook] No user found for subscription", subscription.id); break; }
        console.log("[Stripe Webhook] Found user:", user._id);

        user.subscriptionStatus = "free";
        user.isPremium = false;
        user.stripeSubscriptionId = null;
        const saved = await user.save();
        console.log("[Stripe Webhook] User saved:", { id: saved._id, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("[Stripe Webhook] invoice.payment_failed | customer:", invoice.customer);
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (!user) { console.log("[Stripe Webhook] No user found for customer", invoice.customer); break; }
        console.log("[Stripe Webhook] Found user:", user._id);

        user.subscriptionStatus = "expired";
        user.isPremium = false;
        const saved = await user.save();
        console.log("[Stripe Webhook] User saved:", { id: saved._id, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium });
        break;
      }

      default:
        console.log("[Stripe Webhook] Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("[Stripe Webhook] Handler error:", err.message);
    console.error("[Stripe Webhook] Stack:", err.stack);
  }

  res.json({ received: true });
});

module.exports = router;
