const express = require("express");
const Stripe = require("stripe");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const FRONTEND_URL = process.env.APP_URL || "https://paypulse-frontend.vercel.app";

const PLANS = {
  monthly: {
    priceId: "price_1TKXPzG0K5DOC4SQnXTMze8Q",
    trialDays: 3,
  },
  annual: {
    priceId: "price_1TKXQGG0K5DOC4SQ2EzwQL3y",
    trialDays: 0,
  },
};

// POST /create-checkout-session — creates a Stripe Checkout session
router.post("/create-checkout-session", authRequired, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured." });
  try {
    const { plan } = req.body; // "monthly" or "annual"
    const planConfig = PLANS[plan];
    if (!planConfig) return res.status(400).json({ error: "Invalid plan. Use 'monthly' or 'annual'." });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    const sessionParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: "https://paypulse-frontend.vercel.app/subscription/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://paypulse-frontend.vercel.app/subscription/cancel",
      client_reference_id: String(user._id),
      customer_email: user.email,
      metadata: { userId: String(user._id), plan },
    };

    // Add trial for monthly plan
    if (planConfig.trialDays > 0) {
      sessionParams.subscription_data = { trial_period_days: planConfig.trialDays };
    }

    // Reuse existing Stripe customer if they have one
    if (user.stripeCustomerId) {
      sessionParams.customer = user.stripeCustomerId;
      delete sessionParams.customer_email;
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
        const userId = session.client_reference_id || session.metadata?.userId;
        console.log("[Stripe Webhook] checkout.session.completed | userId:", userId, "| customer:", session.customer);
        if (!userId) { console.log("[Stripe Webhook] No userId found — skipping"); break; }

        const plan = session.metadata?.plan || "monthly";
        const subscriptionStatus = plan === "annual" ? "premium_annual" : "premium_monthly";

        const result = await User.findByIdAndUpdate(userId, {
          subscriptionStatus,
          isPremium: true,
          premiumSince: new Date(),
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        }, { new: true });
        console.log("[Stripe Webhook] User updated:", result ? { id: result._id, subscriptionStatus: result.subscriptionStatus, isPremium: result.isPremium } : "NOT FOUND");
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook] subscription.updated | subId:", subscription.id, "| status:", subscription.status);
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) { console.log("[Stripe Webhook] No user found for subscription", subscription.id); break; }
        console.log("[Stripe Webhook] Found user:", user._id);

        if (subscription.status === "active" || subscription.status === "trialing") {
          user.isPremium = true;
          if (subscription.plan?.interval === "year") user.subscriptionStatus = "premium_annual";
          else user.subscriptionStatus = "premium_monthly";
        } else {
          user.isPremium = false;
          user.subscriptionStatus = "expired";
        }
        const saved = await user.save();
        console.log("[Stripe Webhook] User saved:", { id: saved._id, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook] subscription.deleted | subId:", subscription.id);
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user) { console.log("[Stripe Webhook] No user found for subscription", subscription.id); break; }
        console.log("[Stripe Webhook] Found user:", user._id);

        user.subscriptionStatus = "expired";
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
