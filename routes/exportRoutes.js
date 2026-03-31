const express = require("express");
const PDFDocument = require("pdfkit");
const Expense = require("../models/Expense");
const Bill = require("../models/Bill");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");
const router = express.Router();

// GET /csv — export expenses as CSV with optional date/category filters
router.get("/csv", authRequired, async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const query = { $or: [{ user: req.userId }, { userId: req.userId }] };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    if (category) {
      query.category = category;
    }

    const expenses = await Expense.find(query).sort({ date: 1 });

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const filename = `paypulse-expenses-${yyyy}-${mm}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Write CSV header
    res.write("Date,Description,Category,Amount\n");

    // Write each expense row
    for (const exp of expenses) {
      const date = exp.date ? new Date(exp.date).toISOString().slice(0, 10) : "";
      const description = (exp.description || "").replace(/"/g, '""');
      const category = (exp.category || "").replace(/"/g, '""');
      const amount = (exp.amount || 0).toFixed(2);
      res.write(`${date},"${description}","${category}",${amount}\n`);
    }

    res.end();
  } catch (error) {
    console.error("Error exporting CSV:", error);
    res.status(500).json({ message: "Failed to export CSV" });
  }
});

// GET /pdf — export expenses as PDF (premium only)
router.get("/pdf", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.isPremium) {
      return res.status(403).json({ error: "Premium feature" });
    }

    const { from, to, category } = req.query;
    const query = { $or: [{ user: req.userId }, { userId: req.userId }] };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }

    if (category) {
      query.category = category;
    }

    const expenses = await Expense.find(query).sort({ date: 1 });

    const periodFrom = from || "start";
    const periodTo = to || "present";

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="paypulse-expense-report.pdf"'
    );

    doc.pipe(res);

    // Title
    doc.fontSize(22).font("Helvetica-Bold").text("PayPulse Expense Report", {
      align: "center",
    });
    doc.moveDown(0.5);

    // Period
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Period: ${periodFrom} to ${periodTo}`, { align: "center" });
    doc.moveDown(1);

    // Column headers
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("Date", 50, doc.y, { continued: false, width: 80 });
    const headerY = doc.y - 12;
    doc.text("Description", 140, headerY, { width: 180 });
    doc.text("Category", 330, headerY, { width: 100 });
    doc.text("Amount", 440, headerY, { width: 80, align: "right" });
    doc.moveDown(0.5);

    // Divider line
    doc
      .moveTo(50, doc.y)
      .lineTo(520, doc.y)
      .stroke();
    doc.moveDown(0.5);

    // Expense rows
    let total = 0;
    doc.font("Helvetica").fontSize(10);

    for (const exp of expenses) {
      const date = exp.date ? new Date(exp.date).toISOString().slice(0, 10) : "";
      const description = exp.description || "";
      const cat = exp.category || "";
      const amount = exp.amount || 0;
      total += amount;

      const rowY = doc.y;
      doc.text(date, 50, rowY, { width: 80 });
      doc.text(description, 140, rowY, { width: 180 });
      doc.text(cat, 330, rowY, { width: 100 });
      doc.text(`$${amount.toFixed(2)}`, 440, rowY, { width: 80, align: "right" });
      doc.moveDown(0.3);
    }

    // Total line
    doc.moveDown(0.5);
    doc
      .moveTo(50, doc.y)
      .lineTo(520, doc.y)
      .stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(`Total: $${total.toFixed(2)}`, 50, doc.y, {
      width: 470,
      align: "right",
    });

    doc.end();
  } catch (error) {
    console.error("Error exporting PDF:", error);
    res.status(500).json({ message: "Failed to export PDF" });
  }
});

module.exports = router;
