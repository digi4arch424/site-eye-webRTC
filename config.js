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
  SIGNALING_URL: "wss://YOUR-SIGNALING-SERVER.onrender.com",

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
    turnServers:  [],
    providerName: "None — add Metered.ca for cross-network",
    timeouts:     { local: 8000, relay: 15000 },
  },

  // ── GPS / Location Module (M2) ───────────────────────────────────────────────
  GPS: {
    updateInterval:      3000,   // ms between location data transmissions (was 2000)
    highAccuracyDelay:   5000,   // ms before upgrading from fast to precise GPS fix
    lowPassAlpha:        0.08,   // heading smoothing factor — slower, smoother (was 0.15)
    deadbandDegrees:     5,      // minimum heading change (°) before display updates (was 2)
    watchTimeout:        10000,  // ms before GPS watch reports error
    watchMaxAge:         1000,   // ms — max age of cached GPS position
  },

  // ── Reconnect Backoff ────────────────────────────────────────────────────────
  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};
