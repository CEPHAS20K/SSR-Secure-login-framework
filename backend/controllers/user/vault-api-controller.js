"use strict";

const { pool } = require("../../database/pool");

function createVaultApiController(options = {}) {
  const {
    logger = console,
    perUserQuotaBytes = Number(process.env.USER_STORAGE_QUOTA_BYTES || 10 * 1024 * 1024 * 1024),
    allowHeaderAuth = true,
  } = options;

  function readUserId(req) {
    if (req.user?.id) return String(req.user.id);
    if (!allowHeaderAuth) return "";
    return String(req.headers?.["x-user-id"] || req.query?.userId || req.body?.userId || "").trim();
  }

  async function createVaultItem(req, res) {
    const {
      userId,
      title,
      encryptionScheme = "AES-GCM",
      attachmentBytes = 0,
    } = sanitizeBody(req.body || {});
    const { ciphertext, nonce, authTag, bytesError } = parseCryptoPayload(req.body || {});
    if (bytesError) {
      res.status(400).json({ error: bytesError });
      return;
    }
    const totalNewBytes = ciphertext.length + Number(attachmentBytes || 0);

    const client = await pool.connect();
    try {
      const user = await ensureUser(client, userId);
      if (!user) {
        res.status(401).json({ error: "Invalid user." });
        return;
      }

      const used = await getUserUsageBytes(client, userId);
      if (perUserQuotaBytes > 0 && used + totalNewBytes > perUserQuotaBytes) {
        res.status(413).json({
          error: "User storage quota exceeded.",
          quotaBytes: perUserQuotaBytes,
          usedBytes: used,
          requestedBytes: totalNewBytes,
        });
        return;
      }

      const insert = await client.query(
        `
        INSERT INTO vault_items (user_id, title, ciphertext, nonce, auth_tag, encryption_scheme, attachment_bytes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, created_at, updated_at, version
      `,
        [
          userId,
          title || null,
          ciphertext,
          nonce,
          authTag,
          encryptionScheme.slice(0, 40),
          Number(attachmentBytes || 0),
        ]
      );

      res.status(201).json({
        id: insert.rows[0].id,
        createdAt: insert.rows[0].created_at,
        updatedAt: insert.rows[0].updated_at,
        version: insert.rows[0].version,
        usedBytes: used + totalNewBytes,
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
      });

      await recordAudit(client, {
        req,
        action: "vault_item_create",
        actorUserId: userId,
        targetType: "vault_item",
        targetId: insert.rows[0].id,
        status: "success",
        meta: {
          encryptionScheme,
          ciphertextBytes: ciphertext.length,
          attachmentBytes: Number(attachmentBytes || 0),
          version: insert.rows[0].version,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "createVaultItem failed");
      res.status(500).json({ error: "Unable to store vault item." });
    } finally {
      client.release();
    }
  }

  async function listVaultItems(req, res) {
    const userId = readUserId(req);
    if (!userId) {
      res.status(401).json({ error: "userId is required (header x-user-id or query)." });
      return;
    }
    const client = await pool.connect();
    try {
      const user = await ensureUser(client, userId);
      if (!user) {
        res.status(401).json({ error: "Invalid user." });
        return;
      }
      const rows = await client.query(
        `
        SELECT id, title, encryption_scheme, attachment_bytes,
               octet_length(ciphertext) AS ciphertext_bytes,
               version, created_at, updated_at, last_accessed_at
        FROM vault_items
        WHERE user_id=$1
        ORDER BY updated_at DESC
        LIMIT 200
      `,
        [userId]
      );
      res.status(200).json({
        items: rows.rows.map((row) => ({
          id: row.id,
          title: row.title,
          encryptionScheme: row.encryption_scheme,
          ciphertextBytes: Number(row.ciphertext_bytes || 0),
          attachmentBytes: Number(row.attachment_bytes || 0),
          version: row.version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastAccessedAt: row.last_accessed_at,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "listVaultItems failed");
      res.status(500).json({ error: "Unable to fetch vault items." });
    } finally {
      client.release();
    }
  }

  async function getVaultItem(req, res) {
    const userId = readUserId(req);
    const itemId = String(req.params?.id || "").trim();
    if (!userId || !itemId) {
      res.status(400).json({ error: "userId and item id are required." });
      return;
    }
    const client = await pool.connect();
    try {
      const user = await ensureUser(client, userId);
      if (!user) {
        res.status(401).json({ error: "Invalid user." });
        return;
      }
      const row = await client.query(
        `
        SELECT id, title, encryption_scheme, nonce, auth_tag, ciphertext,
               attachment_bytes, version, created_at, updated_at
        FROM vault_items
        WHERE id=$1 AND user_id=$2
      `,
        [itemId, userId]
      );
      if (row.rowCount === 0) {
        res.status(404).json({ error: "Item not found." });
        return;
      }
      const item = row.rows[0];
      await client.query(`UPDATE vault_items SET last_accessed_at=now() WHERE id=$1`, [itemId]);
      res.status(200).json({
        id: item.id,
        title: item.title,
        encryptionScheme: item.encryption_scheme,
        nonce: item.nonce.toString("base64"),
        authTag: item.auth_tag.toString("base64"),
        ciphertext: item.ciphertext.toString("base64"),
        attachmentBytes: Number(item.attachment_bytes || 0),
        version: item.version,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      });

      await recordAudit(client, {
        req,
        action: "vault_item_read",
        actorUserId: userId,
        targetType: "vault_item",
        targetId: item.id,
        status: "success",
        meta: { version: item.version },
      });
    } catch (error) {
      logger.error({ err: error }, "getVaultItem failed");
      res.status(500).json({ error: "Unable to fetch item." });
    } finally {
      client.release();
    }
  }

  async function updateVaultItem(req, res) {
    const {
      userId,
      title,
      encryptionScheme = "AES-GCM",
      attachmentBytes = 0,
    } = sanitizeBody(req.body || {});
    const itemId = String(req.params?.id || "").trim();
    const { ciphertext, nonce, authTag, bytesError } = parseCryptoPayload(req.body || {});
    if (!userId || !itemId) {
      res.status(400).json({ error: "userId and item id are required." });
      return;
    }
    if (bytesError) {
      res.status(400).json({ error: bytesError });
      return;
    }

    const client = await pool.connect();
    try {
      const user = await ensureUser(client, userId);
      if (!user) {
        res.status(401).json({ error: "Invalid user." });
        return;
      }

      const current = await client.query(
        `SELECT id, version, ciphertext, attachment_bytes FROM vault_items WHERE id=$1 AND user_id=$2`,
        [itemId, userId]
      );
      if (current.rowCount === 0) {
        res.status(404).json({ error: "Item not found." });
        return;
      }
      const currentRow = current.rows[0];
      const currentBytes =
        Number(currentRow.attachment_bytes || 0) + Number(currentRow.ciphertext?.length || 0);
      const newBytes = ciphertext.length + Number(attachmentBytes || 0);
      const diff = newBytes - currentBytes;

      const used = await getUserUsageBytes(client, userId);
      if (perUserQuotaBytes > 0 && used + diff > perUserQuotaBytes) {
        res.status(413).json({
          error: "User storage quota exceeded.",
          quotaBytes: perUserQuotaBytes,
          usedBytes: used,
          requestedBytes: newBytes,
        });
        return;
      }

      // archive previous version
      await client.query(
        `
        INSERT INTO vault_item_versions (vault_item_id, version, ciphertext, nonce, auth_tag, encryption_scheme, created_at, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,now(),$7)
      `,
        [
          itemId,
          currentRow.version,
          currentRow.ciphertext,
          req.body?.nonce ? Buffer.from(req.body.nonce, "base64") : null,
          req.body?.authTag ? Buffer.from(req.body.authTag, "base64") : null,
          encryptionScheme.slice(0, 40),
          userId,
        ]
      );

      const update = await client.query(
        `
        UPDATE vault_items
        SET title=$2,
            ciphertext=$3,
            nonce=$4,
            auth_tag=$5,
            encryption_scheme=$6,
            attachment_bytes=$7,
            version=version+1,
            updated_at=now()
        WHERE id=$1 AND user_id=$8
        RETURNING id, version, updated_at
      `,
        [
          itemId,
          title || null,
          ciphertext,
          nonce,
          authTag,
          encryptionScheme.slice(0, 40),
          Number(attachmentBytes || 0),
          userId,
        ]
      );

      res.status(200).json({
        id: update.rows[0].id,
        version: update.rows[0].version,
        updatedAt: update.rows[0].updated_at,
        usedBytes: used + diff,
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
      });

      await recordAudit(client, {
        req,
        action: "vault_item_update",
        actorUserId: userId,
        targetType: "vault_item",
        targetId: itemId,
        status: "success",
        meta: {
          previousBytes: currentBytes,
          newBytes,
          version: update.rows[0].version,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "updateVaultItem failed");
      res.status(500).json({ error: "Unable to update vault item." });
    } finally {
      client.release();
    }
  }

  async function getVaultUsage(req, res) {
    const userId = readUserId(req);
    if (!userId) {
      res.status(401).json({ error: "userId is required (header x-user-id or query)." });
      return;
    }
    const client = await pool.connect();
    try {
      const user = await getUserProfile(client, userId);
      if (!user) {
        res.status(401).json({ error: "Invalid user." });
        return;
      }
      const usage = await getUserUsageSummary(client, userId);
      res.status(200).json({
        userId,
        usedBytes: usage.usedBytes,
        attachmentBytes: usage.attachmentBytes,
        ciphertextBytes: usage.ciphertextBytes,
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          gender: user.gender,
          createdAt: user.created_at,
          lastLogin: user.last_login,
          lastLoginIp: user.last_login_ip,
          emailVerifiedAt: user.email_verified_at,
          avatarUpdatedAt: user.avatar_updated_at,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "getVaultUsage failed");
      res.status(500).json({ error: "Unable to fetch usage." });
    } finally {
      client.release();
    }
  }

  async function createAttachment(req, res) {
    const userId = readUserId(req);
    const itemId = String(req.params?.id || "").trim();
    const {
      blobPath,
      sizeBytes = 0,
      mimeType,
      ciphertextKeyWrap,
      nonce,
      authTag,
      bytesError,
    } = parseAttachmentPayload(req.body || {});

    if (!userId || !itemId) {
      res.status(400).json({ error: "userId and item id are required." });
      return;
    }
    if (!blobPath || !sizeBytes) {
      res.status(400).json({ error: "blobPath and sizeBytes are required." });
      return;
    }
    if (bytesError) {
      res.status(400).json({ error: bytesError });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await ensureUser(client, userId);
      if (!user) {
        await client.query("ROLLBACK");
        res.status(401).json({ error: "Invalid user." });
        return;
      }

      const currentItem = await client.query(
        `SELECT id, attachment_bytes, version FROM vault_items WHERE id=$1 AND user_id=$2 FOR UPDATE`,
        [itemId, userId]
      );
      if (currentItem.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Item not found." });
        return;
      }

      const used = await getUserUsageBytes(client, userId);
      if (perUserQuotaBytes > 0 && used + sizeBytes > perUserQuotaBytes) {
        await client.query("ROLLBACK");
        res.status(413).json({
          error: "User storage quota exceeded.",
          quotaBytes: perUserQuotaBytes,
          usedBytes: used,
          requestedBytes: sizeBytes,
        });
        return;
      }

      const insert = await client.query(
        `
        INSERT INTO attachments (vault_item_id, blob_path, size_bytes, mime_type, ciphertext_key_wrap, nonce, auth_tag)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id, created_at
      `,
        [itemId, blobPath, sizeBytes, mimeType || null, ciphertextKeyWrap, nonce, authTag]
      );

      const update = await client.query(
        `
        UPDATE vault_items
        SET attachment_bytes = attachment_bytes + $2,
            version = version + 1,
            updated_at = now()
        WHERE id=$1
        RETURNING version, updated_at
      `,
        [itemId, sizeBytes]
      );

      await recordAudit(client, {
        req,
        action: "vault_attachment_create",
        actorUserId: userId,
        targetType: "vault_item",
        targetId: itemId,
        status: "success",
        meta: {
          attachmentId: insert.rows[0].id,
          sizeBytes,
          version: update.rows[0].version,
        },
      });

      await client.query("COMMIT");

      res.status(201).json({
        attachmentId: insert.rows[0].id,
        itemId,
        version: update.rows[0].version,
        createdAt: insert.rows[0].created_at,
        updatedAt: update.rows[0].updated_at,
        usedBytes: used + sizeBytes,
        quotaBytes: perUserQuotaBytes > 0 ? perUserQuotaBytes : null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error({ err: error }, "createAttachment failed");
      res.status(500).json({ error: "Unable to attach file." });
    } finally {
      client.release();
    }
  }

  return {
    createVaultItem,
    listVaultItems,
    getVaultItem,
    updateVaultItem,
    getVaultUsage,
    createAttachment,
  };
}

function sanitizeBody(body) {
  return {
    userId: String(body.userId || "").trim(),
    title: String(body.title || "")
      .trim()
      .slice(0, 120),
    encryptionScheme: String(body.encryptionScheme || "AES-GCM").trim(),
    attachmentBytes: Number(body.attachmentBytes || 0),
  };
}

function parseCryptoPayload(body) {
  try {
    const ciphertext = Buffer.from(String(body.ciphertext || ""), "base64");
    const nonce = Buffer.from(String(body.nonce || ""), "base64");
    const authTag = Buffer.from(String(body.authTag || ""), "base64");
    if (!ciphertext.length || !nonce.length || !authTag.length) {
      return { bytesError: "ciphertext, nonce, and authTag are required (base64)." };
    }
    return { ciphertext, nonce, authTag };
  } catch (error) {
    return { bytesError: "Invalid base64 encoding." };
  }
}

async function ensureUser(client, userId) {
  if (!userId) return null;
  const row = await client.query(`SELECT id FROM users WHERE id=$1`, [userId]);
  return row.rowCount ? row.rows[0] : null;
}

async function getUserProfile(client, userId) {
  if (!userId) return null;
  const row = await client.query(
    `
    SELECT id, username, email, gender, created_at, last_login, last_login_ip, email_verified_at, avatar_updated_at
    FROM users
    WHERE id=$1
  `,
    [userId]
  );
  return row.rowCount ? row.rows[0] : null;
}

async function getUserUsageSummary(client, userId) {
  const row = await client.query(
    `
    SELECT
      COALESCE(SUM(octet_length(v.ciphertext)), 0)::bigint AS ciphertext_bytes,
      COALESCE(SUM(v.attachment_bytes), 0)::bigint AS attachment_bytes,
      COALESCE(SUM(a.size_bytes), 0)::bigint AS attachment_table_bytes
    FROM vault_items v
    LEFT JOIN attachments a ON a.vault_item_id = v.id
    WHERE v.user_id = $1
  `,
    [userId]
  );
  if (!row.rowCount) {
    return { usedBytes: 0, ciphertextBytes: 0, attachmentBytes: 0 };
  }
  const ciphertextBytes = Number(row.rows[0].ciphertext_bytes || 0);
  const attachmentBytes = Math.max(
    Number(row.rows[0].attachment_bytes || 0),
    Number(row.rows[0].attachment_table_bytes || 0)
  );
  return {
    ciphertextBytes,
    attachmentBytes,
    usedBytes: ciphertextBytes + attachmentBytes,
  };
}

async function getUserUsageBytes(client, userId) {
  const row = await client.query(
    `
    SELECT
      COALESCE(SUM(octet_length(v.ciphertext)), 0)::bigint AS ciphertext_bytes,
      COALESCE(SUM(v.attachment_bytes), 0)::bigint AS attachment_bytes,
      COALESCE(SUM(a.size_bytes), 0)::bigint AS attachment_table_bytes
    FROM vault_items v
    LEFT JOIN attachments a ON a.vault_item_id = v.id
    WHERE v.user_id = $1
  `,
    [userId]
  );
  if (!row.rowCount) return 0;
  const ciphertextBytes = Number(row.rows[0].ciphertext_bytes || 0);
  const attachmentBytes = Number(row.rows[0].attachment_bytes || 0);
  const attachmentTableBytes = Number(row.rows[0].attachment_table_bytes || 0);
  return ciphertextBytes + Math.max(attachmentBytes, attachmentTableBytes);
}

async function recordAudit(client, options = {}) {
  const {
    req,
    actorUserId = null,
    action,
    targetType = null,
    targetId = null,
    status = "success",
    reason = null,
    meta = null,
  } = options;
  if (!action) return;
  const ip =
    req?.headers?.["x-forwarded-for"]?.split(",")?.[0]?.trim() ||
    req?.ip ||
    req?.connection?.remoteAddress ||
    null;
  const userAgent = req?.headers?.["user-agent"] || null;
  try {
    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, ip, user_agent, status, reason, meta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
      [
        actorUserId || null,
        action,
        targetType,
        targetId || null,
        ip,
        userAgent,
        status,
        reason,
        meta,
      ]
    );
  } catch (error) {
    // Avoid failing user flows because of audit log issues
    console.warn("audit_log_failed", { error, action, targetId });
  }
}

function parseAttachmentPayload(body) {
  try {
    const ciphertextKeyWrap = body.ciphertextKeyWrap
      ? Buffer.from(String(body.ciphertextKeyWrap || ""), "base64")
      : null;
    const nonce = body.nonce ? Buffer.from(String(body.nonce || ""), "base64") : null;
    const authTag = body.authTag ? Buffer.from(String(body.authTag || ""), "base64") : null;
    return {
      blobPath: String(body.blobPath || "").trim(),
      sizeBytes: Number(body.sizeBytes || 0),
      mimeType: String(body.mimeType || "")
        .trim()
        .slice(0, 120),
      ciphertextKeyWrap,
      nonce,
      authTag,
    };
  } catch (error) {
    return { bytesError: "Invalid base64 encoding for attachment payload." };
  }
}

module.exports = {
  createVaultApiController,
};
