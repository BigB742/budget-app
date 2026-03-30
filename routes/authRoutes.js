const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

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
      dateOfBirth: user.dateOfBirth,
      incomeSettings: user.incomeSettings || {},
    },
  };
};

router.post("/signup", async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, email, password } = req.body;

    if (!firstName || !lastName || !dateOfBirth || !email || !password) {
      return res
        .status(400)
        .json({ error: "First name, last name, date of birth, email, and password are required." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      dateOfBirth,
      email: email.toLowerCase().trim(),
      passwordHash,
    });

    res.status(201).json(createTokenResponse(user));
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

    res.json(createTokenResponse(user));
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
