"use strict";

const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://vault-user:auth%40340@postgres:5432/vault";

const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  // Log and continue; callers should handle their own query errors.
  console.error("Unexpected PG error", error);
});

module.exports = {
  pool,
};
