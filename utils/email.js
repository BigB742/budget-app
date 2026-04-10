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

  // Gmail requires 'from' to match the authenticated account
  const result = await transporter.sendMail({
    from: `"no-reply" <${user}>`,
    to, subject, html,
  });

  console.log("[Email] Sent successfully, messageId:", result.messageId);
  return result;
};

module.exports = { sendEmail };
