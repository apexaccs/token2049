# Deploying the backend

The site used to be pure static files served by nginx. It now needs a Node.js
process running alongside it — nginx keeps serving the domain, but proxies
everything to that process instead of reading files off disk directly
(the Node process serves the static files itself too).

Assumes the repo lives at `/var/www/dgp` on the server, as before.

## 1. One-time server setup

### Install Node.js (skip if already installed — need >= 18)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should print v20.x or newer
```

### Install dependencies

```bash
cd /var/www/dgp/server
npm install --omit=dev
```

### Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in:
- `ADMIN_PASSWORD` — the password you'll use to log into `/admin.html`.
- `ADMIN_SECRET` — generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `RESEND_API_KEY` — from your Resend dashboard.
- `RESEND_FROM` — e.g. `"Don't Get Played <hello@apexaccs.org>"` (must be a verified sender/domain in Resend).
- `SITE_URL` — `https://token.apexaccs.org`

`.env` is git-ignored — it stays on the server and is never committed.

### Run it as a systemd service

Create `/etc/systemd/system/dgp-backend.service`:

```ini
[Unit]
Description=Don't Get Played backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/dgp/server
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3
EnvironmentFile=/var/www/dgp/server/.env

[Install]
WantedBy=multi-user.target
```

(Adjust `User=` to whichever user owns `/var/www/dgp` and can read it — `www-data`
is the nginx default on Debian/Ubuntu.)

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dgp-backend
sudo systemctl status dgp-backend   # should show "active (running)"
```

### Point nginx at it

The Node process listens on `127.0.0.1:3000` (change `PORT` in `.env` if that
port is taken) and serves both the static site and the `/api/*` routes — so
nginx's job becomes a plain reverse proxy instead of `root` + `try_files`.

In your existing server block for `token.apexaccs.org`, replace the part that
serves static files with:

```nginx
server {
    listen 443 ssl http2;
    server_name token.apexaccs.org;

    # ... your existing ssl_certificate / ssl_certificate_key lines stay ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`X-Forwarded-Proto` is what tells the backend the connection is HTTPS, so
the admin session cookie gets marked `Secure` correctly.

## 2. Every future deploy

Same as before, plus two steps if `server/` changed:

```bash
cd /var/www/dgp
git fetch origin claude/bold-goodall-iq7hgo
git checkout -f FETCH_HEAD

# only needed when package.json changed:
cd server && npm install --omit=dev && cd ..

sudo systemctl restart dgp-backend
```

The SQLite database lives at `server/data/dgp.db` and is untouched by
`git checkout -f` (it's git-ignored) — registrations survive every deploy.

## 3. Backups

The whole database is one file. A simple cron entry is enough:

```bash
0 3 * * * cp /var/www/dgp/server/data/dgp.db /var/backups/dgp-$(date +\%F).db
```
