const express = require("express");
const Stripe = require("stripe");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authRequired } = require("../middleware/auth");
const User = require("../models/User");
const Bill = require("../models/Bill");
const IncomeSource = require("../models/IncomeSource");
const Expense = require("../models/Expense");
const SavingsGoal = require("../models/SavingsGoal");
const PaySchedule = require("../models/PaySchedule");
const BillPayment = require("../models/BillPayment");
const OneTimeIncome = require("../models/OneTimeIncome");
const Investment = require("../models/Investment");
const Debt = require("../models/Debt");
const PaymentOverride = require("../models/PaymentOverride");
const FeatureFlag = require("../models/FeatureFlag");
const SupportTicket = require("../models/SupportTicket");
const { sendEmail } = require("../utils/email");
const {
  buildSupportReplyEmail,
  buildAccountDeletedEmail,
  SUPPORT_EMAIL,
} = require("../utils/emailTemplates");

const router = express.Router();

// All admin routes require auth + admin role
router.use(authRequired, async (req, res, next) => {
  const user = await User.findById(req.userId).select("isAdmin email");
  if (!user?.isAdmin && user?.email !== "admin@productoslaloma.com") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ── USERS ────────────────────────────────────────────────────────────────────

// GET /api/admin/users — list all users with enriched data
router.get("/users", async (req, res) => {
  try {
    const users = await User.find({}).select("-passwordHash").lean();
    const enriched = await Promise.all(users.map(async (u) => {
      const [sources, bills, expenses, savings] = await Promise.all([
        IncomeSource.find({ user: u._id, isActive: true }).lean(),
        Bill.find({ user: u._id, isActive: { $ne: false } }).lean(),
        Expense.find({ $or: [{ user: u._id }, { userId: u._id }] }).sort({ createdAt: -1 }).limit(20).lean(),
        SavingsGoal.find({ userId: u._id }).lean(),
      ]);
      const lastLogin = (u.loginHistory || []).length > 0 ? u.loginHistory[u.loginHistory.length - 1]?.timestamp : null;
      return {
        ...u,
        incomeSources: sources,
        bills,
        expenses,
        savings,
        billCount: bills.length,
        incomeCount: sources.length,
        lastLogin,
      };
    }));
    res.json(enriched);
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Failed to load users." });
  }
});

// DELETE /api/admin/users/:id — delete user and all data, send notification email
router.delete("/users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });

    await Promise.all([
      IncomeSource.deleteMany({ user: userId }),
      Bill.deleteMany({ user: userId }),
      Expense.deleteMany({ $or: [{ user: userId }, { userId }] }),
      SavingsGoal.deleteMany({ userId }),
      PaySchedule.deleteMany({ user: userId }),
      BillPayment.deleteMany({ user: userId }),
      OneTimeIncome.deleteMany({ user: userId }),
      Investment.deleteMany({ userId }),
      Debt.deleteMany({ user: userId }),
      PaymentOverride.deleteMany({ user: userId }),
    ]);

    await User.findByIdAndDelete(userId);

    // Notify user via email
    try {
      await sendEmail(
        user.email,
        "Your PayPulse account has been deleted",
        buildAccountDeletedEmail({ firstName: user.firstName })
      );
    } catch { /* email send is best-effort */ }

    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ error: "Failed to delete user." });
  }
});

// POST /api/admin/reset-password — generate temp password
router.post("/reset-password", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required." });
    const tempPassword = crypto.randomBytes(4).toString("hex");
    const hash = await bcrypt.hash(tempPassword, 10);
    await User.findByIdAndUpdate(userId, { passwordHash: hash });
    res.json({ tempPassword });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// ── BILLING ──────────────────────────────────────────────────────────────────

// GET /api/admin/billing — billing summary
router.get("/billing", async (req, res) => {
  try {
    const total = await User.countDocuments();
    const premiumStatuses = ["premium", "premium_monthly", "premium_annual"];
    const premium = await User.countDocuments({ subscriptionStatus: { $in: premiumStatuses } });
    const trialing = await User.countDocuments({ subscriptionStatus: "trialing" });
    const free = total - premium - trialing;
    const monthlyRevenue = premium * 4.99;
    res.json({ total, free, premium, trialing, monthlyRevenue });
  } catch (error) {
    res.status(500).json({ error: "Failed to load billing data." });
  }
});

// ── FEATURE FLAGS ────────────────────────────────────────────────────────────

// GET /api/admin/feature-flags
router.get("/feature-flags", async (req, res) => {
  try {
    let flags = await FeatureFlag.find().sort({ key: 1 }).lean();
    // Seed defaults if empty
    if (flags.length === 0) {
      const defaults = [
        { key: "enable_signups", label: "Enable new signups", enabled: true },
        { key: "enable_trial", label: "Enable premium trial", enabled: true },
        { key: "maintenance_mode", label: "Maintenance mode", enabled: false },
      ];
      await FeatureFlag.insertMany(defaults);
      flags = await FeatureFlag.find().sort({ key: 1 }).lean();
    }
    res.json(flags);
  } catch (error) {
    res.status(500).json({ error: "Failed to load feature flags." });
  }
});

// PUT /api/admin/feature-flags/:id — toggle a flag
router.put("/feature-flags/:id", async (req, res) => {
  try {
    const { enabled } = req.body;
    const flag = await FeatureFlag.findByIdAndUpdate(req.params.id, { enabled }, { new: true });
    if (!flag) return res.status(404).json({ error: "Flag not found." });
    res.json(flag);
  } catch (error) {
    res.status(500).json({ error: "Failed to update feature flag." });
  }
});

// ── SUPPORT TICKETS ──────────────────────────────────────────────────────────

// GET /api/admin/support-tickets
router.get("/support-tickets", async (req, res) => {
  try {
    const tickets = await SupportTicket.find().sort({ createdAt: -1 }).lean();
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to load tickets." });
  }
});

// PUT /api/admin/support-tickets/:id — update status
router.put("/support-tickets/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });
    res.json(ticket);
  } catch (error) {
    res.status(500).json({ error: "Failed to update ticket." });
  }
});

// POST /api/admin/support-tickets/:id/reply — reply via email (from support@productoslaloma.com)
router.post("/support-tickets/:id/reply", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required." });
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket not found." });

    await sendEmail(
      ticket.email,
      `Re: ${ticket.subject}`,
      buildSupportReplyEmail({
        replyMessage: message,
        originalSubject: ticket.subject,
        originalMessage: ticket.message,
      }),
      { from: `"PayPulse Support" <${SUPPORT_EMAIL}>` }
    );

    ticket.status = "resolved";
    await ticket.save();
    res.json(ticket);
  } catch (error) {
    console.error("Reply error:", error);
    res.status(500).json({ error: "Failed to send reply." });
  }
});

// ── STRIPE RECONCILIATION ────────────────────────────────────────────────────

// POST /api/admin/sync-stripe/:userId — reconcile a user's subscription
// status against Stripe. Use this to recover from webhook failures.
//
// Lookup order:
//   1. If Mongo has user.stripeCustomerId, fetch that customer.
//   2. Else fall back to searching Stripe by the user's email.
// Then list that customer's subscriptions and pick the first
// active/trialing one (if any), and apply it to the Mongo doc.
router.post("/sync-stripe/:userId", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: "Stripe not configured" });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. Resolve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const matches = await stripe.customers.list({ email: user.email, limit: 1 });
      if (matches.data.length > 0) {
        customerId = matches.data[0].id;
        user.stripeCustomerId = customerId;
      }
    }
    if (!customerId) {
      return res.status(404).json({ error: "No Stripe customer found for this user" });
    }

    // 2. Find an active or trialing subscription
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    const sub = subs.data.find((s) => s.status === "trialing" || s.status === "active") || subs.data[0];
    if (!sub) {
      return res.status(404).json({ error: "No subscription found for this customer" });
    }

    // 3. Apply the status to the user doc
    const before = {
      subscriptionStatus: user.subscriptionStatus,
      isPremium: user.isPremium,
      trialEndDate: user.trialEndDate,
    };

    user.stripeSubscriptionId = sub.id;
    if (sub.status === "trialing") {
      user.isPremium = true;
      user.subscriptionStatus = "trialing";
      if (sub.trial_end) user.trialEndDate = new Date(sub.trial_end * 1000);
      if (!user.premiumSince) user.premiumSince = new Date();
    } else if (sub.status === "active") {
      user.isPremium = true;
      user.subscriptionStatus = "premium";
      if (!user.premiumSince) user.premiumSince = new Date();
    } else {
      user.isPremium = false;
      user.subscriptionStatus = "free";
    }

    const saved = await user.save();
    console.log("[Admin] sync-stripe", user.email, "before:", before, "after:", {
      subscriptionStatus: saved.subscriptionStatus,
      isPremium: saved.isPremium,
      trialEndDate: saved.trialEndDate,
    });
    res.json({
      success: true,
      stripeSubscriptionStatus: sub.status,
      user: {
        _id: saved._id,
        email: saved.email,
        subscriptionStatus: saved.subscriptionStatus,
        isPremium: saved.isPremium,
        trialEndDate: saved.trialEndDate,
        stripeCustomerId: saved.stripeCustomerId,
        stripeSubscriptionId: saved.stripeSubscriptionId,
      },
    });
  } catch (error) {
    console.error("[Admin] sync-stripe error:", error);
    res.status(500).json({ error: error.message || "Failed to sync" });
  }
});

module.exports = router;
