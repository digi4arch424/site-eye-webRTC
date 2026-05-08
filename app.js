/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — MVP
 */

// ─── Configuration ────────────────────────────────────────────────────────────
// Edit SIGNALING_SERVER_URL before deploying.
// For local testing use: ws://localhost:8080
// For production use:    ws://YOUR_VPS_IP:8080
const CONFIG = {
  SIGNALING_SERVER_URL: "ws://YOUR_VPS_IP:8080",

  CAMERA_ID: "site-cam-001",
  SITE_ID: "site-alpha",

  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  CAMERA_CONSTRAINTS: {
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 15, max: 30 },
      facingMode: "environment",
    },
    audio: false,
  },

  // WebSocket reconnect backoff (ms)
  WS_RECONNECT_MIN: 2000,
  WS_RECONNECT_MAX: 30000,
};

// ─── Message Helpers ───────────────────────────────────────────────────────────
function buildMessage(type, payload = {}) {
  return {
    type,
    payload,
    cameraId: CONFIG.CAMERA_ID,
    siteId: CONFIG.SITE_ID,
    timestamp: Date.now(),
  };
}

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
function createBackoff(min = CONFIG.WS_RECONNECT_MIN, max = CONFIG.WS_RECONNECT_MAX) {
  let delay = min;
  return {
    next() {
      const current = delay;
      delay = Math.min(delay * 1.5, max);
      return current;
    },
    reset() {
      delay = min;
    },
  };
}
