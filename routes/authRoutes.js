const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const User = require("../models/User");

const sendVerificationEmail = async (user, token) => {
  if (!process.env.SMTP_HOST) { console.log("[Auth] SMTP not configured, skip verification email. Token:", token); return; }
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
      locale: user.locale || "en",
      notificationPrefs: user.notificationPrefs || {},
      incomeSettings: user.incomeSettings || {},
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
    const user = await User.create({
      name: `${firstName || ""} ${lastName || ""}`.trim() || email.split("@")[0],
      firstName: firstName || "",
      lastName: lastName || "",
      phone: phone || "",
      dateOfBirth,
      email: email.toLowerCase().trim(),
      passwordHash,
      onboardingComplete: false,
    });

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

    if (!user.emailVerified) {
      return res.status(403).json({ error: "Please verify your email first.", needsVerification: true, email: user.email });
    }

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

module.exports = router;
