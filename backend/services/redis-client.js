"use strict";

const Redis = require("ioredis");

const REDIS_DISABLED = process.env.DISABLE_REDIS === "true" || process.env.NODE_ENV === "test";

let redis;
if (REDIS_DISABLED) {
  // Lightweight stub so code paths can run in test environments without a Redis instance.
  const noop = async () => null;
  const ok = async () => "OK";
  redis = {
    get: noop,
    setex: ok,
    del: ok,
    incr: async () => 0,
    expire: ok,
    ttl: async () => -1,
  };
} else {
  const redisUrl =
    process.env.REDIS_URL ||
    process.env.REDIS_CONNECTION_STRING ||
    "redis://default:vault%40340k@localhost:6379/0";

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });

  redis.on("error", (error) => {
    console.error("Redis error", error);
  });
}

module.exports = {
  redis,
};
