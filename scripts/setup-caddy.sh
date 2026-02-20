#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
SITE_NAME="${SITE_NAME:-auth}"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-8080}"
ADMIN_INTERNAL_ONLY="${ADMIN_INTERNAL_ONLY:-true}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Usage:"
  echo "  DOMAIN=your-domain.com ./scripts/setup-caddy.sh"
  exit 1
fi

echo "[caddy] Installing Caddy"
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt update
sudo apt install -y caddy

echo "[caddy] Writing Caddyfile with HTTP/3 enabled"
ADMIN_BLOCK=""
if [[ "${ADMIN_INTERNAL_ONLY}" == "true" ]]; then
  ADMIN_BLOCK=$'    @adminPublic {\n        path /admin*\n        not remote_ip private_ranges\n    }\n    respond @adminPublic 404\n\n'
fi

sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
{
    servers {
        protocols h1 h2 h3
    }
}

${DOMAIN} {
    encode zstd gzip
${ADMIN_BLOCK}    reverse_proxy ${APP_HOST}:${APP_PORT}
}
EOF

echo "[caddy] Validating Caddyfile"
sudo caddy validate --config /etc/caddy/Caddyfile

echo "[caddy] Enabling and restarting service"
sudo systemctl enable caddy
sudo systemctl restart caddy

echo "[caddy] Setup complete"
echo "  Domain: https://${DOMAIN}"
echo "  Upstream: http://${APP_HOST}:${APP_PORT}"
echo "  Protocols: h1, h2, h3"
echo "  Admin internal-only: ${ADMIN_INTERNAL_ONLY}"
echo
echo "[caddy] Important: allow UDP 443 in firewall for HTTP/3 (QUIC)."
echo "  Example (ufw): sudo ufw allow 443/tcp && sudo ufw allow 443/udp"
