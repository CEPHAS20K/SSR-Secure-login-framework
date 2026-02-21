#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUDGETS = [
  {
    name: "compiled-css",
    type: "file",
    target: "frontend/public/css/output.css",
    maxBytes: 90 * 1024,
  },
  {
    name: "main-dashboard-js",
    type: "file",
    target: "frontend/public/js/pages/admin/dashboard.js",
    maxBytes: 130 * 1024,
  },
  {
    name: "total-client-js",
    type: "group",
    targets: ["frontend/public/js", "frontend/public/vendor"],
    maxBytes: 360 * 1024,
  },
];

let hasFailure = false;

for (const budget of BUDGETS) {
  const actualBytes =
    budget.type === "group" ? sumGroupBytes(budget.targets) : fileBytes(budget.target);
  const delta = actualBytes - budget.maxBytes;
  const status = delta <= 0 ? "PASS" : "FAIL";

  if (delta > 0) hasFailure = true;
  const overBy = delta > 0 ? ` (+${formatBytes(delta)} over)` : "";
  process.stdout.write(
    `${status} ${budget.name}: ${formatBytes(actualBytes)} / ${formatBytes(budget.maxBytes)}${overBy}\n`
  );
}

if (hasFailure) {
  process.stderr.write("Bundle size budgets exceeded.\n");
  process.exit(1);
}

function fileBytes(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  const stats = fs.statSync(fullPath);
  return stats.size;
}

function sumGroupBytes(relativePaths) {
  return relativePaths.reduce((total, relativePath) => {
    const fullPath = path.join(ROOT, relativePath);
    return total + sumPathBytes(fullPath);
  }, 0);
}

function sumPathBytes(targetPath) {
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) return stats.size;

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  return entries.reduce((sum, entry) => {
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) return sum + sumPathBytes(fullPath);
    if (!entry.isFile()) return sum;
    return sum + fs.statSync(fullPath).size;
  }, 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
