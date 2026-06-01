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
  // Injected by GitHub Actions workflow from SIGNALING_URL secret.
  // For local development: replace %%SIGNALING_URL%% with your server URL.
  SIGNALING_URL: "%%SIGNALING_URL%%",

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
  // turnServers injected by GitHub Actions workflow from TURN_SERVERS secret.
  // For local development: replace %%TURN_SERVERS%% with your Metered.ca array.
  // See .env.example for the expected format.
  NETWORK: {
    turnServers:  [],   // populated by GitHub Actions workflow from TURN_SERVERS secret
    providerName: "Metered.ca",
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


  // ── Marker Detection (M3) ─────────────────────────────────────────────────────
  MARKERS: {
    // Detection settings
    scanIntervalMs:   200,    // ms between frame scans (5fps detection — low CPU)
    canvasScale:      0.5,    // scale frame before scanning (0.5 = half res, faster)

    // ── M3: QR code detection only (jsQR) ────────────────────────────────────
    // ArUco marker detection added at M5 when Vite build system is introduced
    // and js-aruco2 can be properly bundled as an npm package.

    // Custom labels per QR code content
    // Key: exact QR code string content
    // Value: human-readable label shown on viewer overlay
    labels: {
      "SITE-CAM-NORTH":  "North Camera Position",
      "SITE-CAM-SOUTH":  "South Camera Position",
      "SITE-ANCHOR-001": "BIM Anchor Point 001",
      "SITE-COL-A1":     "Column A1 — Grid Ref 1.1",
      "SITE-COL-A2":     "Column A2 — Grid Ref 1.2",
      "SITE-BEAM-B1":    "Beam B1 — Level 2",
    },

    // Default label for unregistered QR codes
    defaultLabel: "Unknown Marker",
  },
