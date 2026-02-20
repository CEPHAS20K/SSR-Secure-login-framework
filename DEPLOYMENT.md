# Deployment Guide

## 1) Server prerequisites

```bash
sudo apt update
sudo apt install -y git
sudo npm i -g pm2
```

## 2) Clone and first boot

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
cd /var/www
git clone git@github.com:YOUR_USER/YOUR_REPO.git auth
cd auth

npm run setup
npm run build

ASSET_VERSION=$(git rev-parse --short HEAD) NODE_ENV=production \
pm2 start npm --name auth-app --prefix /var/www/auth/backend -- run start:proc

pm2 save
pm2 startup
```

## 3) Caddy + HTTPS + HTTP/3

Use the included setup script:

```bash
cd /var/www/auth
DOMAIN=your-domain.com ./scripts/setup-caddy.sh
```

You can also review the base config template:

- `deploy/caddy/Caddyfile.example`

Important:

- HTTP/3 uses QUIC over UDP 443. Open both TCP and UDP on 443.
  - Example: `sudo ufw allow 443/tcp && sudo ufw allow 443/udp`

## 4) GitHub auto-deploy

This repo already includes:

- `.github/workflows/deploy.yml`
- `scripts/deploy.sh`

Add these GitHub Action secrets:

- `SSH_HOST`
- `SSH_USER`
- `SSH_PORT`
- `SSH_KEY`
- Optional: `APP_DIR` (default `/var/www/auth`)
- Optional: `DEPLOY_BRANCH` (default `main`)
- Optional: `PM2_APP_NAME` (default `auth-app`)

On every push to `main`, the server will:

1. Pull latest code
2. Install dependencies
3. Build frontend assets
4. Set `ASSET_VERSION` to current commit hash
5. Restart PM2 app with updated env

## 5) Manual deploy command

```bash
cd /var/www/auth
./scripts/deploy.sh
```

## 6) Verify

```bash
pm2 status
pm2 logs auth-app --lines 100
curl -I https://your-domain.com/health
curl -I --http3 https://your-domain.com/health
```
