// Rate limiting using express-rate-limit. Five tiers mounted in index.js:
//
//   - loginLimiter:        10 / 15min per IP — login attempts (also slows
//                          credential stuffing).
//   - signupLimiter:       5  / hour  per IP — account creation spam.
//   - verifyEmailLimiter:  10 / 15min per IP — verify-email + resend.
//   - passwordResetLimiter: 5 / hour  per email — forgot/reset password.
//                          Keyed by req.body.email so an attacker can't
//                          email-bomb a victim from many IPs.
//   - apiLimiter:          100 / 15min per IP — general API ceiling.
//
// Stripe webhook is NOT rate-limited (Stripe handles its own retries).
// Trust proxy must be on for IP-keyed limits to work behind Vercel —
// set in index.js with app.set("trust proxy", 1).

const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const standardOptions = {
  standardHeaders: true,  // RateLimit-* headers
  legacyHeaders: false,   // suppress X-RateLimit-*
};

// 10 / 15min per IP — login. Wider than signup because legitimate users
// fat-finger their password and we don't want to lock them out for an
// hour. Combined with the constant-time-ish bcrypt check on every login,
// this makes credential stuffing impractical.
const loginLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

// 10 / 15min per EMAIL — paired with loginLimiter to defeat distributed
// credential-stuffing. The IP limiter alone allows a botnet rotating IPs
// to hammer one known email indefinitely (10 tries per IP × N IPs). Keying
// on email caps total attempts on any single account regardless of source
// IP. When body.email is missing/non-string we fall back to the IP so the
// limiter still applies to malformed requests instead of bypassing.
const loginEmailLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts for this account. Try again in 15 minutes." },
  keyGenerator: (req, res) => {
    const email = req.body && typeof req.body.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
    if (email) return `email:${email}`;
    return `ip:${ipKeyGenerator(req, res)}`;
  },
});

// 5 / hour per IP — signup. Tighter than login because account creation
// is genuinely rare for a real user (they sign up once) and abuse is
// usually automated. Slows email enumeration and account-creation spam.
const signupLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many signup attempts. Try again in an hour." },
});

// 10 / 15min per IP — verify-email + resend-verification. A user might
// click resend a few times legitimately. Tighter than this would frustrate.
const verifyEmailLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many verification attempts. Try again in 15 minutes." },
});

// 5 / hour per EMAIL — forgot-password / reset-password. Keyed by the
// `email` field in the request body so an attacker can't email-bomb a
// victim from a botnet of IPs. If body.email is missing or non-string,
// we fall back to the IP (so a malformed request doesn't bypass the
// limit by hashing to "no-key").
const passwordResetLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many password reset requests for this email. Try again in an hour." },
  keyGenerator: (req, res) => {
    const email = req.body && typeof req.body.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
    if (email) return `email:${email}`;
    // ipKeyGenerator normalizes IPv6 prefixes so users can't bypass via /64 rotation.
    return `ip:${ipKeyGenerator(req, res)}`;
  },
});

// 100 / 15min per IP — general API ceiling for the protected router.
const apiLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests. Slow down and try again shortly." },
});

module.exports = {
  loginLimiter,
  loginEmailLimiter,
  signupLimiter,
  verifyEmailLimiter,
  passwordResetLimiter,
  apiLimiter,
};
