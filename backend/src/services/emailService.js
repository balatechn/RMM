const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendAlertEmail(alert) {
  const transport = getTransporter();
  if (!transport || !process.env.ALERT_EMAIL_TO) {
    logger.debug("Email not configured, skipping alert email");
    return;
  }

  const severityColor = alert.severity === "critical" ? "#dc2626" : "#f59e0b";
  const severityLabel = alert.severity.toUpperCase();

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${severityColor}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">⚠️ RMM Alert — ${severityLabel}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
        <p><strong>Device:</strong> ${alert.device_name || "Unknown"}</p>
        <p><strong>Type:</strong> ${alert.type}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Time:</strong> ${new Date(alert.created_at).toLocaleString()}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <p style="color: #6b7280; font-size: 12px;">This is an automated alert from the RMM monitoring system.</p>
      </div>
    </div>
  `;

  await transport.sendMail({
    from: process.env.SMTP_FROM || "noreply@rmm.local",
    to: process.env.ALERT_EMAIL_TO,
    subject: `[RMM ${severityLabel}] ${alert.type} — ${alert.device_name || "Unknown"}`,
    html,
  });

  logger.info("Alert email sent", { alertId: alert.id, to: process.env.ALERT_EMAIL_TO });
}

module.exports = { sendAlertEmail };
