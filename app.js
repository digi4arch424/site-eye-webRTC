/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — M1 (Raw WebRTC API)
 *
 * Networking:
 * - Signaling: SignalingClient (webrtc-network-modules/signaling.js)
 * - ICE/Media: Module A/B/C (webrtc-network-modules)
 * - No PeerJS
 *
 * To add Metered.ca TURN credentials:
 * 1. Sign up at https://dashboard.metered.ca (free, 500MB/month)
 * 2. Create app → TURN Credentials → copy ICE servers array
 * 3. Replace the empty turnServers array in NETWORK below
 */

const CONFIG = {
  // ── Session / Camera ─────────────────────────────────────────────────────────
  SESSION_ID: "site-cam-001",   // unique per camera — also used as signaling session
  CAMERA_ID:  "site-cam-001",
  SITE_ID:    "site-alpha",

  // ── Signaling Server ─────────────────────────────────────────────────────────
  // Replace with your webrtc-signaling-server Render.com URL
  SIGNALING_URL: "https://webrtc-signaling-server-nxsu.onrender.com",

  // ── Camera Constraints ───────────────────────────────────────────────────────
  CAMERA_CONSTRAINTS: {
    video: {
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
      frameRate:  { ideal: 15, max: 30 },
      facingMode: "environment",
    },
    audio: false,
  },

  // ── Network Module Configuration ─────────────────────────────────────────────
  NETWORK: {
    turnServers:  [],   // ← add Metered.ca credentials here for cross-network
    providerName: "None (add Metered.ca for cross-network)",
    timeouts:     { local: 8000, relay: 15000 },
  },

  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};

// ── Initialise Module A ───────────────────────────────────────────────────────
function initNetworkModules(role, onStateChange) {
  ModuleA.configure({
    ...CONFIG.NETWORK,
    onStateChange: (state, mode) => {
      const el = document.getElementById("network-mode-indicator");
      if (el) {
        const labels = {
          idle:          { text: "—",            color: "#3d4a55" },
          local_attempt: { text: "Local P2P…",   color: "#f59e0b" },
          relay_attempt: { text: "TURN Relay…",  color: "#f59e0b" },
          connected:     { text: mode === "relay" ? "Relay ✓" : "Local P2P ✓", color: "#22c55e" },
          failed:        { text: "Failed",        color: "#ef4444" },
        };
        const label = labels[state] || { text: state, color: "#3d4a55" };
        el.textContent = label.text;
        el.style.color = label.color;
      }
      if (onStateChange) onStateChange(state, mode);
    },
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setStatus(elementId, text, state = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `status status--${state}`;
}

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
}

function createBackoff(min = CONFIG.RECONNECT_MIN, max = CONFIG.RECONNECT_MAX) {
  let delay = min;
  return {
    next()  { const c = delay; delay = Math.min(delay * 1.5, max); return c; },
    reset() { delay = min; },
  };
}
