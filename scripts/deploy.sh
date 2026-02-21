#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/auth}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-auth-app}"
NODE_ENV="${NODE_ENV:-production}"
FORCE_NO_STORE="${FORCE_NO_STORE:-false}"

echo "[deploy] app dir: ${APP_DIR}"
echo "[deploy] branch: ${BRANCH}"
echo "[deploy] pm2 app: ${PM2_APP_NAME}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] pm2 is not installed on the server."
  echo "[deploy] install with: npm i -g pm2"
  exit 1
fi

cd "${APP_DIR}"

echo "[deploy] fetching latest code"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "[deploy] installing dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

if [[ -f backend/package-lock.json ]]; then
  npm --prefix backend ci
else
  npm --prefix backend install
fi

if [[ -f frontend/package-lock.json ]]; then
  npm --prefix frontend ci
else
  npm --prefix frontend install
fi

echo "[deploy] building frontend assets"
npm run build

ASSET_VERSION="$(git rev-parse --short HEAD)"
export ASSET_VERSION
export NODE_ENV
export FORCE_NO_STORE
echo "[deploy] asset version: ${ASSET_VERSION}"
echo "[deploy] force no-store: ${FORCE_NO_STORE}"

echo "[deploy] restarting process"
if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  pm2 restart "${PM2_APP_NAME}" --update-env
else
  pm2 start npm --name "${PM2_APP_NAME}" --prefix "${APP_DIR}/backend" -- run start:proc
fi

pm2 save
echo "[deploy] done"
