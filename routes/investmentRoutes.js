const express = require("express");

const { authRequired } = require("../middleware/auth");
const Investment = require("../models/Investment");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const investments = await Investment.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(investments);
  } catch (err) {
    console.error("Error fetching investments:", err);
    res.status(500).json({ message: "Failed to load investments." });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { assetName, startingBalance, ticker, purchases } = req.body || {};
    if (!assetName) {
      return res.status(400).json({ message: "Asset name is required." });
    }
    const investment = await Investment.create({
      userId: req.userId,
      assetName,
      ticker: ticker || undefined,
      startingBalance: Number(startingBalance) || 0,
      contributions: [],
      purchases: Array.isArray(purchases) ? purchases : [],
    });
    res.status(201).json(investment);
  } catch (err) {
    console.error("Error creating investment:", err);
    res.status(500).json({ message: "Failed to create investment." });
  }
});

router.post("/:id/contribute", authRequired, async (req, res) => {
  try {
    const { amount, date, note } = req.body || {};
    const contributionAmount = Number(amount);
    if (!contributionAmount || contributionAmount <= 0) {
      return res.status(400).json({ message: "Contribution amount must be greater than zero." });
    }
    const contributionDate = date ? new Date(date) : new Date();
    const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
    if (!investment) {
      return res.status(404).json({ message: "Investment not found." });
    }
    investment.contributions.push({
      amount: contributionAmount,
      date: contributionDate,
      note,
    });
    await investment.save();
    res.json(investment);
  } catch (err) {
    console.error("Error adding contribution:", err);
    res.status(500).json({ message: "Failed to add contribution." });
  }
});

router.post("/:id/purchase", authRequired, async (req, res) => {
  try {
    const { amount, pricePerCoin, date, note } = req.body || {};
    const purchaseAmount = Number(amount);
    const purchasePrice = Number(pricePerCoin);
    if (!purchaseAmount || purchaseAmount <= 0) {
      return res.status(400).json({ message: "Purchase amount must be greater than zero." });
    }
    if (!purchasePrice || purchasePrice <= 0) {
      return res.status(400).json({ message: "Price per coin must be greater than zero." });
    }
    const purchaseDate = date ? new Date(date) : new Date();
    const investment = await Investment.findOne({ _id: req.params.id, userId: req.userId });
    if (!investment) {
      return res.status(404).json({ message: "Investment not found." });
    }
    investment.purchases.push({
      amount: purchaseAmount,
      pricePerCoin: purchasePrice,
      date: purchaseDate,
      note: note || undefined,
    });
    await investment.save();
    res.json(investment);
  } catch (err) {
    console.error("Error adding purchase:", err);
    res.status(500).json({ message: "Failed to add purchase." });
  }
});

router.patch("/:id", authRequired, async (req, res) => {
  try {
    const { assetName, startingBalance } = req.body || {};
    const update = {};
    if (assetName !== undefined) update.assetName = assetName;
    if (startingBalance !== undefined) update.startingBalance = Number(startingBalance) || 0;

    const updated = await Investment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Investment not found." });
    res.json(updated);
  } catch (err) {
    console.error("Error updating investment:", err);
    res.status(500).json({ message: "Failed to update investment." });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await Investment.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!deleted) return res.status(404).json({ message: "Investment not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting investment:", err);
    res.status(500).json({ message: "Failed to delete investment." });
  }
});

module.exports = router;
