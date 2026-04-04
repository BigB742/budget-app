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

const { checkSubscriptionStatus } = require("./middleware/subscription");

const app = express();

app.use(cors());
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
// All routes below get subscription status checked on every request
app.use("/api/bills", billRoutes);
app.use("/api/pay-schedule", payScheduleRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/user", userRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/savings-goals", savingsRoutes);
app.use("/api/investments", investmentRoutes);
app.use("/api/income-sources", incomeSourceRoutes);
app.use("/api/payment-overrides", paymentOverrideRoutes);
app.use("/api/bill-payments", billPaymentRoutes);
app.use("/api/debts", debtRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/one-time-income", oneTimeIncomeRoutes);

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
