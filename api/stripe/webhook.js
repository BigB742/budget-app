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

// Tell Vercel's Node runtime NOT to auto-parse the body.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  console.log("[Stripe Webhook Fn] Invoked. method =", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!stripe) {
    console.error("[Stripe Webhook Fn] STRIPE_SECRET_KEY not configured");
    return res.status(503).json({ error: "Stripe not configured." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("[Stripe Webhook Fn] Missing stripe-signature header");
    return res.status(400).json({ error: "Missing signature" });
  }

  let event;
  try {
    // Read body as raw — Vercel/Express may have pre-parsed req.body. If so,
    // use it directly as a Buffer, otherwise consume the stream.
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
      console.log("[Stripe Webhook Fn] Body was pre-parsed as Buffer");
    } else if (req.body && typeof req.body === "object") {
      // Vercel may have auto-parsed it as JSON — signature check will likely
      // fail here, but try anyway with re-serialized bytes.
      rawBody = Buffer.from(JSON.stringify(req.body));
      console.log("[Stripe Webhook Fn] Body was pre-parsed as object, re-serialized");
    } else {
      rawBody = await readRawBody(req);
      console.log("[Stripe Webhook Fn] Body read from raw stream, length =", rawBody.length);
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log("[Stripe Webhook Fn] ✓ Signature verified. Event:", event.type, "| id:", event.id);
  } catch (err) {
    console.error("[Stripe Webhook Fn] ✗ Signature verification FAILED:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await connectDB();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("[Stripe Webhook Fn] Step 1: checkout.session.completed");
        console.log("[Stripe Webhook Fn] Step 2: session id =", session.id, "| customer =", session.customer);

        const customerEmail = session.customer_email || session.customer_details?.email;
        const userId = session.client_reference_id || session.metadata?.userId;
        console.log("[Stripe Webhook Fn] Step 3: email =", customerEmail, "| userId =", userId);

        let user = null;
        if (customerEmail) {
          user = await User.findOne({ email: customerEmail.toLowerCase() });
          console.log("[Stripe Webhook Fn] Step 4a: email lookup →", user ? `found ${user._id}` : "not found");
        }
        if (!user && userId) {
          user = await User.findById(userId);
          console.log("[Stripe Webhook Fn] Step 4b: userId lookup →", user ? `found ${user._id}` : "not found");
        }
        if (!user) {
          console.error("[Stripe Webhook Fn] Step 5: NO USER FOUND — cannot upgrade");
          break;
        }

        console.log("[Stripe Webhook Fn] Step 6: upgrading", user.email);
        user.subscriptionStatus = "premium";
        user.isPremium = true;
        if (!user.premiumSince) user.premiumSince = new Date();
        if (session.customer) user.stripeCustomerId = session.customer;
        if (session.subscription) user.stripeSubscriptionId = session.subscription;
        const saved = await user.save();
        console.log("[Stripe Webhook Fn] Step 7: SAVED ✓", {
          id: saved._id.toString(),
          email: saved.email,
          subscriptionStatus: saved.subscriptionStatus,
          isPremium: saved.isPremium,
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook Fn] subscription.updated | subId:", subscription.id, "| status:", subscription.status);

        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) { console.log("[Stripe Webhook Fn] No user found"); break; }
        console.log("[Stripe Webhook Fn] Found user:", user._id, user.email);

        const activeStatuses = ["active", "trialing"];
        const downgradeStatuses = ["canceled", "incomplete_expired", "unpaid", "past_due", "incomplete", "paused"];

        if (activeStatuses.includes(subscription.status)) {
          user.isPremium = true;
          user.subscriptionStatus = "premium";
          if (!user.stripeSubscriptionId) user.stripeSubscriptionId = subscription.id;
        } else if (downgradeStatuses.includes(subscription.status)) {
          user.isPremium = false;
          user.subscriptionStatus = "free";
        }
        const saved = await user.save();
        console.log("[Stripe Webhook Fn] User saved:", { id: saved._id, subscriptionStatus: saved.subscriptionStatus, isPremium: saved.isPremium });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("[Stripe Webhook Fn] subscription.deleted | subId:", subscription.id);
        let user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (!user && subscription.customer) user = await User.findOne({ stripeCustomerId: subscription.customer });
        if (!user) break;
        user.isPremium = false;
        user.subscriptionStatus = "free";
        user.stripeSubscriptionId = null;
        await user.save();
        console.log("[Stripe Webhook Fn] User downgraded to free:", user.email);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("[Stripe Webhook Fn] invoice.payment_failed | customer:", invoice.customer);
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (!user) break;
        user.isPremium = false;
        user.subscriptionStatus = "free";
        await user.save();
        console.log("[Stripe Webhook Fn] User downgraded after payment failure:", user.email);
        break;
      }

      default:
        console.log("[Stripe Webhook Fn] Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("[Stripe Webhook Fn] Handler error:", err.message);
    console.error("[Stripe Webhook Fn] Stack:", err.stack);
  }

  res.json({ received: true });
};
