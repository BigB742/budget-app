const nodemailer = require("nodemailer");

// Log email config on module load (without exposing password)
const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
console.log("[Email] EMAIL_USER configured:", !!emailUser);

const sendEmail = async (to, subject, html) => {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  if (!user || !pass) {
    console.log("[Email] No credentials configured, skipping send to:", to);
    return;
  }

  console.log("[Email] Attempting to send to:", to, "subject:", subject);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  // Verify SMTP connection before sending
  try {
    await transporter.verify();
    console.log("[Email] SMTP server verified OK");
  } catch (verifyErr) {
    console.error("[Email] SMTP verification failed:", verifyErr.message);
    throw verifyErr;
  }

  // Gmail requires 'from' to match the authenticated account
  const result = await transporter.sendMail({
    from: `"PayPulse" <${user}>`,
    to, subject, html,
  });

  console.log("[Email] Sent successfully, messageId:", result.messageId);
  return result;
};

module.exports = { sendEmail };
