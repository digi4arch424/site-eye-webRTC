/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — M1
 *
 * PEER_SERVER: points to your dedicated PeerJS server on Render.com
 * Update host after deploying peerjs-server/ to Render.
 *
 * ICE configuration is in ice.js.
 */

const CONFIG = {
  SENDER_PEER_ID: "construction-cam-sender-001",

  CAMERA_ID: "site-cam-001",
  SITE_ID:   "site-alpha",

  // ── Dedicated PeerJS server (Render.com) ────────────────────────────────────
  // Replace host with your Render URL after deploying peerjs-server/
  // e.g. "construction-cam-peer.onrender.com"
  PEER_SERVER: {
    host:   "YOUR-APP-NAME.onrender.com",  // ← update this
    port:   443,
    path:   "/construction-cam",
    secure: true,                           // wss:// (required for HTTPS pages)
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
