"use strict";

const request = require("supertest");
const { createApp } = require("../app");

function buildTestApp(overrides = {}) {
  const { app } = createApp({
    env: {
      ...process.env,
      NODE_ENV: "test",
      HOST: "127.0.0.1",
      PORT: "3999",
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
  const app = buildTestApp(overrides);
  const server = app.listen(0, "127.0.0.1");

  try {
    await waitForServerReady(server);
  } catch (error) {
    closeServerSilently(server);
    const readableCode = error?.code ? ` (${error.code})` : "";
    throw new Error(
      `Unable to start backend test server on 127.0.0.1${readableCode}. ` +
        "Run tests in an environment that allows opening local TCP ports."
    );
  }

  return {
    request: request(server),
    close: () => closeServer(server),
  };
}

async function withTestClient(overrides, testFn) {
  const client = await createTestClient(overrides);
  try {
    await testFn(client);
  } finally {
    await client.close();
  }
}

function waitForServerReady(server) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      server.off("listening", onListening);
      server.off("error", onError);
    };

    server.on("listening", onListening);
    server.on("error", onError);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && error.message !== "Server is not running.") {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function closeServerSilently(server) {
  if (!server || typeof server.close !== "function") return;
  try {
    server.close(() => {});
  } catch (error) {
    // Ignore close errors during failed startup.
  }
}

describe("public routes", () => {
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

describe("admin routes", () => {
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
