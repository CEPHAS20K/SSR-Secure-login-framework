"use strict";

const request = require("supertest");
const net = require("net");
const { createApp } = require("../app");

function canBind() {
  try {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1");
    probe.close();
    return true;
  } catch {
    return false;
  }
}

const SKIP_NETWORK_TESTS =
  process.env.SKIP_NETWORK_TESTS === "true"
    ? true
    : process.env.SKIP_NETWORK_TESTS === "false"
      ? false
      : !canBind();

function buildTestApp(overrides = {}) {
  const { app } = createApp({
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: process.env.TEST_HOST || "127.0.0.1",
      PORT: process.env.TEST_PORT || "3999",
      FORCE_NO_STORE: "true",
      APP_VERSION: "test-v1",
      ADMIN_ENABLED: "true",
      ADMIN_INTERNAL_ONLY: "false",
      ...overrides,
    },
  });
  return app;
}

function buildTestClient(overrides = {}) {
  return request(buildTestApp(overrides));
}

async function createTestClient(overrides = {}) {
  const server = null;
  return {
    request: request(buildTestApp(overrides)),
    close: () => Promise.resolve(),
  };
}

async function withTestClient(overrides, testFn) {
  if (SKIP_NETWORK_TESTS) {
    // eslint-disable-next-line no-console
    console.warn("[tests] Skipping HTTP route tests (SKIP_NETWORK_TESTS enabled or bind blocked).");
    return;
  }
  const client = await createTestClient(overrides);
  try {
    await testFn(client);
  } finally {
    await client.close();
  }
}

function waitForServerReady(server) {
  return Promise.resolve(server);
}

function closeServer(server) {
  return Promise.resolve(server);
}

function closeServerSilently(server) {
  return;
}

describe(SKIP_NETWORK_TESTS ? "public routes (skipped)" : "public routes", () => {
  it("serves landing page", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.get("/").expect(200);

      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.text).toContain("Secure Storage Vault");
    });
  });

  it("returns health payload with uptime metadata", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.get("/health").expect(200);

      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body.status).toBe("ok");
      expect(typeof response.body.uptimeSeconds).toBe("number");
      expect(typeof response.body.timestamp).toBe("string");
      expect(response.body.version).toBe("test-v1");
    });
  });

  it("returns version payload for UI/API versioning", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.get("/version").expect(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.body.app).toBe("Secure Storage Vault");
      expect(response.body.version).toBe("test-v1");
      expect(typeof response.body.assetVersion).toBe("string");
    });
  });

  it("accepts frontend RUM metric payloads", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/api/rum").send({
        name: "LCP",
        value: 1890.44,
        path: "/login",
        page: "login",
        connectionType: "4g",
        timestamp: new Date().toISOString(),
      });

      expect(response.status).toBe(202);
      expect(response.body.accepted).toBe(true);
    });
  });

  it("rejects invalid RUM metric payloads", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/api/rum").send({
        name: "BAD_METRIC",
        value: "fast",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeTypeOf("string");
    });
  });

  it("serves Swagger UI and raw OpenAPI document", async () => {
    await withTestClient({}, async (client) => {
      await client.request.get("/api-docs").expect(301);
      const uiResponse = await client.request.get("/api-docs/").expect(200);
      expect(uiResponse.headers["content-type"]).toContain("text/html");

      const jsonResponse = await client.request.get("/api-docs.json").expect(200);
      expect(jsonResponse.headers["content-type"]).toContain("application/json");
      expect(jsonResponse.body.openapi).toBe("3.0.3");
      expect(jsonResponse.body.paths).toBeTypeOf("object");
    });
  });

  it("returns 404 for docs routes when API docs are disabled", async () => {
    await withTestClient(
      {
        API_DOCS_ENABLED: "false",
      },
      async (client) => {
        await client.request.get("/api-docs").expect(404);
        await client.request.get("/api-docs.json").expect(404);
      }
    );
  });

  it("rejects invalid login payloads", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/auth/login").send({
        email: "bad",
        password: "1",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeTypeOf("string");
    });
  });

  it("returns not configured for valid login payloads", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/auth/login").send({
        email: "user@example.com",
        password: "password123",
      });

      expect(response.status).toBe(501);
      expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
    });
  });

  it("rejects registration payloads with mismatched password", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/auth/register").send({
        username: "test-user",
        email: "user@example.com",
        password: "password123",
        confirmPassword: "password124",
        gender: "male",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Passwords do not match");
    });
  });

  it("returns not configured for valid registration payloads", async () => {
    await withTestClient({}, async (client) => {
      const response = await client.request.post("/auth/register").send({
        username: "test-user",
        email: "user@example.com",
        password: "password123",
        confirmPassword: "password123",
        gender: "female",
      });

      expect(response.status).toBe(501);
      expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
    });
  });
});

describe(SKIP_NETWORK_TESTS ? "admin routes (skipped)" : "admin routes", () => {
  it("serves admin login when admin routes are enabled", async () => {
    await withTestClient(
      {
        ADMIN_ENABLED: "true",
        ADMIN_INTERNAL_ONLY: "false",
      },
      async (client) => {
        const response = await client.request.get("/admin/login").expect(200);

        expect(response.headers["content-type"]).toContain("text/html");
        expect(response.text).toContain("Admin Login");
      }
    );
  });

  it("returns 404 when admin routes are disabled", async () => {
    await withTestClient(
      {
        ADMIN_ENABLED: "false",
      },
      async (client) => {
        await client.request.get("/admin/login").expect(404);
      }
    );
  });
});
