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
    turnServers:  "%%TURN_SERVERS%%",
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
    confidenceMin:    0.7,    // minimum confidence to report a marker

    // ArUco dictionary — "ARUCO" or "ARUCO_MIP_36h12"
    arucoDictionary:  "ARUCO_MIP_36h12",

    // Custom labels per marker ID
    // Key: marker ID string (QR code content or ArUco numeric ID as string)
    // Value: human-readable label shown on overlay
    // Add your site markers here
    labels: {
      // ArUco examples
      "0":   "Column A1 — Grid Ref 1.1",
      "1":   "Column A2 — Grid Ref 1.2",
      "2":   "Column B1 — Grid Ref 2.1",
      "3":   "Beam B2 — Level 2",
      // QR code examples (use QR content as key)
      "SITE-CAM-NORTH":  "North Camera Position",
      "SITE-CAM-SOUTH":  "South Camera Position",
      "SITE-ANCHOR-001": "BIM Anchor Point 001",
    },

    // Default label for unknown markers
    defaultLabel: "Unknown Marker",
  },
