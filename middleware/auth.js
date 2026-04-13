const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authRequired = async (req, res, next) => {
  // 1. Extract bearer token
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  if (!token) {
    return res.status(401).json({ error: "Authorization token missing" });
  }

  // 2. Verify signature + decode
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.userId = decoded.userId;
  req.user = req.user || { _id: decoded.userId };

  // 3. Load the user. If the DB is down, fail closed — we'd rather make
  // the user retry than silently bypass the email-verification or
  // token-version check.
  let user;
  try {
    user = await User.findById(req.userId).select(
      "subscriptionStatus trialEndDate subscriptionEndDate emailVerified tokenVersion"
    );
  } catch {
    return res.status(503).json({ error: "Auth service temporarily unavailable." });
  }

  if (!user) {
    // User was deleted but the token is still in the wild — reject.
    return res.status(401).json({ error: "Account no longer exists." });
  }

  // 4. Token-version invalidation. When the user changes their password
  // (or an admin force-rotates), User.tokenVersion is bumped and every
  // JWT issued before that bump becomes invalid.
  const tokenTv = typeof decoded.tv === "number" ? decoded.tv : 0;
  if (tokenTv < (user.tokenVersion || 0)) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }

  // 5. Email verification gate.
  if (!user.emailVerified) {
    return res.status(403).json({ error: "Please verify your email first.", needsVerification: true });
  }

  // 6. Auto-expire / auto-downgrade lifecycle transitions and compute
  // req.isPremium for downstream routes. See middleware/subscription.js
  // for the same logic — kept here too because authRequired runs first
  // and some downstream code (free-tier limits) reads req.subscriptionStatus
  // directly.
  try {
    const now = new Date();

    if (user.subscriptionStatus === "trialing" && user.trialEndDate && now > user.trialEndDate) {
      user.subscriptionStatus = "expired";
      user.isPremium = false;
      await user.save();
    }
    if (user.subscriptionStatus === "canceled" && user.subscriptionEndDate && now > user.subscriptionEndDate) {
      user.subscriptionStatus = "free";
      user.isPremium = false;
      user.stripeSubscriptionId = null;
      user.subscriptionEndDate = undefined;
      await user.save();
    }

    const status = user.subscriptionStatus || "free";
    req.subscriptionStatus = status;
    req.isPremium = (
      status === "premium" ||
      status === "premium_monthly" ||
      status === "premium_annual" ||
      (status === "trialing" && user.trialEndDate && new Date(user.trialEndDate) > now) ||
      (status === "canceled" && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > now)
    );
  } catch {
    // Lifecycle save failure is non-critical — fall through with safe defaults.
    req.subscriptionStatus = req.subscriptionStatus || "free";
    req.isPremium = !!req.isPremium;
  }

  next();
};

module.exports = { authRequired };
