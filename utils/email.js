const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html) => {
  const emailUser = process.env.EMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  if (!emailUser || !emailPass) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
  });

  // Gmail requires 'from' to match the authenticated account
  await transporter.sendMail({
    from: `"PayPulse" <${emailUser}>`,
    to, subject, html,
  });
};

module.exports = { sendEmail };
