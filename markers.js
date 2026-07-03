/**
 * markers.js
 *
 * Detects visual markers in the live camera feed and broadcasts
 * results to the viewer over the WebRTC data channel.
 *
 * ── Phase history ─────────────────────────────────────────────────────
 *
 * Phase 0 (M3):  QR code detection via jsQR
 * Phase 1 T1:    ArUco marker detection via ArucoDetector (Vite bundle)
 * Phase 1 T2:    ArUco markers + data channel expansion
 *
 * ── Dependencies ──────────────────────────────────────────────────────
 *
 * window.jsQR                  — Phase 0, loaded via CDN in sender.html
 * window.ArucoDetector         — Phase 1, from dist/bundle.js
 * sendDataChannel(payload)     — Phase 0 WebRTC global
 *
 * ── Public interface ──────────────────────────────────────────────────
 *
 *   markerDetector.start(videoEl)  — begin detection on given video
 *   markerDetector.stop()          — stop all detection + release resources
 *
 * window.markerDetector is assigned at the bottom of this file.
 */

/* global jsQR, sendDataChannel */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detection interval in ms.
 * 150 ms ≈ 6–7 Hz — balances marker responsiveness against CPU/battery load.
 * Lower values (e.g. 100 ms) increase responsiveness at higher CPU cost.
 */
const DETECT_INTERVAL_MS = 150;

/**
 * Minimum ms between repeated sends of the same QR code.
 * Prevents the data channel from being flooded when a QR is held in frame.
 */
const QR_DEDUP_MS = 1500;


// ─────────────────────────────────────────────────────────────────────────────
// MarkerDetector
// ─────────────────────────────────────────────────────────────────────────────

class MarkerDetector {
  constructor() {
    // ── Canvas for QR detection (jsQR needs raw ImageData) ────────────────
    /** @type {HTMLCanvasElement|null} */
    this._canvas      = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._ctx         = null;
    /** @type {HTMLVideoElement|null} */
    this._video       = null;

    // ── Loop ──────────────────────────────────────────────────────────────
    this._intervalId  = null;
    this._running     = false;

    // ── Phase 0: QR dedup ──────────────────────────────────────────────────
    /** @type {string|null} Last QR string sent, for dedup */
    this._lastQRData  = null;
    /** @type {number} Timestamp of last QR send */
    this._lastQRSent  = 0;

    // ── Phase 1 T1: ArUco detector ────────────────────────────────────────
    /**
     * ArucoDetector instance — created lazily once the Vite bundle signals
     * ready via 'bim:bundle:ready'. If the bundle loaded before this script,
     * the class is available immediately.
     * @type {InstanceType<typeof ArucoDetector>|null}
     */
    this._aruco = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Begin marker detection on the given video element.
   * @param {HTMLVideoElement} videoEl  — the live camera stream (localVideo)
   */
  start(videoEl) {
    if (this._running) return;

    this._video  = videoEl;
    this._canvas = document.createElement('canvas');
    this._ctx    = this._canvas.getContext('2d', { willReadFrequently: true });

    // Phase 1 T1: initialise ArUco detector
    this._initAruco();

    this._running    = true;
    this._intervalId = setInterval(() => this._detect(), DETECT_INTERVAL_MS);

    console.log('[MarkerDetector] Started — QR (jsQR) + ArUco (Phase 1) active');
  }

  /**
   * Stop detection and release all resources.
   * Safe to call multiple times.
   */
  stop() {
    if (!this._running) return;

    clearInterval(this._intervalId);
    this._intervalId = null;
    this._running    = false;

    // Phase 1 T1: release ArucoDetector canvas
    if (this._aruco) {
      this._aruco.destroy();
      this._aruco = null;
    }

    this._canvas     = null;
    this._ctx        = null;
    this._video      = null;
    this._lastQRData = null;
    this._lastQRSent = 0;

    console.log('[MarkerDetector] Stopped.');
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 T1 — ArUco init
  // ─────────────────────────────────────────────────────────────────────────

  _initAruco() {
    if (window.ArucoDetector) {
      // Bundle already loaded — create immediately
      this._aruco = new window.ArucoDetector();
      return;
    }

    // Bundle not yet loaded — wait for the ready signal dispatched by main.js
    document.addEventListener('bim:bundle:ready', () => {
      if (this._running && !this._aruco && window.ArucoDetector) {
        this._aruco = new window.ArucoDetector();
        console.log('[MarkerDetector] ArucoDetector initialised after bundle ready');
      }
    }, { once: true });
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Detection loop
  // ─────────────────────────────────────────────────────────────────────────

  _detect() {
    if (!this._video || !this._ctx) return;

    const w = this._video.videoWidth;
    const h = this._video.videoHeight;
    if (!w || !h || this._video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;

    // Resize canvas to match actual frame dimensions
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width  = w;
      this._canvas.height = h;
    }

    // Phase 0: QR detection — needs ImageData on a canvas we control
    this._ctx.drawImage(this._video, 0, 0, w, h);
    this._detectQR(w, h);

    // Phase 1 T1+T2: ArUco detection — ArucoDetector manages its own canvas
    this._detectAruco();
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Phase 0 — QR code detection (jsQR)
  // ─────────────────────────────────────────────────────────────────────────

  _detectQR(w, h) {
    if (typeof jsQR !== 'function') return;

    let imageData;
    try {
      imageData = this._ctx.getImageData(0, 0, w, h);
    } catch (_e) {
      return; // cross-origin guard or context lost
    }

    const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });
    if (!code) return;

    const now = Date.now();

    // Dedup: suppress re-send of the same code within QR_DEDUP_MS
    if (code.data === this._lastQRData && (now - this._lastQRSent) < QR_DEDUP_MS) {
      return;
    }

    this._lastQRData = code.data;
    this._lastQRSent = now;

    console.log('[MarkerDetector] QR code:', code.data);

    if (typeof sendDataChannel !== 'function') return;
    sendDataChannel({
      type:      'qr-code',
      data:      code.data,
      corners:   {
        topLeft:     code.location.topLeftCorner,
        topRight:    code.location.topRightCorner,
        bottomRight: code.location.bottomRightCorner,
        bottomLeft:  code.location.bottomLeftCorner,
      },
      timestamp: now,
    });
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1 T1+T2 — ArUco marker detection
  // ─────────────────────────────────────────────────────────────────────────

  _detectAruco() {
    if (!this._aruco || !this._video) return;

    // ArucoDetector.detect() draws the video to its own offscreen canvas
    // internally — we pass the video element directly.
    let markers;
    try {
      markers = this._aruco.detect(this._video);
    } catch (err) {
      console.warn('[MarkerDetector] ArUco detection error:', err);
      return;
    }

    if (!markers.length) return;

    // Phase 1 T2: broadcast ArUco results on a separate message type so
    // the viewer can distinguish them from QR codes.
    if (typeof sendDataChannel !== 'function') return;
    sendDataChannel({
      type:      'aruco-markers',
      markers,            // [{ id: number, corners: [{x,y}×4], center: {x,y} }]
      timestamp: Date.now(),
    });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global singleton referenced by sender.html:
 *   markerDetector.start(localVideo)
 *   markerDetector.stop()
 */
window.markerDetector = new MarkerDetector();
