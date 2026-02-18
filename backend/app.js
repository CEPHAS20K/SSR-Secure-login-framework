const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

const ENV_FILE = process.env.NODE_ENV === "production" ? ".env.proc" : ".env.dev";
dotenv.config({ path: path.join(__dirname, ENV_FILE) });

const app = express();
const PORT = resolvePort(process.env.PORT, 3000);
const HOST = process.env.HOST || "127.0.0.1";

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const VIEWS_DIR = path.join(FRONTEND_DIR, "views");
const PUBLIC_DIR = path.join(FRONTEND_DIR, "public");

app.set("view engine", "pug");
app.set("views", VIEWS_DIR);
app.use(express.static(PUBLIC_DIR));

app.get("/", (req, res) => {
  res.render("login", { title: "Login", activePage: "login", page: "login" });
});

app.get("/register", (req, res) => {
  res.render("register", { title: "Register", activePage: "register", page: "register" });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

if (process.env.NODE_ENV !== "production") {
  app.get("/debug-500", (req, res, next) => {
    next(new Error("Intentional test error for 500 page"));
  });
}

app.use((req, res) => {
  if (req.accepts("html")) {
    res.status(404).render("404", { title: "404 Not Found", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(404).json({ error: "Not Found" });
    return;
  }

  res.status(404).type("txt").send("Not Found");
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    next(error);
    return;
  }

  if (req.accepts("html")) {
    res.status(500).render("500", { title: "500 Server Error", page: "error" });
    return;
  }

  if (req.accepts("json")) {
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }

  res.status(500).type("txt").send("Internal Server Error");
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend server running at http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  console.error("Server failed to start:", error.message);
  if (error.code === "EADDRINUSE" || error.code === "EPERM") {
    console.error("Update backend/.env.dev with a different PORT, then restart npm run dev.");
  }
  process.exit(1);
});

function resolvePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}
