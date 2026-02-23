"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { chromium } = require("@playwright/test");

const HOST = process.env.DEMO_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.DEMO_PORT || "4173", 10);
const BASE_URL = process.env.DEMO_BASE_URL || `http://${HOST}:${PORT}`;
const OUTPUT_DIR = path.resolve(
  process.cwd(),
  process.env.DEMO_VIDEO_DIR || "artifacts/demo-videos"
);
const OUTPUT_FILE = process.env.DEMO_VIDEO_FILE || `app-flow-${Date.now()}.webm`;
const HEALTH_URL = `${BASE_URL}/health`;
const STARTUP_TIMEOUT_MS = Number.parseInt(process.env.DEMO_STARTUP_TIMEOUT_MS || "90000", 10);
const HEADED = process.env.DEMO_HEADED === "1";
const ROOT_DIR = path.resolve(__dirname, "..");
const DEMO_SPEED_MULTIPLIER = resolvePositiveFloat(process.env.DEMO_SPEED_MULTIPLIER, 1.6);

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  process.stdout.write(`[demo-video] speed multiplier: ${DEMO_SPEED_MULTIPLIER}x\n`);

  const server = await ensureServer();
  try {
    const result = await recordVideo();
    process.stdout.write(`[demo-video] saved: ${result.finalPath}\n`);
    if (result.playbackPagePath) {
      process.stdout.write(`[demo-video] browser playback page: ${result.playbackPagePath}\n`);
    }
    if (result.mp4Path) {
      process.stdout.write(`[demo-video] mp4 copy: ${result.mp4Path}\n`);
    } else if (result.ffmpegMissing) {
      process.stdout.write(
        "[demo-video] ffmpeg not found; kept .webm only. Open the playback HTML in Chrome/Edge/Firefox.\n"
      );
    }
    process.stdout.write(
      "[demo-video] done. Share this video with users as a guided login/app-flow walkthrough.\n"
    );
  } finally {
    if (server.startedByScript) {
      await stopServer(server.child);
    }
  }
}

async function ensureServer() {
  if (await isHealthy()) {
    process.stdout.write("[demo-video] reusing existing server\n");
    return { startedByScript: false, child: null };
  }

  process.stdout.write("[demo-video] starting backend server for recording\n");
  const child = spawn(process.execPath, [path.join(ROOT_DIR, "backend", "app.js")], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      LOG_LEVEL: process.env.LOG_LEVEL || "error",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  const startTime = Date.now();
  while (Date.now() - startTime < STARTUP_TIMEOUT_MS) {
    if (await isHealthy()) {
      process.stdout.write("[demo-video] backend is ready\n");
      return { startedByScript: true, child };
    }
    if (child.exitCode !== null) {
      throw new Error(`Backend exited early with code ${child.exitCode}`);
    }
    await sleep(500);
  }

  throw new Error(`Backend did not become healthy within ${STARTUP_TIMEOUT_MS}ms`);
}

async function recordVideo() {
  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1366, height: 768 },
    },
  });
  const page = await context.newPage();

  const video = page.video();
  if (!video) {
    throw new Error("Playwright video recorder is unavailable");
  }

  try {
    await walkthrough(page);
  } finally {
    await context.close();
    await browser.close();
  }

  const rawVideoPath = await video.path();
  const finalPath = ensureWebmOutputPath(path.join(OUTPUT_DIR, OUTPUT_FILE));
  if (rawVideoPath !== finalPath) {
    if (fs.existsSync(finalPath)) {
      fs.rmSync(finalPath, { force: true });
    }
    fs.renameSync(rawVideoPath, finalPath);
  }

  const playbackPagePath = writePlaybackPage(finalPath);

  let mp4Path = null;
  let ffmpegMissing = false;
  if (hasCommand("ffmpeg")) {
    mp4Path = changeExtension(finalPath, ".mp4");
    await transcodeToMp4(finalPath, mp4Path);
  } else {
    ffmpegMissing = true;
  }

  return {
    finalPath,
    playbackPagePath,
    mp4Path,
    ffmpegMissing,
  };
}

async function walkthrough(page) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await pause(1200);

  await page.locator('a[href="/login"]').first().click();
  await page.waitForURL("**/login");
  await pause(800);

  await page.fill("#email", "demo.user@example.com");
  await pause(250);
  await page.fill("#password", "StrongPass123!");
  await pause(250);
  await page.click("#forgotPasswordLink");
  await pause(400);
  await page.fill("#resetEmail", "demo.user@example.com");
  await page.fill("#resetNewPassword", "StrongPass123!");
  await page.fill("#resetConfirmPassword", "StrongPass123!");
  await pause(600);
  await page.click("#resetClose");
  await pause(600);

  await page.click("#loginBtn");
  await page.waitForSelector("#otpModal", { state: "visible" });
  await pause(600);
  await page.fill("#otpInput", "12345");
  await pause(600);
  await page.click("#otpClose");
  await pause(600);

  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
  await pause(800);
  await page.fill("#username", "demo-user");
  await page.fill("#regEmail", "demo-user@example.com");
  await page.fill("#regPassword", "StrongPass123!");
  await page.fill("#regPasswordConfirm", "StrongPass123!");
  await page.selectOption("#gender", "male");
  await page.check("#agreeTerms");
  await pause(700);
  await page.click("#registerBtn");
  await page.waitForSelector("#registerOtpModal", { state: "visible" });
  await pause(700);
  await page.fill("#registerOtpInput", "12345");
  await pause(500);
  await page.click("#registerOtpClose");
  await pause(600);

  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
  await pause(800);
  await page.fill("#username", "admin");
  await page.fill("#password", "admin-pass");
  await pause(900);
}

async function isHealthy() {
  try {
    const response = await fetch(HEALTH_URL, {
      method: "GET",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return;
    await sleep(100);
  }
  child.kill("SIGKILL");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pause(ms) {
  return sleep(Math.max(0, Math.round(ms * DEMO_SPEED_MULTIPLIER)));
}

function resolvePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function ensureWebmOutputPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return filePath;
  const normalized = changeExtension(filePath, ".webm");
  process.stdout.write(
    `[demo-video] adjusted output extension to .webm for Playwright recording: ${path.basename(
      normalized
    )}\n`
  );
  return normalized;
}

function changeExtension(filePath, nextExt) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(dir, `${base}${nextExt}`);
}

function writePlaybackPage(videoPath) {
  const htmlPath = changeExtension(videoPath, ".html");
  const videoName = path.basename(videoPath);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Demo Video Playback</title>
  <style>
    body { margin: 0; background: #111; color: #eee; font-family: system-ui, sans-serif; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { max-width: 1040px; width: 100%; }
    video { width: 100%; border-radius: 10px; background: #000; }
    p { margin: 10px 0 0; font-size: 14px; opacity: .85; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <video controls autoplay muted playsinline>
        <source src="./${videoName}" type="video/webm" />
      </video>
      <p>If your default media player fails, open this HTML in Chrome/Edge/Firefox.</p>
    </div>
  </main>
</body>
</html>
`;
  fs.writeFileSync(htmlPath, html, "utf8");
  return htmlPath;
}

function hasCommand(command) {
  try {
    const check = spawnSync("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return check.status === 0;
  } catch {
    return false;
  }
}

async function transcodeToMp4(sourcePath, targetPath) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-movflags",
    "+faststart",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    targetPath,
  ]);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${command}): ${stderr || `exit code ${code}`}`));
    });
  });
}

main().catch((error) => {
  process.stderr.write(`[demo-video] failed: ${error.message}\n`);
  process.exit(1);
});
