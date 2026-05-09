# Construction Camera System

Live WebRTC camera streaming from an Android phone to a desktop browser.
**No server required** — uses PeerJS free cloud signaling.

```
Android Chrome (sender)  ──PeerJS Cloud──►  Desktop Browser (viewer)
                              (signaling only — video is P2P)
```

## Quick Start

### 1. Deploy to GitHub Pages

Push the repo and enable Pages: Settings → Pages → Branch: `main` → Folder: `/ (root)`

### 2. Stream

- **Android**: Open `sender.html` → tap **▶ Start Stream** → allow camera
- **Desktop**: Open `viewer.html` → stream appears automatically

That's it. No server setup needed.

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
├── style.css               # UI theme
└── docs/
    └── architecture.md     # WebRTC flow, milestone roadmap
```

---

## Configuration

To avoid peer ID conflicts with other deployments, edit `app.js`:

```js
SENDER_PEER_ID: "your-unique-site-cam-id",
```

---

## Requirements

- **Sender**: Android Chrome (or any browser with `getUserMedia`)
- **Viewer**: Any modern desktop browser
- **Server**: None — PeerJS free cloud handles signaling

## Milestones

- ✅ M1 — Browser-to-browser streaming (current)
- 🔜 M2 — GPS + compass metadata overlay
- 🔜 M3 — Visual marker anchoring (AR.js)
- 🔜 M4 — 3D overlay on viewer (Three.js)
- 🔜 M5 — Multiset WebXR VPS integration
- 🔜 M6 — Site scan import + BIM overlay
- 🔜 M7 — Full construction platform
