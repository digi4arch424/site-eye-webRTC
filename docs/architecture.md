# Construction Camera System — Architecture

## Overview

```
Android Chrome (sender.html)
        │
        │  WebSocket (signaling)
        ▼
   VPS Node.js  ←── WebSocket ──→  Desktop Browser (viewer.html)
   (server.js)
        │
        │  WebRTC (direct P2P after signaling)
        └──────────────────────────────────────┘
```

The signaling server is only needed to exchange WebRTC session descriptions (SDP) and ICE candidates. Once the peer connection is established, video flows **directly** between peers (P2P) without passing through the VPS.

---

## WebRTC Connection Flow

```
SENDER                     SIGNALING SERVER              VIEWER
  │                               │                        │
  │── register(role:sender) ─────►│                        │
  │                               │◄─ register(role:viewer)─│
  │                               │                        │
  │◄─── viewer-ready ─────────────│                        │
  │                               │                        │
  │  [createOffer()]              │                        │
  │── offer(SDP) ────────────────►│── offer(SDP) ─────────►│
  │                               │                        │
  │                               │   [createAnswer()]     │
  │◄─ answer(SDP) ────────────────│◄─ answer(SDP) ─────────│
  │                               │                        │
  │── ice-candidate ─────────────►│── ice-candidate ───────►│
  │◄─ ice-candidate ──────────────│◄─ ice-candidate ────────│
  │                               │                        │
  │◄═══════════════════════ WebRTC P2P stream ═════════════►│
```

---

## File Structure

```
construction-cam/
├── frontend/           # Static files — deploy to GitHub Pages
│   ├── sender.html     # Android camera sender page
│   ├── viewer.html     # Desktop viewer page
│   ├── app.js          # Shared config, utilities, message helpers
│   ├── sender.js       # Sender WebRTC + WebSocket logic
│   ├── viewer.js       # Viewer WebRTC + WebSocket logic
│   └── style.css       # Shared industrial UI theme
│
├── signaling-server/   # Deploy to VPS
│   ├── server.js       # WebSocket signaling relay
│   └── package.json
│
└── docs/
    └── architecture.md  # This file
```

---

## Signaling Message Format

All messages use JSON with a common envelope:

```json
{
  "type": "offer | answer | ice-candidate | register | viewer-ready | sender-ready | sender-disconnected",
  "payload": {},
  "cameraId": "site-cam-001",
  "siteId": "site-alpha",
  "timestamp": 1712345678000
}
```

The `cameraId`, `siteId`, and `timestamp` fields are included in all messages now (even when unused) to support future filtering, routing, and analytics without breaking changes.

---

## Camera Constraints

```js
{
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 15, max: 30 },
    facingMode: "environment"   // rear camera on mobile
  },
  audio: false
}
```

---

## ICE / STUN Configuration

MVP uses Google's public STUN servers only. This works when sender and viewer are on different public IPs with no symmetric NAT.

```js
iceServers: [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
]
```

**When to add a TURN server:** If streaming fails on certain networks (corporate, carrier-grade NAT), add a TURN relay:
```js
{ urls: "turn:YOUR_TURN_SERVER", username: "user", credential: "pass" }
```

---

## Reconnection Strategy

- **WebSocket**: Exponential backoff, 2s → 30s max
- **WebRTC**: Sender re-creates offer on `failed` or `disconnected` state
- **Viewer**: Re-registers on WebSocket reconnect; waits for new offer

---

## Future Module Structure

The codebase is intentionally flat and modular. Future additions slot in without refactoring:

```
construction-cam/
├── frontend/
│   ├── modules/
│   │   ├── tracking/     # AI object/person tracking overlay
│   │   ├── bim/          # BIM model overlay (Three.js)
│   │   ├── recording/    # MediaRecorder-based clip capture
│   │   └── analytics/    # Frame analysis, heatmaps
│   └── ...
├── signaling-server/
│   └── ...              # Add room management, auth here
```

**Extension points already in place:**
- `cameraId` / `siteId` in every message → multi-camera routing ready
- `timestamp` in every message → analytics / sync ready
- Modular JS files → drop in new `<script>` tags without touching core

---

## Scaling Notes

| Stage | Change |
|---|---|
| Multi-camera | Signaling server already keys sessions by `cameraId` |
| Authentication | Add JWT check in `ws.on('connection')` before relaying |
| Recording | Add `MediaRecorder` in `sender.js`, stream to S3/object store |
| AI overlay | Add canvas overlay on `remoteVideo` in viewer; run model per frame |
| BIM | Align Three.js scene to video perspective in viewer |
| Multiple viewers | Change session from `{sender, viewer}` to `{sender, viewers: Set}` |

---

## VPS Requirements

- Ubuntu 20.04+ (or any Linux)
- Node.js ≥ 18
- Open port 8080 TCP inbound
- 512MB RAM is sufficient for MVP
