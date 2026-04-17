// Shared HTML email templates for PayPulse.
// All emails use the PayPulse dark theme: navy background #0f1923, orange
// accent #f97316, white text. Designed to render correctly across Gmail,
// Outlook, Apple Mail, and other email clients.

const APP_URL = process.env.APP_URL || "https://paypulse.money";
const SUPPORT_EMAIL = "support@productoslaloma.com";

// Base wrapper used by every email — provides the PayPulse branding,
// the content slot, and the footer.
const wrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PayPulse</title>
</head>
<body style="margin:0;padding:0;background:#0a0f18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0a0f18;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;background:#0f1923;border-radius:12px;overflow:hidden;border:1px solid #1f2937;">
          <!-- Header with logo -->
          <tr>
            <td style="padding:32px 32px 24px;border-bottom:1px solid #1f2937;text-align:left;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f97316;vertical-align:middle;margin-right:10px;"></span>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:22px;font-weight:800;color:#f97316;letter-spacing:-0.01em;">PayPulse</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content body -->
          <tr>
            <td style="padding:32px;color:#ffffff;font-size:15px;line-height:1.6;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #1f2937;text-align:center;color:#64748b;font-size:12px;line-height:1.5;">
              <p style="margin:0 0 6px;">PayPulse by Productos La Loma</p>
              <p style="margin:0;">
                <a href="${APP_URL}" style="color:#f97316;text-decoration:none;">Open PayPulse</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:${SUPPORT_EMAIL}" style="color:#f97316;text-decoration:none;">Contact Support</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Large orange 6-digit code block
const codeBlock = (code) => `
<div style="background:#0a0f18;border:2px solid #f97316;border-radius:10px;padding:24px 16px;text-align:center;margin:24px 0;">
  <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:#94a3b8;font-weight:600;">Your code</p>
  <p style="margin:0;font-size:38px;font-weight:800;color:#f97316;letter-spacing:0.2em;font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;">${code}</p>
</div>
`;

// Plain-ish block used to echo the user's support message back to them.
const quoteBlock = (subject, message) => `
<div style="background:#0a0f18;border-left:3px solid #f97316;padding:14px 18px;margin:20px 0;border-radius:0 8px 8px 0;">
  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:700;">Subject</p>
  <p style="margin:0 0 14px;font-size:15px;color:#ffffff;font-weight:600;">${escapeHtml(subject)}</p>
  <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;font-weight:700;">Message</p>
  <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</p>
</div>
`;

// Minimal HTML escape for user-supplied strings to prevent injection.
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── TEMPLATES ────────────────────────────────────────────────────────────────

const buildVerificationEmail = ({ firstName, code }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Verify your email</h1>
  <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
  <p style="margin:0 0 16px;color:#cbd5e1;">Welcome to PayPulse! Use the code below to verify your email address and finish setting up your account.</p>
  ${codeBlock(code)}
  <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">This code expires in <strong style="color:#f97316;">15 minutes</strong>.</p>
  <p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't create a PayPulse account, you can safely ignore this email.</p>
`);

const buildPasswordResetEmail = ({ firstName, code }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Reset your password</h1>
  <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
  <p style="margin:0 0 16px;color:#cbd5e1;">You requested a password reset for your PayPulse account. Use the code below to set a new password.</p>
  ${codeBlock(code)}
  <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">This code expires in <strong style="color:#f97316;">15 minutes</strong>.</p>
  <p style="margin:0;color:#94a3b8;font-size:13px;">If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
`);

const buildDeleteAccountEmail = ({ firstName, code }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Confirm account deletion</h1>
  <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
  <p style="margin:0 0 16px;color:#cbd5e1;">You requested to permanently delete your PayPulse account. Enter the code below in the app to confirm.</p>
  ${codeBlock(code)}
  <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">This code expires in <strong style="color:#f97316;">15 minutes</strong>.</p>
  <p style="margin:0;color:#ef4444;font-size:13px;font-weight:600;">This action cannot be undone. All your data will be permanently deleted.</p>
`);

const buildSupportConfirmationEmail = ({ firstName, subject, message }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">We got your message</h1>
  <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
  <p style="margin:0 0 16px;color:#cbd5e1;">Thanks for reaching out to PayPulse support. We've received your request and a human will get back to you within <strong style="color:#f97316;">24 to 48 hours</strong>.</p>
  ${quoteBlock(subject, message)}
  <p style="margin:0;color:#94a3b8;font-size:13px;">If you need to add more detail, just reply to this email.</p>
`);

const buildSupportReplyEmail = ({ replyMessage, originalSubject, originalMessage }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Re: ${escapeHtml(originalSubject)}</h1>
  <div style="font-size:15px;line-height:1.6;color:#ffffff;white-space:pre-wrap;margin-bottom:20px;">${escapeHtml(replyMessage)}</div>
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1f2937;">
    <p style="margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;font-weight:700;">Your original message</p>
    ${quoteBlock(originalSubject, originalMessage)}
  </div>
  <p style="margin:18px 0 0;color:#94a3b8;font-size:13px;">— The PayPulse Support Team</p>
`);

const buildBillReminderEmail = ({ firstName, bills, daysBefore }) => {
  const billRows = (bills || []).map((b) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #1f2937;color:#ffffff;font-size:14px;">${escapeHtml(b.name)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #1f2937;color:#94a3b8;font-size:13px;text-align:right;">Day ${b.dueDayOfMonth}</td>
      <td style="padding:12px 0;border-bottom:1px solid #1f2937;color:#f97316;font-size:14px;font-weight:700;text-align:right;">$${Number(b.amount || 0).toFixed(2)}</td>
    </tr>
  `).join("");

  return wrapper(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Upcoming bill reminder</h1>
    <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
    <p style="margin:0 0 20px;color:#cbd5e1;">Heads up — you have ${bills?.length || 0} bill${bills?.length === 1 ? "" : "s"} due in the next <strong style="color:#f97316;">${daysBefore} days</strong>.</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px;">
      ${billRows}
    </table>
    <div style="text-align:center;margin:28px 0 0;">
      <a href="${APP_URL}/app/bills" style="display:inline-block;padding:12px 24px;background:#f97316;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">View bills in PayPulse</a>
    </div>
  `);
};

const buildAccountDeletedEmail = ({ firstName }) => wrapper(`
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:800;color:#ffffff;">Your account has been deleted</h1>
  <p style="margin:0 0 8px;color:#cbd5e1;">Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
  <p style="margin:0 0 16px;color:#cbd5e1;">Your PayPulse account and all associated data have been permanently deleted by an administrator.</p>
  <p style="margin:0;color:#94a3b8;font-size:13px;">If you believe this was done in error, please contact us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#f97316;text-decoration:none;">${SUPPORT_EMAIL}</a>.</p>
`);

module.exports = {
  SUPPORT_EMAIL,
  APP_URL,
  buildVerificationEmail,
  buildPasswordResetEmail,
  buildDeleteAccountEmail,
  buildSupportConfirmationEmail,
  buildSupportReplyEmail,
  buildBillReminderEmail,
  buildAccountDeletedEmail,
};
