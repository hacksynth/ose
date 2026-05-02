# Self-hosting OSE

OSE is designed to run as a normal Next.js application with Prisma. You can deploy it with Docker, on a VPS, or on Vercel-style platforms.

## Docker Deployment

Build and start the service:

```bash
cp .env.example .env
docker compose up -d --build
```

The included `Dockerfile` builds a standalone Next.js application and the included `docker-compose.yml` stores SQLite data in a named volume.

Minimum production environment:

```env
DATABASE_URL=file:/data/ose.db
NEXTAUTH_URL=https://your-domain.example
NEXTAUTH_SECRET=replace-with-openssl-rand-base64-32
```

Optional AI variables can be added to `.env` or the Compose environment section.

## Vercel Deployment

1. Import the GitHub repository in Vercel.
2. Configure environment variables:
   - `DATABASE_URL`
   - `NEXTAUTH_URL`
   - `NEXTAUTH_SECRET`
   - AI provider keys as needed.
3. OSE currently only supports SQLite. Serverless platforms like Vercel use ephemeral file systems, which are not compatible with SQLite. PostgreSQL support is on the roadmap — Vercel deployment is not recommended until PostgreSQL support is available.
4. Run Prisma migrations from CI or a trusted machine:

```bash
npx prisma migrate deploy
```

## VPS Manual Deployment

Install Node.js 20, clone the repository, then:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
npm run start
```

Example systemd unit:

```ini
[Unit]
Description=OSE web application
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ose
EnvironmentFile=/opt/ose/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=ose
Group=ose

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ose
```

## Database

OSE currently ships with SQLite as the built-in supported database. The `DATABASE_URL` for all deployment modes should point to a SQLite file (e.g. `file:/data/ose.db`). PostgreSQL production deployment support is on the roadmap and is not available in the current version.

## HTTPS and Reverse Proxy

Example Nginx configuration:

```nginx
server {
  listen 80;
  server_name ose.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name ose.example.com;

  ssl_certificate /etc/letsencrypt/live/ose.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ose.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Set `NEXTAUTH_URL=https://ose.example.com` when using HTTPS.
