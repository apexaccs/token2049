# Deploying the backend

The site used to be pure static files served by nginx. It now needs a Node.js
process running alongside it — nginx keeps serving the domain, but proxies
everything to that process instead of reading files off disk directly
(the Node process serves the static files itself too).

Assumes the repo lives at `/var/www/dgp` on the server, as before. This
reflects the actual production setup on `token.apexaccs.org`.

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
- `PORT` — the local port the Node process listens on. **Check it's actually
  free first** (`ss -ltnp | grep :3000`) — on a box already running other
  Node apps, 3000 is a common collision; production here runs on `3010`.
- `ADMIN_PASSWORD` — the password you'll use to log into `/admin.html`.
- `ADMIN_SECRET` — generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `RESEND_API_KEY` — from your Resend dashboard.
- `RESEND_FROM` — e.g. `"Don't Get Played <send@apexaccs.org>"` (must be a verified sender/domain in Resend).
- `SITE_URL` — `https://token.apexaccs.org`

`.env` is git-ignored — it stays on the server and is never committed.
Lock it down: `chmod 600 .env`.

### Run it with pm2

This server already runs several other Node services under pm2, so the
backend is managed the same way rather than as its own systemd unit.

```bash
npm install -g pm2   # skip if pm2 is already installed

cd /var/www/dgp/server
pm2 start server.js --name dgp-backend
pm2 save
pm2 startup          # registers pm2 itself to start on boot (run the command it prints, if any)
pm2 save             # re-save after startup registers, so dgp-backend resurrects on reboot
```

Check it's alive:

```bash
pm2 status
pm2 logs dgp-backend --lines 20 --nostream
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3010/   # → 200
```

### Point nginx at it

The Node process serves both the static site and the `/api/*` routes, so
nginx's job is a plain reverse proxy instead of `root` + `try_files`.

Production config (`/etc/nginx/sites-available/token.apexaccs.org`) — note
it's **plain HTTP on port 80**, no TLS on the origin at all:

```nginx
server {
    listen 80;
    server_name token.apexaccs.org;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

This works because Cloudflare sits in front on **Flexible SSL**: the visitor's
browser talks HTTPS to Cloudflare, and Cloudflare talks plain HTTP to this
origin. If that ever changes to Full / Full (strict), nginx would need to
listen on 443 with a certificate (a free Cloudflare Origin CA cert is the
easiest route) — until then, don't add one, it isn't used.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 2. Every future deploy

```bash
cd /var/www/dgp
git fetch origin claude/bold-goodall-iq7hgo
git checkout -f FETCH_HEAD

# only needed when server/package.json changed:
cd server && npm install --omit=dev && cd ..

pm2 restart dgp-backend
```

The SQLite database lives at `server/data/dgp.db` and is untouched by
`git checkout -f` (it's git-ignored) — registrations survive every deploy.

## 3. Backups

The whole database is one file. A simple cron entry is enough:

```bash
0 3 * * * cp /var/www/dgp/server/data/dgp.db /var/backups/dgp-$(date +\%F).db
```
