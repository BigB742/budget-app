const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html) => {
  if (!process.env.SMTP_HOST && !process.env.EMAIL_USER) return;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.EMAIL_USER || process.env.SMTP_USER, pass: process.env.EMAIL_PASS || process.env.SMTP_PASS },
  });
  await transporter.sendMail({ from: '"PayPulse" <no-reply@productoslaloma.com>', to, subject, html });
};

module.exports = { sendEmail };
