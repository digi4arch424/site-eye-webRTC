# Construction Cam — Signaling Server

Minimal Node.js WebSocket relay for WebRTC peer connection setup.

## Requirements

- Node.js ≥ 18
- VPS with port 8080 open (TCP inbound)

## Setup

```bash
cd signaling-server
npm install
node server.js
```

Server starts on `ws://0.0.0.0:8080`

## Run as a Background Service (systemd)

Create `/etc/systemd/system/construction-cam.service`:

```ini
[Unit]
Description=Construction Camera Signaling Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/construction-cam/signaling-server
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable construction-cam
sudo systemctl start construction-cam
sudo systemctl status construction-cam
```

## Firewall (ufw)

```bash
sudo ufw allow 8080/tcp
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | WebSocket listen port |

## Logs

```bash
# If using systemd
sudo journalctl -u construction-cam -f

# If running manually
node server.js 2>&1 | tee cam.log
```

## TLS / WSS (required for HTTPS frontends)

If your frontend is on HTTPS (e.g. GitHub Pages), browsers will block `ws://` connections. Options:

**Option A — Nginx reverse proxy with Let's Encrypt (recommended)**

```nginx
server {
    listen 443 ssl;
    server_name signal.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/signal.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/signal.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Then use `wss://signal.yourdomain.com` in `app.js`.

**Option B — Use the sender.html over HTTP (local network)**

Access `http://LOCAL_IP/sender.html` from your phone (same WiFi as sender page server). Works without TLS for local testing.
