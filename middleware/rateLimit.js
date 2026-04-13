// Rate limiting using express-rate-limit. Three tiers, mounted in index.js:
//
//   - authLimiter: aggressive limit on credential endpoints (login, signup,
//     verify-email, send-2fa) to slow down credential stuffing and email
//     enumeration. 10 requests per 15 minutes per IP.
//
//   - passwordResetLimiter: tighter limit on forgot-password / reset-password
//     so attackers can't spam the email-sending endpoint. 5 per hour per IP.
//
//   - apiLimiter: general API ceiling for everything else. 100 per 15 min
//     per IP. Stripe webhooks are NOT rate-limited (Stripe handles retries
//     and back-pressure on its own side).
//
// All limiters key by IP via req.ip. Trust proxy must be on for this to work
// behind Vercel — set in index.js with app.set("trust proxy", 1).

const rateLimit = require("express-rate-limit");

const standardOptions = {
  standardHeaders: true,  // RateLimit-* headers
  legacyHeaders: false,   // suppress X-RateLimit-*
};

// 10 requests per 15 minutes per IP — login/signup/verify endpoints.
const authLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many authentication attempts. Try again in 15 minutes." },
});

// 5 requests per hour per IP — forgot-password / reset-password.
const passwordResetLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many password reset requests. Try again in an hour." },
});

// 100 requests per 15 minutes per IP — general API ceiling.
const apiLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Slow down and try again shortly." },
});

module.exports = { authLimiter, passwordResetLimiter, apiLimiter };
