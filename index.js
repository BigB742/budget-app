require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
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
const { sanitizeRequest } = require("./middleware/sanitize");
const {
  loginLimiter,
  signupLimiter,
  verifyEmailLimiter,
  passwordResetLimiter,
  apiLimiter,
} = require("./middleware/rateLimit");
const stripeRoutes = require("./routes/stripe");

// ── Startup config validation ──────────────────────────────────────────
// JWTs are signed with HMAC-SHA256, which requires the secret to be at
// least 256 bits (32 chars of high-entropy random data) to be brute-force
// resistant. A short or guessable secret means an attacker can forge
// admin tokens once they observe one valid token.
//
// In production: hard-fail (process.exit(1)) — booting an API that
// signs forgeable tokens is worse than not booting at all.
// In dev/test: warn loudly but keep running so contributors aren't
// blocked by missing env on first clone.
//
// Rotate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
const JWT_SECRET_BAD = !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32;
if (JWT_SECRET_BAD) {
  const reason = !process.env.JWT_SECRET
    ? "JWT_SECRET is NOT SET"
    : `JWT_SECRET is only ${process.env.JWT_SECRET.length} characters (need >= 32)`;
  if (process.env.NODE_ENV === "production") {
    console.error(`\n[SECURITY ★★★★★] ${reason}. Refusing to boot in production.\n`);
    process.exit(1);
  }
  console.error(
    `\n[SECURITY ★★★★★] ${reason}.\n` +
    "Rotate immediately: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"\n" +
    "Then set the new value in Vercel env vars and redeploy. All existing JWTs will be invalidated.\n"
  );
}

const app = express();

// HTTP security headers. PayPulse is a JSON API (not an HTML renderer),
// so CSP and COEP are disabled — they only matter when the server returns
// markup that the browser will execute. The remaining defaults give us
// HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and
// Cross-Origin-Resource-Policy on every response. Verify after deploy:
//   curl -I https://api.paypulse.money/
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Trust the first proxy hop (Vercel) so req.ip reflects the real client IP
// instead of the load-balancer's. Required for express-rate-limit to key
// per-user instead of bucketing all traffic into one IP.
// NOTE: this assumes EXACTLY one proxy hop. If you ever add Cloudflare
// or another reverse proxy in front of Vercel, bump this value or
// req.ip will reflect the intermediate proxy and rate-limit buckets
// will collapse all clients onto one IP. See README "Deployment".
app.set("trust proxy", 1);

// CORS allowlist: APP_URL (production frontend), localhost dev, and any
// vercel.app preview deploy. Configure ALLOWED_ORIGINS (or the legacy
// CORS_ALLOWED_ORIGINS) as a comma-separated list to override. A
// wide-open `cors()` would let any website embed this API and probe
// the user's authenticated state.
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || "";
const corsAllowList = allowedOriginsEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const defaultCorsAllowList = [
  process.env.APP_URL,
  "https://paypulse.money",
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);
const allowedOrigins = corsAllowList.length ? corsAllowList : defaultCorsAllowList;
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow tools without an Origin header (curl, Postman, server-to-server,
      // and Stripe webhook deliveries which post to /api/stripe/webhook).
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow Vercel preview deploys (paypulse-*.vercel.app).
      // Allow Vercel preview deploys and the custom domain.
      if (/^https:\/\/paypulse-[\w-]+\.vercel\.app$/.test(origin)) return callback(null, true);
      if (origin === "https://paypulse.money" || origin === "https://www.paypulse.money") return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    // SECURITY NOTE: credentials is set to false because PayPulse uses
    // Bearer tokens in the Authorization header, not cookies. If you
    // ever add cookie-based auth (e.g. "remember me" sessions), you
    // MUST change this to `credentials: true` AND verify that every
    // origin in the allowlist is an explicit string (no wildcards).
    // Without that change, cookies won't send cross-origin and sessions
    // will silently fail. — Audited 2026-04-15
    credentials: false,
  })
);

// Stripe webhook needs raw body — MUST come before express.json()
app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Strip MongoDB operators ($gt, $ne, etc.) and dotted-path keys from
// req.body and req.params before any route handler runs. Defense against
// NoSQL injection on auth and write endpoints.
app.use(sanitizeRequest);

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

// Rate limiting on auth endpoints — applied BEFORE the route handlers so
// abusive callers are blocked before they hit Mongo or bcrypt. See
// middleware/rateLimit.js for the rationale on each tier.
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/auth/verify-email", verifyEmailLimiter);
app.use("/api/auth/resend-verification", verifyEmailLimiter);
app.use("/api/auth/send-2fa", loginLimiter);
app.use("/api/auth/verify-2fa", loginLimiter);
app.use("/api/auth/forgot-password", passwordResetLimiter);
app.use("/api/auth/reset-password", passwordResetLimiter);

app.use("/api/auth", authRoutes);
// Stripe webhook intentionally NOT rate-limited — Stripe handles retries
// and their own back-pressure.
app.use("/api/stripe", stripeRoutes);
app.use("/api/admin", adminRoutes);

// Protected routes: auth + subscription status sync on every request,
// plus a general 100-per-15min rate limit per IP. Applied AFTER auth
// so unauthenticated probes hit the auth limiter first.
const protectedRouter = express.Router();
protectedRouter.use(apiLimiter);
protectedRouter.use(authRequired, checkSubscriptionStatus);
protectedRouter.use("/bills", billRoutes);
protectedRouter.use("/pay-schedule", payScheduleRoutes);
protectedRouter.use("/expenses", expenseRoutes);
protectedRouter.use("/user", userRoutes);
protectedRouter.use("/summary", summaryRoutes);
protectedRouter.use("/savings-goals", savingsRoutes);
protectedRouter.use("/savings", require("./routes/savingsV2Routes"));
protectedRouter.use("/investments", investmentRoutes);
protectedRouter.use("/income-sources", incomeSourceRoutes);
protectedRouter.use("/payment-overrides", paymentOverrideRoutes);
protectedRouter.use("/bill-payments", billPaymentRoutes);
protectedRouter.use("/debts", debtRoutes);
protectedRouter.use("/export", exportRoutes);
protectedRouter.use("/one-time-income", oneTimeIncomeRoutes);
protectedRouter.use("/payment-plans", require("./routes/paymentPlanRoutes"));
app.use("/api", protectedRouter);

// ─── Global error handler ──────────────────────────────────────────────
// Safety net for any uncaught error that escapes a route handler. NEVER
// leak err.message, err.stack, or any internal detail to the client —
// stack traces reveal file paths and tech stack, mongoose CastError
// reveals collection/field names, etc. Log the full error server-side
// and return a generic message.
app.use((err, _req, res, _next) => {
  console.error("[GlobalErrorHandler]", err?.name, err?.message, err?.stack);

  // Mongoose-specific error normalization for slightly better client UX,
  // but still WITHOUT echoing the raw error string.
  let status = err?.status || err?.statusCode || 500;
  let userMessage = "Something went wrong. Please try again.";

  if (err?.name === "ValidationError") {
    status = 400;
    userMessage = "Some of the fields you entered are invalid.";
  } else if (err?.name === "CastError") {
    status = 400;
    userMessage = "One of the values you sent had the wrong format.";
  } else if (err?.code === 11000) {
    status = 409;
    userMessage = "That value is already in use.";
  } else if (err?.message === `Origin ${err?.origin} not allowed by CORS` || err?.message?.startsWith?.("Origin ")) {
    status = 403;
    userMessage = "Origin not allowed.";
  }

  res.status(status).json({ success: false, error: userMessage });
});

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
