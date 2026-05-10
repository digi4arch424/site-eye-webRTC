/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — M1
 *
 * PEER_SERVER: points to your deployed peerjs-signaling-server on Render.com
 * See https://github.com/digi4arch424/peerjs-signaling-server
 * Update host after deploying to Render.
 *
 * ICE configuration is in ice.js.
 */

const CONFIG = {
  SENDER_PEER_ID: "construction-cam-sender-001",

  CAMERA_ID: "site-cam-001",
  SITE_ID:   "site-alpha",

  // ── Dedicated PeerJS signaling server (Render.com) ──────────────────────────
  // Replace host with your Render URL after deploying peerjs-signaling-server.
  // e.g. "peerjs-signaling-server.onrender.com"
  PEER_SERVER: {
    host:   "peerjs-signaling-server-denf.onrender.com",
    port:   443,
    path:   "/construction-cam",
    secure: true,
    debug:  1,
  },

  CAMERA_CONSTRAINTS: {
    video: {
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
      frameRate:  { ideal: 15, max: 30 },
      facingMode: "environment",
    },
    audio: false,
  },

  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};

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
