# Construction Camera System

Live WebRTC camera streaming from an Android phone to a desktop browser.
No native app required — runs entirely in the browser.

```
Android Chrome (sender)  ──PeerJS──►  peerjs-signaling-server  ◄──PeerJS──  Desktop Browser (viewer)
                                        (signaling only)
                              WebRTC P2P stream (direct after handshake)
```

## Quick Start

### 1. Deploy the Signaling Server

Deploy [peerjs-signaling-server](https://github.com/digi4arch424/peerjs-signaling-server) to Render.com.
Get your URL: `https://YOUR-NAME.onrender.com`

### 2. Configure

Edit `app.js` with your Render URL:

```js
PEER_SERVER: {
  host:   "YOUR-NAME.onrender.com",
  port:   443,
  path:   "/construction-cam",
  secure: true,
}
```

### 3. Deploy Frontend

Push to GitHub and enable Pages:
Settings → Pages → Branch: `main` → Folder: `/ (root)`

### 4. Stream

- **Android**: Open `sender.html` → tap **▶ Start Stream** → allow camera
- **Desktop**: Open `viewer.html` → stream appears automatically

---

## Structure

```
construction-cam/
├── README.md
├── .gitignore
├── index.html              # Landing page
├── sender.html             # Android camera sender
├── viewer.html             # Desktop viewer
├── app.js                  # Shared config & utilities
├── sender.js               # Sender PeerJS + WebRTC logic
├── viewer.js               # Viewer PeerJS + WebRTC logic
├── ice.js                  # ICE server stack (STUN + TURN)
├── debug.js                # Real-time debug panel
├── style.css               # UI theme
└── docs/
    └── architecture.md
```

---

## Related Repos

- [peerjs-signaling-server](https://github.com/digi4arch424/peerjs-signaling-server) — Dedicated PeerJS signaling server

## Requirements

- **Sender**: Android Chrome (or any browser with `getUserMedia`)
- **Viewer**: Any modern desktop browser
- **Signaling**: [peerjs-signaling-server](https://github.com/digi4arch424/peerjs-signaling-server) on Render.com

## Milestones

- ✅ M1 — Browser-to-browser streaming (current)
- 🔜 M2 — GPS + compass metadata overlay
- 🔜 M3 — Visual marker anchoring (AR.js)
- 🔜 M4 — 3D overlay on viewer (Three.js)
- 🔜 M5 — Multiset WebXR VPS integration
- 🔜 M6 — Site scan import + BIM overlay
- 🔜 M7 — Full construction platform

---

## Live Site

🔗 https://digi4arch424.github.io/site-eye-webRTC/
