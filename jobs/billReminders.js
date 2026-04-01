// Bill reminder cron job — runs daily at 8 AM
const cron = require("node-cron");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Bill = require("../models/Bill");
const IncomeSource = require("../models/IncomeSource");

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://app.paypulse.com";

let transporter = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
} else {
  console.warn(
    "[billReminders] SMTP_HOST not configured — email reminders will be skipped."
  );
}

const emailFrom = process.env.EMAIL_FROM || "noreply@paypulse.app";

/**
 * Send an HTML email. Silently logs and continues on failure.
 */
async function sendEmail(to, subject, html) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: emailFrom,
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`[billReminders] Failed to send email to ${to}:`, err.message);
  }
}

/**
 * Check whether a given date is the next payday for an income source.
 */
function isPayday(incomeSource, targetDate) {
  if (!incomeSource.nextPayDate) return false;
  const next = new Date(incomeSource.nextPayDate);
  return (
    next.getFullYear() === targetDate.getFullYear() &&
    next.getMonth() === targetDate.getMonth() &&
    next.getDate() === targetDate.getDate()
  );
}

cron.schedule("0 8 * * *", async () => {
  try {
    const today = new Date();
    const todayDay = today.getDate();

    // ── Bill reminders ──────────────────────────────────────────────
    const billReminderUsers = await User.find({
      "notificationPrefs.billReminders": true,
    });

    for (const user of billReminderUsers) {
      try {
        const reminderDays =
          user.notificationPrefs.reminderDaysBefore != null
            ? user.notificationPrefs.reminderDaysBefore
            : 3;

        const targetDay = todayDay + reminderDays;

        // Handle month wrap-around: find bills due on the target day-of-month
        const bills = await Bill.find({
          user: user._id,
          isActive: true,
          dueDayOfMonth: targetDay > 31 ? targetDay - 31 : targetDay,
        });

        for (const bill of bills) {
          const dueDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            bill.dueDayOfMonth
          );
          // If the target day wrapped past end of month, the due date is next month
          if (targetDay > 31) {
            dueDate.setMonth(dueDate.getMonth() + 1);
          }
          const dueDateStr = dueDate.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });

          const subject = `Reminder: ${bill.name} is due in ${reminderDays} days`;
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
              <h2 style="color: #4f46e5;">PayPulse Bill Reminder</h2>
              <p>Hi ${user.name || "there"},</p>
              <p>This is a friendly reminder that your bill is coming up:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Bill</td>
                  <td style="padding: 8px;">${bill.name}</td>
                </tr>
                <tr style="background: #f9fafb;">
                  <td style="padding: 8px; font-weight: bold;">Amount</td>
                  <td style="padding: 8px;">$${bill.amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold;">Due Date</td>
                  <td style="padding: 8px;">${dueDateStr}</td>
                </tr>
              </table>
              <a href="${DASHBOARD_URL}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
                View Dashboard
              </a>
              <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
                You received this because bill reminders are enabled in your PayPulse settings.
              </p>
            </div>
          `;

          await sendEmail(user.email, subject, html);
        }
      } catch (err) {
        console.error(
          `[billReminders] Error processing bill reminders for user ${user._id}:`,
          err.message
        );
      }
    }

    // ── Payday reminders ────────────────────────────────────────────
    const paydayReminderUsers = await User.find({
      "notificationPrefs.paydayReminders": true,
    });

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    for (const user of paydayReminderUsers) {
      try {
        const incomeSources = await IncomeSource.find({
          user: user._id,
          isActive: true,
        });

        for (const source of incomeSources) {
          if (isPayday(source, tomorrow)) {
            const subject = `Payday tomorrow: ${source.name}`;
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">PayPulse Payday Reminder</h2>
                <p>Hi ${user.name || "there"},</p>
                <p>Good news — payday is tomorrow!</p>
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                  <tr>
                    <td style="padding: 8px; font-weight: bold;">Source</td>
                    <td style="padding: 8px;">${source.name}</td>
                  </tr>
                  <tr style="background: #f9fafb;">
                    <td style="padding: 8px; font-weight: bold;">Amount</td>
                    <td style="padding: 8px;">$${source.amount.toFixed(2)}</td>
                  </tr>
                </table>
                <a href="${DASHBOARD_URL}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none;">
                  View Dashboard
                </a>
                <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
                  You received this because payday reminders are enabled in your PayPulse settings.
                </p>
              </div>
            `;

            await sendEmail(user.email, subject, html);
          }
        }
      } catch (err) {
        console.error(
          `[billReminders] Error processing payday reminders for user ${user._id}:`,
          err.message
        );
      }
    }

    // reminder check complete
  } catch (error) {
    console.error("[billReminders] Cron job failed:", error);
  }
});
