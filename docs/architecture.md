# Construction Camera System — Architecture

## Overview

```
Android Chrome (sender.html)
        │
        │  PeerJS (signaling only)
        ▼
peerjs-signaling-server (Render.com)
https://github.com/digi4arch424/peerjs-signaling-server
        │
        │  PeerJS (signaling only)
        ▼
Desktop Browser (viewer.html)
        │
        └──── WebRTC P2P stream (direct after handshake) ────┘
```

The signaling server only brokers the initial WebRTC handshake.
Once connected, video flows directly between devices (P2P).

---

## WebRTC Connection Flow

```
SENDER                     PEERJS SERVER                 VIEWER
  │                               │                        │
  │── register(sender-id) ───────►│                        │
  │                               │◄─ register(viewer-id) ─│
  │                               │                        │
  │◄─── incoming call ────────────│◄─── call(sender-id) ───│
  │                               │                        │
  │  [getUserMedia()]             │                        │
  │  [call.answer(stream)]        │                        │
  │── SDP answer ────────────────►│── SDP answer ─────────►│
  │                               │                        │
  │◄─ ICE candidates ─────────────│◄─ ICE candidates ───────│
  │── ICE candidates ────────────►│── ICE candidates ──────►│
  │                               │                        │
  │◄══════════════════════ WebRTC P2P stream ══════════════►│
```

---

## File Structure

```
construction-cam/           ← GitHub Pages (this repo)
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

peerjs-signaling-server/    ← Render.com (separate repo)
├── server.js               # Express + PeerJS multi-path server
└── package.json
```

---

## ICE Server Stack (ice.js)

```
1. Direct P2P              — no server, fastest
2. STUN (Google + Metered) — discovers public IP
3. TURN UDP port 80        — relays video, most networks
4. TURN TCP port 80        — bypasses UDP-blocking firewalls
5. TURN TLS port 443       — bypasses corporate firewalls
6. TURNS TLS TCP port 443  — last resort, most restrictive networks
```

Provider: Open Relay Project (Metered free tier, no API key required)

---

## Signaling Message Flow (PeerJS)

PeerJS abstracts WebSocket signaling internally.
Key peer IDs:

```js
SENDER_PEER_ID: "construction-cam-sender-001"  // fixed, registered by sender
VIEWER_PEER_ID: random UUID                     // assigned by PeerJS to viewer
```

Viewer calls sender → sender answers with stream → P2P established.

---

## Debug Panel (debug.js)

Drop-in module. Remove `<script src="debug.js">` to disable in production.

Log types: `error`, `warn`, `success`, `ice`, `network`, `ai`, `info`

Future modules write to debug panel via:
```js
window.debugLog("Multiset VPS position locked", "ai")
```

---

## Milestone Roadmap

| Milestone | Status | Description |
|---|---|---|
| M1 | ✅ Done | Browser-to-browser WebRTC streaming |
| M2 | 🔜 | GPS + compass metadata overlay |
| M3 | 🔜 | Visual marker anchoring (AR.js) |
| M4 | 🔜 | 3D overlay on viewer (Three.js) |
| M5 | 🔜 | Multiset WebXR VPS integration |
| M6 | 🔜 | Site scan import + BIM overlay |
| M7 | 🔜 | Full construction platform |

---

## Future Scaling Notes

| Need | Change |
|---|---|
| Multiple cameras | Add new `SENDER_PEER_ID` per camera in `app.js` |
| Multiple viewers | PeerJS handles multiple callers natively |
| New app on signaling server | Add path to `PEER_PATHS` env var on Render |
| Authentication | Add JWT check in `peerjs-signaling-server/server.js` |
| Recording | Add `MediaRecorder` in `sender.js` |
| AI overlay | Add canvas overlay on `remoteVideo` in `viewer.js` |
| BIM | Align Three.js scene to video in viewer (M6) |
| Multiset VPS | Replace GPS in M2 with 6-DoF pose from Multiset SDK (M5) |
