# Construction Camera System

Live WebRTC camera streaming from an Android phone to a desktop browser. Built as a primitive but expandable foundation for construction site monitoring.

```
Android Chrome (sender)  ──WebSocket──►  VPS Signaling Server  ◄──WebSocket──  Desktop Browser (viewer)
                                                │
                                        WebRTC P2P stream
                                   (bypasses server after handshake)
```

## Quick Start

### 1. Signaling Server (VPS)

```bash
cd signaling-server
npm install
node server.js
```

Open port 8080 TCP on your VPS firewall.

### 2. Configure & Deploy Frontend

Edit `app.js` and set your VPS IP:

```js
SIGNALING_SERVER_URL: "ws://YOUR_VPS_IP:8080",
```

Push to GitHub and enable Pages: Settings → Pages → Branch: `main` → Folder: `/ (root)`.

### 3. Stream

- **Android**: Open `sender.html` in Chrome → tap **Connect** → tap **▶ Start Stream** → allow camera
- **Desktop**: Open `viewer.html` → tap **Connect** → stream appears automatically

---

## Structure

```
construction-cam/
├── README.md
├── .gitignore
├── sender.html             # Android camera sender
├── viewer.html             # Desktop viewer
├── app.js                  # Shared config & utilities
├── sender.js               # Sender WebRTC logic
├── viewer.js               # Viewer WebRTC logic
├── style.css               # UI theme
├── signaling-server/       # Deploy to VPS
│   ├── server.js           # WebSocket relay server
│   └── package.json
└── docs/
    └── architecture.md     # WebRTC flow, scaling notes, future modules
```

---

## Requirements

- **VPS**: Node.js ≥ 18, port 8080 open
- **Sender**: Android Chrome (or any mobile browser with `getUserMedia`)
- **Viewer**: Any modern desktop browser

## Docs

- [Signaling server setup](signaling-server/README.md)
- [Architecture & scaling](docs/architecture.md)
