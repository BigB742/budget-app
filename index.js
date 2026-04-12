require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { connectDB } = require("./utils/db");

const authRoutes = require("./routes/authRoutes");
const billRoutes = require("./routes/billRoutes");
const payScheduleRoutes = require("./routes/payScheduleRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const userRoutes = require("./routes/userRoutes");
const summaryRoutes = require("./routes/summaryRoutes");
const savingsRoutes = require("./routes/savingsRoutes");
const investmentRoutes = require("./routes/investmentRoutes");
const incomeSourceRoutes = require("./routes/incomeSourceRoutes");
const paymentOverrideRoutes = require("./routes/paymentOverrideRoutes");
const billPaymentRoutes = require("./routes/billPaymentRoutes");
const debtRoutes = require("./routes/debtRoutes");
const exportRoutes = require("./routes/exportRoutes");
const oneTimeIncomeRoutes = require("./routes/oneTimeIncomeRoutes");
const adminRoutes = require("./routes/adminRoutes");

const { authRequired } = require("./middleware/auth");
const { checkSubscriptionStatus } = require("./middleware/subscription");
const stripeRoutes = require("./routes/stripe");

const app = express();

app.use(cors());

// Stripe webhook needs raw body — MUST come before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// ── DB connection middleware (Vercel serverless safe) ──────────────────────
// Ensures a cached Mongoose connection exists before every request.
// Fixes: MongooseError: Operation buffering timed out after 10000ms
// on Vercel cold starts where mongoose.connect() hasn't finished yet.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("[DB] Failed to connect:", err.message);
    res.status(503).json({ error: "Database temporarily unavailable. Please try again in a moment." });
  }
});

// One-time migration on first warm boot: auto-verify legacy users with existing data
// and zero out the deprecated user.totalSavings field for users who already
// have SavingsGoal records (prevents dashboard double-counting). Runs once
// per instance, non-blocking.
setImmediate(async () => {
  try {
    await connectDB();
    const User = require("./models/User");
    const IncomeSource = require("./models/IncomeSource");
    const SavingsGoal = require("./models/SavingsGoal");

    const unverified = await User.find({ $or: [{ emailVerified: false }, { emailVerified: { $exists: false } }] });
    for (const u of unverified) {
      const hasData = await IncomeSource.countDocuments({ user: u._id });
      if (hasData > 0) {
        u.emailVerified = true;
        u.onboardingComplete = true;
        await u.save();
      }
    }

    // Zero out legacy user.totalSavings for users whose savings now live in
    // the SavingsGoal collection. This cleans up anyone onboarded before the
    // dashboard double-count fix — their SavingsGoal row is the truth now.
    const withLegacySavings = await User.find({ totalSavings: { $gt: 0 } }).select("_id");
    for (const u of withLegacySavings) {
      const goalCount = await SavingsGoal.countDocuments({ userId: u._id });
      if (goalCount > 0) {
        await User.updateOne({ _id: u._id }, { $set: { totalSavings: 0 } });
      }
    }
  } catch { /* migration non-critical */ }
});

app.get("/", (req, res) => {
  res.send("PayPulse API is running");
});

// Public feature flags endpoint (no auth required)
app.get("/api/feature-flags", async (req, res) => {
  try {
    const FeatureFlag = require("./models/FeatureFlag");
    const flags = await FeatureFlag.find().lean();
    const map = {};
    flags.forEach((f) => { map[f.key] = f.enabled; });
    res.json(map);
  } catch { res.json({}); }
});

app.use("/api/auth", authRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/admin", adminRoutes);

// Protected routes: auth + subscription status sync on every request
const protectedRouter = express.Router();
protectedRouter.use(authRequired, checkSubscriptionStatus);
protectedRouter.use("/bills", billRoutes);
protectedRouter.use("/pay-schedule", payScheduleRoutes);
protectedRouter.use("/expenses", expenseRoutes);
protectedRouter.use("/user", userRoutes);
protectedRouter.use("/summary", summaryRoutes);
protectedRouter.use("/savings-goals", savingsRoutes);
protectedRouter.use("/investments", investmentRoutes);
protectedRouter.use("/income-sources", incomeSourceRoutes);
protectedRouter.use("/payment-overrides", paymentOverrideRoutes);
protectedRouter.use("/bill-payments", billPaymentRoutes);
protectedRouter.use("/debts", debtRoutes);
protectedRouter.use("/export", exportRoutes);
protectedRouter.use("/one-time-income", oneTimeIncomeRoutes);
app.use("/api", protectedRouter);

// Cron jobs
require("./jobs/billReminders");
require("./jobs/savingsAutopilot");
require("./jobs/paydayIncome");

// Export for Vercel serverless
module.exports = app;

// Start server when running locally (not on Vercel)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
  });
}
