// Dedicated Stripe webhook serverless function.
//
// Runs OUTSIDE the Express app so Stripe signature verification works
// reliably on Vercel — we read the request body as a raw stream before
// anything else touches it. Express body parsers or Vercel's built-in
// JSON parser would otherwise consume and mutate the bytes, breaking
// the HMAC check.
//
// Handles: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted, invoice.payment_failed.

require("dotenv").config();

const Stripe = require("stripe");
const mongoose = require("mongoose");
const User = require("../../models/User");
const { upsertPremiumBill, removePremiumBill } = require("../../utils/subscriptionBill");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Serverless MongoDB connection caching (shared across warm invocations)
let cachedConn = null;
async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  cachedConn = await mongoose.connect(process.env.MONGO_URI, {});
  return cachedConn;
}

// Read the raw request body before any parser touches it.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// NOTE: The `config` export must be assigned AFTER module.exports is set to
// the handler function. If we set module.exports.config first and then
// module.exports = async ..., the second assignment replaces the exports
// object entirely and the config is silently lost — Vercel falls back to
// auto-parsing the body, which breaks Stripe signature verification. Order
// matters: handler first, then attach config as a property of it.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!stripe) {
    console.error("[Stripe Webhook] STRIPE_SECRET_KEY not configured");
    return res.status(503).json({ error: "Stripe not configured." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("[Stripe Webhook] Missing stripe-signature header");
    return res.status(400).json({ error: "Missing signature" });
  }

  let event;
  try {
    // Prefer the raw stream. Vercel may pre-parse the body in some cases
    // (if config.api.bodyParser=false fails to apply) — we tolerate that
    // by re-serializing, though signature verification usually fails in
    // that path since Stripe signs the original byte sequence.
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else if (req.body && typeof req.body === "object") {
      rawBody = Buffer.from(JSON.stringify(req.body));
    } else {
      rawBody = await readRawBody(req);
    }
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await connectDB();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const userId = session.client_reference_id || session.metadata?.userId;

        let user = null;
        if (customerEmail) user = await User.findOne({ email: customerEmail.toLowerCase() });
        if (!user && userId) user = await User.findById(userId);
        if (!user) {
          console.error("[Stripe Webhook] checkout.session.completed — no user for email:", customerEmail, "userId:", userId);
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
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) break;
        user.isPremium = false;
        user.subscriptionStatus = "free";
        user.stripeSubscriptionId = null;
        user.subscriptionEndDate = undefined;
        await user.save();
        try { await removePremiumBill(user._id); } catch (e) { console.error("[Stripe Webhook] removePremiumBill failed:", e.message); }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (!user) break;
        user.isPremium = false;
        user.subscriptionStatus = "free";
        await user.save();
        break;
      }
    }
  } catch (err) {
    console.error("[Stripe Webhook] Handler error:", err.message);
    console.error("[Stripe Webhook] Stack:", err.stack);
  }

  res.json({ received: true });
};

// Disable Vercel's automatic body parsing so we can read the raw stream for
// Stripe signature verification. Assigned AFTER module.exports so it
// actually lands on the handler function.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
