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
  // Hardcoded for now — will move back to workflow injection once confirmed working
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
  // turnServers populated by GitHub Actions workflow from TURN_SERVERS secret.
  NETWORK: {
    turnServers:  [],
    providerName: "Metered.ca",
    timeouts:     { local: 8000, relay: 15000 },
  },

  // ── GPS / Location Module (M2) ───────────────────────────────────────────────
  GPS: {
    updateInterval:    3000,
    highAccuracyDelay: 5000,
    lowPassAlpha:      0.08,
    deadbandDegrees:   5,
    watchTimeout:      10000,
    watchMaxAge:       1000,
  },

  // ── Marker Detection (M3) ─────────────────────────────────────────────────────
  MARKERS: {
    scanIntervalMs: 200,
    canvasScale:    0.5,

    // Custom labels per QR code content
    labels: {
      "SITE-CAM-NORTH":  "North Camera Position",
      "SITE-CAM-SOUTH":  "South Camera Position",
      "SITE-ANCHOR-001": "BIM Anchor Point 001",
      "SITE-COL-A1":     "Column A1 — Grid Ref 1.1",
      "SITE-COL-A2":     "Column A2 — Grid Ref 1.2",
      "SITE-BEAM-B1":    "Beam B1 — Level 2",
    },

    defaultLabel: "Unknown Marker",
  },

  // ── Reconnect Backoff ────────────────────────────────────────────────────────
  RECONNECT_MIN: 2000,
  RECONNECT_MAX: 30000,
};
