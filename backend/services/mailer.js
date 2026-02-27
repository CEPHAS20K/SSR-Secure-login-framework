"use strict";

const nodemailer = require("nodemailer");

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM } = process.env;

  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE || "").toLowerCase() === "true" || SMTP_PORT === "465",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }

  // Fallback: log emails to console for dev
  return nodemailer.createTransport({
    jsonTransport: true,
  });
}

const transporter = createTransport();
const defaultFrom = process.env.SMTP_FROM || "no-reply@example.com";

async function sendOtpEmail(to, otpCode) {
  const subject = "Your Secure Storage Vault verification code";
  const text = `Your verification code is ${otpCode}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`;
  const html = `<p>Your verification code is <strong>${otpCode}</strong>.</p><p>It expires in 10 minutes.</p><p>If you did not request this code, you can ignore this email.</p>`;

  const info = await transporter.sendMail({
    from: defaultFrom,
    to,
    subject,
    text,
    html,
  });

  return info;
}

module.exports = {
  sendOtpEmail,
};
