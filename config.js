/**
 * config.js — Application Configuration
 * Construction Camera System
 *
 * Single source of truth for all configuration.
 * No logic, no DOM, no dependencies.
 * Loaded first — before any other script.
 */

const CONFIG = {
  // ── Session / Camera ─────────────────────────────────────────────────────────
  SESSION_ID: "site-cam-001",
  CAMERA_ID:  "site-cam-001",
  SITE_ID:    "site-alpha",

  // ── Signaling Server ─────────────────────────────────────────────────────────
  // Replace with your webrtc-signaling-server Render.com URL after deploy
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
  // turnServers: add Metered.ca credentials here for cross-network streaming
  // Sign up free at https://dashboard.metered.ca (500MB/month free)
  NETWORK: {
    turnServers:  [
    { urls: "stun:standard.relay.metered.ca:80" },
    { urls: "turn:standard.relay.metered.ca:80", username: "acc4f2d3ac7a6fa46d774d43", credential: "8P6jfV/svaMof35G" },
    { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: "acc4f2d3ac7a6fa46d774d43", credential: "8P6jfV/svaMof35G" },
    { urls: "turn:standard.relay.metered.ca:443", username: "acc4f2d3ac7a6fa46d774d43", credential: "8P6jfV/svaMof35G" },
    { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: "acc4f2d3ac7a6fa46d774d43", credential: "8P6jfV/svaMof35G" },
  ],
    providerName: "Metered.ca",
    timeouts:     { local: 8000, relay: 15000 },
  },

  // ── Reconnect Backoff ────────────────────────────────────────────────────────
  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};
