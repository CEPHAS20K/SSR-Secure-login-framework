#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function minifySvgContent(raw) {
  return raw
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\/>/g, "/>")
    .trim();
}

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B`;
}

const inputFiles = process.argv.slice(2);
if (!inputFiles.length) {
  console.error("Usage: node scripts/minify-svg.js <file1.svg> <file2.svg> ...");
  process.exit(1);
}

for (const input of inputFiles) {
  const targetPath = path.resolve(process.cwd(), input);
  const original = fs.readFileSync(targetPath, "utf8");
  const minified = minifySvgContent(original);
  fs.writeFileSync(targetPath, `${minified}\n`, "utf8");

  const before = Buffer.byteLength(original, "utf8");
  const after = Buffer.byteLength(minified, "utf8");
  const delta = before - after;
  const percent = before > 0 ? ((delta / before) * 100).toFixed(2) : "0.00";

  console.log(
    `${path.relative(process.cwd(), targetPath)}: ${formatBytes(before)} -> ${formatBytes(after)} (${percent}% smaller)`
  );
}
