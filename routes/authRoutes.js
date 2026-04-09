const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const IncomeSource = require("../models/IncomeSource");
const Bill = require("../models/Bill");
const { sendEmail } = require("../utils/email");

const sendVerificationEmail = async (user, code) => {
  await sendEmail(user.email, "Your PayPulse verification code",
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;text-align:center"><h2>Welcome to PayPulse!</h2><p style="color:#555">Hi ${user.firstName || "there"},</p><p style="color:#555;margin-bottom:1.5rem">Your verification code is:</p><div style="font-size:2.5rem;font-weight:800;letter-spacing:0.3em;color:#00C896;margin:1rem 0">${code}</div><p style="color:#888;font-size:0.85rem;margin-top:1.5rem">This code expires in 15 minutes.</p></div>`
  );
};

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

const createTokenResponse = (user) => {
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
  return {
    token,
    user: {
      id: user._id,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      dateOfBirth: user.dateOfBirth,
      onboardingComplete: !!user.onboardingComplete,
      isPremium: !!user.isPremium,
      emailVerified: !!user.emailVerified,
      subscriptionStatus: user.subscriptionStatus || "free",
      trialEndDate: user.trialEndDate || null,
      locale: user.locale || "en",
      notificationPrefs: user.notificationPrefs || {},
      incomeSettings: user.incomeSettings || {},
      loginHistory: (user.loginHistory || []).slice(0, 5),
      isAdmin: !!user.isAdmin,
      currentBalance: user.currentBalance || 0,
      twoFactorEnabled: !!user.twoFactorEnabled,
      incomeType: user.incomeType || "fixed",
    },
  };
};

router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, email, password, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    // No auto-trial — trial only starts when user completes Stripe checkout
    const user = await User.create({
      name: `${firstName || ""} ${lastName || ""}`.trim() || email.split("@")[0],
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || "",
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth + "T12:00:00") : undefined,
      email: email.toLowerCase().trim(),
      passwordHash,
      onboardingComplete: false,
      subscriptionStatus: "free",
    });

    // Dev mode: auto-verify when email isn't configured
    if (!process.env.EMAIL_USER) {
      user.emailVerified = true;
      await user.save();
      return res.status(201).json(createTokenResponse(user));
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = code;
    user.verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user, code).catch(err => console.error("Verification email error:", err));

    res.status(201).json({ needsVerification: true, email: user.email });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // Auto-verify legacy users, admins, and users with existing data
    if (!user.emailVerified) {
      // Skip verification for admins and premium/trialing users
      if (user.isAdmin || (user.subscriptionStatus && user.subscriptionStatus !== "free")) {
        user.emailVerified = true;
      } else {
        const [srcCount, billCount] = await Promise.all([
          IncomeSource.countDocuments({ user: user._id }),
          Bill.countDocuments({ user: user._id }),
        ]);
        if (srcCount > 0 || billCount > 0) {
          user.emailVerified = true;
        } else {
          return res.status(403).json({ error: "Please verify your email first.", needsVerification: true, email: user.email });
        }
      }
    }

    if (user.twoFactorEnabled) {
      // Don't issue JWT yet — require 2FA
      // Generate and send OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.twoFactorOTP = await bcrypt.hash(otp, 10);
      user.twoFactorOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      // Send OTP email
      // sendEmail imported at top of file
      await sendEmail(user.email, "Your PayPulse login code",
        `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:2rem;text-align:center"><h2>Your login code</h2><p style="font-size:2rem;font-weight:800;letter-spacing:0.2em;color:#00C896;margin:1rem 0">${otp}</p><p style="color:#888">This code expires in 10 minutes.</p><p style="color:#888;font-size:0.85rem">If you didn't request this, ignore this email.</p></div>`
      ).catch(() => {});
      return res.json({ requires2FA: true, email: user.email });
    }

    // Record login history
    user.loginHistory = user.loginHistory || [];
    user.loginHistory.unshift({
      timestamp: new Date(),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
    });
    // Keep only last 20 entries
    if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(0, 20);
    await user.save();

    res.json(createTokenResponse(user));
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), emailVerified: false });
    if (!user || user.verificationCode !== code) {
      return res.status(400).json({ error: "Invalid code." });
    }
    if (!user.verificationCodeExpiry || user.verificationCodeExpiry < Date.now()) {
      return res.status(400).json({ error: "Code expired, please request a new one." });
    }

    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpiry = undefined;
    await user.save();

    res.json(createTokenResponse(user));
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), emailVerified: false });
    if (!user) {
      // Return success to avoid exposing whether email exists
      return res.json({ success: true });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = code;
    user.verificationCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendVerificationEmail(user, code).catch(err => console.error("Verification email error:", err));

    res.json({ success: true });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /forgot-password — send a 6-digit reset code
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return success to prevent email enumeration
      return res.json({ success: true });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetCode = code;
    user.resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    try {
      await sendEmail(user.email, "Reset your PayPulse password",
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;text-align:center"><h2>Password Reset</h2><p style="color:#555">Hi ${user.firstName || "there"},</p><p style="color:#555;margin-bottom:1.5rem">Your password reset code is:</p><div style="font-size:2.5rem;font-weight:800;letter-spacing:0.3em;color:#FF6B35;margin:1rem 0">${code}</div><p style="color:#888;font-size:0.85rem;margin-top:1.5rem">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p></div>`
      );
    } catch (emailErr) {
      console.error("[ForgotPassword] Email send failed:", emailErr.message);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /reset-password — set new password using 6-digit code
router.post("/reset-password", async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: "Email, code, and new password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.resetCode !== code) {
      return res.status(400).json({ error: "Invalid code." });
    }
    if (!user.resetCodeExpiry || user.resetCodeExpiry < Date.now()) {
      return res.status(400).json({ error: "Code expired, please request a new one." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    await user.save();

    res.json({ success: true, message: "Password reset successful." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /send-2fa — generate and send a 2FA OTP to the user's email
router.post("/send-2fa", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return success to prevent email enumeration
      return res.json({ success: true });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.twoFactorOTP = await bcrypt.hash(otp, 10);
    user.twoFactorOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const { sendEmail } = require("../utils/email");
    await sendEmail(user.email, "Your PayPulse login code",
      `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:2rem;text-align:center"><h2>Your login code</h2><p style="font-size:2rem;font-weight:800;letter-spacing:0.2em;color:#00C896;margin:1rem 0">${otp}</p><p style="color:#888">This code expires in 10 minutes.</p><p style="color:#888;font-size:0.85rem">If you didn't request this, ignore this email.</p></div>`
    ).catch(() => {});

    res.json({ success: true });
  } catch (error) {
    console.error("Send 2FA error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /verify-2fa — verify the 2FA OTP and return JWT + user
router.post("/verify-2fa", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP are required." });

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
      twoFactorOTPExpiry: { $gt: Date.now() },
    });

    if (!user || !user.twoFactorOTP) {
      return res.status(401).json({ error: "Invalid or expired code." });
    }

    const otpValid = await bcrypt.compare(otp, user.twoFactorOTP);
    if (!otpValid) {
      return res.status(401).json({ error: "Invalid or expired code." });
    }

    // Clear OTP fields
    user.twoFactorOTP = undefined;
    user.twoFactorOTPExpiry = undefined;

    // Record login history
    user.loginHistory = user.loginHistory || [];
    user.loginHistory.unshift({
      timestamp: new Date(),
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
    });
    if (user.loginHistory.length > 20) user.loginHistory = user.loginHistory.slice(0, 20);
    await user.save();

    res.json(createTokenResponse(user));
  } catch (error) {
    console.error("Verify 2FA error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
