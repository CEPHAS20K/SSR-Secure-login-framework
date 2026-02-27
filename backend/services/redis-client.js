"use strict";

const Redis = require("ioredis");

const redisUrl =
  process.env.REDIS_URL ||
  process.env.REDIS_CONNECTION_STRING ||
  "redis://default:vault%40340k@localhost:6379/0";

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
});

redis.on("error", (error) => {
  console.error("Redis error", error);
});

module.exports = {
  redis,
};
