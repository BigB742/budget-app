const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authRequired = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

    if (!token) {
      return res.status(401).json({ error: "Authorization token missing" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = req.user || { _id: decoded.userId };

    // Check email verification and compute subscription status for the request.
    try {
      const user = await User.findById(req.userId).select(
        "subscriptionStatus trialEndDate subscriptionEndDate emailVerified"
      );
      if (user) {
        if (!user.emailVerified) {
          return res.status(403).json({ error: "Please verify your email first.", needsVerification: true });
        }

        const now = new Date();

        // Auto-expire trialing users whose trial has ended.
        if (user.subscriptionStatus === "trialing" && user.trialEndDate && now > user.trialEndDate) {
          user.subscriptionStatus = "expired";
          user.isPremium = false;
          await user.save();
        }
        // Auto-downgrade canceled users whose access window has ended.
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
      }
    } catch { /* non-critical — auth still proceeds, status defaults to free */ }

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = { authRequired };
