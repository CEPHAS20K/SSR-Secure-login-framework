"use strict";

const Redis = require("ioredis");

const RATE_LIMIT_DISABLED =
  process.env.DISABLE_RATE_LIMIT === "true" || process.env.NODE_ENV === "test";

let redis = null;
if (!RATE_LIMIT_DISABLED) {
  const redisUrl =
    process.env.REDIS_URL ||
    process.env.REDIS_CONNECTION_STRING ||
    "redis://default:vault%40340k@localhost:6379/0";

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });

  redis.on("error", (error) => {
    // Fail open; just log to avoid unhandled error events in test/dev when Redis is unavailable.
    console.warn("rateLimit redis error", error);
  });
}

function rateLimit(options) {
  const {
    windowSec = 60,
    limit = 10,
    keyBuilder = (req) => req.ip || "global",
    headerPrefix = "X-RateLimit",
  } = options;

  return async function rateLimitMiddleware(req, res, next) {
    if (RATE_LIMIT_DISABLED || !redis) {
      next();
      return;
    }
    const key = `rl:${keyBuilder(req)}`;
    const ttl = windowSec;
    try {
      const tx = redis.multi();
      tx.incr(key);
      tx.ttl(key);
      const [count, ttlLeft] = await tx.exec();
      const remainingTtl = ttlLeft[1] > 0 ? ttlLeft[1] : ttl;
      if (count[1] === 1) {
        await redis.expire(key, ttl);
      }
      res.setHeader(`${headerPrefix}-Limit`, String(limit));
      res.setHeader(`${headerPrefix}-Remaining`, String(Math.max(limit - count[1], 0)));
      res.setHeader(`${headerPrefix}-Reset`, String(remainingTtl));

      if (count[1] > limit) {
        return res.status(429).json({ error: "Too many requests. Please slow down." });
      }
    } catch (error) {
      // Fail open on Redis errors
      // eslint-disable-next-line no-console
      console.warn("rateLimit redis error", error);
    }
    next();
  };
}

module.exports = {
  rateLimit,
};
