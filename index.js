require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

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

const mongoURI = process.env.MONGO_URI;

mongoose
  .connect(mongoURI, {})
  .then(async () => {
    // One-time migration: auto-verify legacy users with existing data
    try {
      const User = require("./models/User");
      const IncomeSource = require("./models/IncomeSource");
      const unverified = await User.find({ $or: [{ emailVerified: false }, { emailVerified: { $exists: false } }] });
      for (const u of unverified) {
        const hasData = await IncomeSource.countDocuments({ user: u._id });
        if (hasData > 0) {
          u.emailVerified = true;
          u.onboardingComplete = true;
          await u.save();
        }
      }
    } catch { /* migration non-critical */ }
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.get("/", (req, res) => {
  res.send("PayPulse API is running");
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

// Cron jobs (bill reminders + savings autopilot)
require("./jobs/billReminders");
require("./jobs/savingsAutopilot");

// Export for Vercel serverless
module.exports = app;

// Start server when running locally (not on Vercel)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}.`);
  });
}
