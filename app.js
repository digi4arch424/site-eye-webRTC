/**
 * app.js — Shared configuration and utilities
 * Construction Camera System — M1 (PeerJS + full ICE stack)
 *
 * ICE Strategy (tried in order by WebRTC automatically):
 * 1. Direct P2P (no server needed, fastest)
 * 2. STUN — Google + Open Relay (discovers public IP, works ~60% of time)
 * 3. TURN — Open Relay (Metered free, relays video, works on all networks)
 *
 * Signaling: PeerJS free cloud
 * TURN: openrelay.metered.ca (no API key needed, 20GB/month free)
 */

const CONFIG = {
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

  // Full ICE server stack — STUN + TURN via Open Relay (Metered free tier)
  // No API key required. Covers direct, STUN, and TURN paths.
  ICE_SERVERS: [
    // Google STUN
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Open Relay STUN (Metered free)
    { urls: "stun:openrelay.metered.ca:80" },
    // Open Relay TURN — UDP
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // Open Relay TURN — TCP (bypasses UDP-blocking firewalls)
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // Open Relay TURN — TLS port 443 (bypasses corporate firewalls)
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    // Open Relay TURNS — TLS (most restrictive networks)
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],

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
