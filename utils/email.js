const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html, options = {}) => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) {
    // Email credentials missing — silently skip in dev. Production will
    // have these set via Vercel env vars.
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  // Verify SMTP connection before sending. Surface failures to the
  // caller so the route can decide how to respond; we still log to
  // the error stream for monitoring.
  try {
    await transporter.verify();
  } catch (verifyErr) {
    console.error("[Email] SMTP verification failed:", verifyErr.message);
    throw verifyErr;
  }

  // Resolve the from address. Priority:
  // 1. Explicit options.from passed by caller (e.g., support replies use support@)
  // 2. EMAIL_FROM env var (for non-Gmail SMTP providers that allow custom senders)
  // 3. Default PayPulse identity on the authenticated Gmail account
  // Note: Gmail rewrites the from domain to the authenticated account unless
  // the alias is configured in the Google Workspace settings. Use a real
  // transactional provider (SendGrid, Postmark, Resend) for true custom senders.
  const fromAddress = options.from || process.env.EMAIL_FROM || `"PayPulse" <${user}>`;
  return transporter.sendMail({
    from: fromAddress,
    to, subject, html,
  });
};

module.exports = { sendEmail };
