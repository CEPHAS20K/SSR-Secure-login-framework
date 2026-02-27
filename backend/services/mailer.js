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

async function sendPasswordResetEmail(to, resetCode, ttlMs = 10 * 60 * 1000) {
  const ttlMinutes = Math.max(1, Math.round(ttlMs / 60000));
  const subject = "Secure Storage Vault password reset code";
  const text = `Your password reset code is ${resetCode}. It expires in ${ttlMinutes} minutes. If you did not request this, ignore this message.`;
  const html = `<p>Your password reset code is <strong>${resetCode}</strong>.</p><p>It expires in ${ttlMinutes} minutes.</p><p>If you did not request this, ignore this message.</p>`;

  const info = await transporter.sendMail({
    from: defaultFrom,
    to,
    subject,
    text,
    html,
  });

  return info;
}

async function sendPasswordResetConfirmation(to) {
  const subject = "Your password was updated";
  const text =
    "Your Secure Storage Vault password was updated. If this was not you, contact support immediately.";
  const html =
    "<p>Your Secure Storage Vault password was updated.</p><p>If this was not you, contact support immediately.</p>";

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
  sendPasswordResetEmail,
  sendPasswordResetConfirmation,
};
