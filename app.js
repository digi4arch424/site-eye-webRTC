/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — M1 (PeerJS, no server required)
 */

// ─── Configuration ────────────────────────────────────────────────────────────
// PeerJS free cloud server is used by default — no setup needed.
// SENDER_PEER_ID: the fixed ID the sender registers under.
// Viewer connects to this ID to receive the stream.
const CONFIG = {
  // Fixed peer ID for the sender — viewer connects to this.
  // Change this to something unique for your site to avoid conflicts.
  SENDER_PEER_ID: "construction-cam-sender-001",

  CAMERA_ID: "site-cam-001",
  SITE_ID:   "site-alpha",

  CAMERA_CONSTRAINTS: {
    video: {
      width:      { ideal: 1280 },
      height:     { ideal: 720 },
      frameRate:  { ideal: 15, max: 30 },
      facingMode: "environment",
    },
    audio: false,
  },

  // Reconnect backoff (ms)
  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};

// ─── Status Display ────────────────────────────────────────────────────────────
function setStatus(elementId, text, state = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `status status--${state}`;
}

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(...args) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}]`, ...args);
}

// ─── Exponential Backoff ──────────────────────────────────────────────────────
function createBackoff(min = CONFIG.RECONNECT_MIN, max = CONFIG.RECONNECT_MAX) {
  let delay = min;
  return {
    next()  { const c = delay; delay = Math.min(delay * 1.5, max); return c; },
    reset() { delay = min; },
  };
}
