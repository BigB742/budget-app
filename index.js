require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const budgetRoutes = require("./routes/budgetRoutes");
const authRoutes = require("./routes/authRoutes");
const billRoutes = require("./routes/billRoutes");
const payScheduleRoutes = require("./routes/payScheduleRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const dashboardRoutes = require("./routes/dashboard");
const incomeRoutes = require("./routes/income");
const userRoutes = require("./routes/userRoutes");
const ruleRoutes = require("./routes/ruleRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const summaryRoutes = require("./routes/summaryRoutes");
const savingsRoutes = require("./routes/savingsRoutes");
const investmentRoutes = require("./routes/investmentRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const mongoURI = process.env.MONGO_URI;

mongoose
  .connect(mongoURI, {})
  .then(() => {
    console.log("✅ Connected to MongoDB (budget app).");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
  });

app.get("/", (req, res) => {
  res.send("Budget API is running");
});

app.use("/api/auth", authRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/pay-schedule", payScheduleRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/user", userRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/summary", summaryRoutes);
app.use("/api/savings-goals", savingsRoutes);
app.use("/api/investments", investmentRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}.`);
});
