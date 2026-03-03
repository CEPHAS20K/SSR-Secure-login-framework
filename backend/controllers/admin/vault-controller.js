"use strict";

const { pool } = require("../../database/pool");

function createVaultController(options = {}) {
  const {
    logger = console,
    perUserQuotaBytes = Number(process.env.USER_STORAGE_QUOTA_BYTES || 10 * 1024 * 1024 * 1024),
  } = options;

  async function createVaultItem(req, res) {
    const userId = String(req.body?.userId || "").trim();
    const title = String(req.body?.title || "")
      .trim()
      .slice(0, 120);
    const encryptionScheme = String(req.body?.encryptionScheme || "AES-GCM").slice(0, 40);
    const attachmentBytes = Math.max(0, Number(req.body?.attachmentBytes || 0));
    let ciphertextB64 = String(req.body?.ciphertext || "").trim();
    let nonceB64 = String(req.body?.nonce || "").trim();
    let authTagB64 = String(req.body?.authTag || "").trim();

    if (!userId || !ciphertextB64 || !nonceB64 || !authTagB64) {
      res.status(400).json({ error: "userId, ciphertext, nonce, authTag are required." });
      return;
    }

    let ciphertext;
    let nonce;
    let authTag;
    try {
      ciphertext = Buffer.from(ciphertextB64, "base64");
      nonce = Buffer.from(nonceB64, "base64");
      authTag = Buffer.from(authTagB64, "base64");
    } catch (error) {
      res.status(400).json({ error: "Invalid base64 for ciphertext/nonce/authTag." });
      return;
    }

    const newBytes = ciphertext.length + attachmentBytes;
    const client = await pool.connect().catch((error) => {
      logger.error({ err: error }, "DB connect failed");
      return null;
    });
    if (!client) {
      res.status(500).json({ error: "Database unavailable." });
      return;
    }

    try {
      const usageRow = await client.query(
        `
        SELECT COALESCE(SUM(octet_length(ciphertext) + attachment_bytes),0)::bigint AS used
        FROM vault_items WHERE user_id=$1
      `,
        [userId]
      );
      const used = Number(usageRow.rows[0]?.used || 0);
      if (perUserQuotaBytes > 0 && used + newBytes > perUserQuotaBytes) {
        res.status(413).json({
          error: "Quota exceeded for user.",
          quotaBytes: perUserQuotaBytes,
          usedBytes: used,
          requestedBytes: newBytes,
        });
        return;
      }

      const insert = await client.query(
        `
        INSERT INTO vault_items (user_id, title, ciphertext, nonce, auth_tag, encryption_scheme, attachment_bytes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, created_at
      `,
        [userId, title || null, ciphertext, nonce, authTag, encryptionScheme, attachmentBytes]
      );

      await recordAudit(client, req.admin, {
        action: "vault_item_create",
        target_type: "vault_item",
        target_id: insert.rows[0].id,
        status: "success",
        meta: { title, encryptionScheme, bytes: newBytes },
        req,
      });

      res.status(201).json({
        id: insert.rows[0].id,
        createdAt: insert.rows[0].created_at,
        usedBytes: used + newBytes,
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to create vault item");
      res.status(500).json({ error: "Unable to store vault item." });
    } finally {
      client.release();
    }
  }

  async function getVaultUsage(req, res) {
    const client = await pool.connect().catch((error) => {
      logger.error({ err: error }, "DB connect failed for vault usage");
      return null;
    });
    if (!client) {
      res.status(200).json({ users: [] });
      return;
    }
    try {
      const rows = await client.query(`
        SELECT u.id, u.username, u.email,
               COUNT(v.id)::int AS items,
               COALESCE(SUM(octet_length(v.ciphertext) + v.attachment_bytes),0)::bigint AS bytes,
               COALESCE(MAX(v.updated_at), MAX(v.created_at)) AS last_updated
        FROM users u
        LEFT JOIN vault_items v ON v.user_id = u.id
        GROUP BY u.id, u.username, u.email
        ORDER BY bytes DESC
      `);
      res.status(200).json({
        users: rows.rows.map((row) => ({
          id: row.id,
          username: row.username,
          email: row.email,
          items: Number(row.items || 0),
          bytes: Number(row.bytes || 0),
          lastUpdated: row.last_updated,
        })),
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to fetch vault usage");
      res.status(500).json({ error: "Unable to fetch vault usage." });
    } finally {
      client.release();
    }
  }

  async function recordAudit(client, adminSession, options = {}) {
    try {
      await client.query(
        `
        INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, status, reason, meta, ip, user_agent)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
        [
          adminSession?.sub || null,
          options.action || "unknown",
          options.target_type || null,
          options.target_id || null,
          options.status || "success",
          options.reason || null,
          options.meta || {},
          options.req?.ip || options.req?.socket?.remoteAddress || null,
          options.req?.headers?.["user-agent"] || null,
        ]
      );
    } catch (error) {
      logger.warn({ err: error }, "Audit log insert failed");
    }
  }

  return {
    createVaultItem,
    getVaultUsage,
  };
}

module.exports = {
  createVaultController,
};
