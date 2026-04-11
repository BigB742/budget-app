const nodemailer = require("nodemailer");

// Log email config on module load
console.log("[Email] EMAIL_USER configured:", !!process.env.EMAIL_USER);

const sendEmail = async (to, subject, html) => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
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

  // Use EMAIL_FROM env var if set (e.g. for non-Gmail SMTP providers).
  // Gmail SMTP requires the 'from' domain to match the authenticated account,
  // so set EMAIL_FROM=no-reply@productoslaloma.com only when using a
  // provider that supports custom sender addresses (SendGrid, Postmark, etc.).
  const fromAddress = process.env.EMAIL_FROM || `"PayPulse" <${user}>`;
  const result = await transporter.sendMail({
    from: fromAddress,
    to, subject, html,
  });

  console.log("[Email] Sent successfully, messageId:", result.messageId);
  return result;
};

module.exports = { sendEmail };
