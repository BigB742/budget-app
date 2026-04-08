const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const IncomeSource = require("../models/IncomeSource");
const Bill = require("../models/Bill");
const { sendEmail } = require("../utils/email");

const sendVerificationEmail = async (user, token) => {
  if (!process.env.SMTP_HOST) return;
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  const verifyUrl = `${process.env.APP_URL || "http://localhost:5173"}/verify-email?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "noreply@paypulse.app",
    to: user.email,
    subject: "Verify your PayPulse account",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem"><h2>Welcome to PayPulse!</h2><p>Hi ${user.firstName || "there"},</p><p>Please verify your email to activate your account.</p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#FF6B35;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Verify my email</a><p style="color:#888;font-size:0.85rem;margin-top:1.5rem">This link expires in 24 hours.</p></div>`,
  });
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

    // Dev mode: auto-verify when SMTP isn't configured
    if (!process.env.SMTP_HOST) {
      user.emailVerified = true;
      await user.save();
      return res.status(201).json(createTokenResponse(user));
    }

    const vToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = vToken;
    user.verificationTokenExpiry = new Date(Date.now() + 24*60*60*1000);
    await user.save();

    await sendVerificationEmail(user, vToken).catch(err => console.error("Verification email error:", err));

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

router.get("/verify-email", async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: "Token is required." });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired verification link." });
    }

    user.emailVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    res.json({ success: true, message: "Email verified!" });
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
      return res.status(400).json({ error: "No unverified account found for this email." });
    }

    const vToken = crypto.randomBytes(32).toString("hex");
    user.verificationToken = vToken;
    user.verificationTokenExpiry = new Date(Date.now() + 24*60*60*1000);
    await user.save();

    await sendVerificationEmail(user, vToken).catch(err => console.error("Verification email error:", err));

    res.json({ success: true });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /forgot-password — request a password reset link
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.json({ success: true });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = resetToken;
    user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    // Send reset email if SMTP is configured
    if (process.env.SMTP_HOST) {
      const APP_URL = process.env.APP_URL || "http://localhost:5173";
      const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || "noreply@paypulse.app",
        to: user.email,
        subject: "Reset your PayPulse password",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem"><h2>Password Reset</h2><p>Hi ${user.firstName || "there"},</p><p>You requested a password reset. Click the button below to set a new password.</p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#FF6B35;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Reset password</a><p style="color:#888;font-size:0.85rem;margin-top:1.5rem">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p></div>`,
      }).catch(err => console.error("Password reset email error:", err));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /reset-password — set new password using reset token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password are required." });

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    await user.save();

    res.json({ success: true, message: "Password updated." });
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
