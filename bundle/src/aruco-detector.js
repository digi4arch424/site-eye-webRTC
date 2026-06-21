/**
 * aruco-detector.js — Phase 1 Track 1
 *
 * Wraps js-aruco2 to detect ArUco markers in a live video stream.
 * Works by drawing each video frame onto an offscreen canvas and running
 * the detector on the resulting ImageData.
 *
 * Exposed on window.ArucoDetector by src/main.js.
 *
 * Usage (from markers.js):
 *   const det = new window.ArucoDetector();
 *   // In a rAF / setInterval loop:
 *   const markers = det.detect(videoElement);
 *   // markers = [{ id: 42, corners: [{x,y}×4], center: {x,y} }, ...]
 *
 * @see https://github.com/damianofalcioni/js-aruco2
 *
 * ── Import strategy (verified against the real published package) ──────────
 * js-aruco2@2.0.0 does NOT use `module.exports` or ES `export`. Both
 * src/cv.js and src/aruco.js do `this.X = X` at the top level — code
 * written for either a Node `require()` context or a raw browser
 * <script> tag, where top-level `this` resolves to the global object.
 *
 * Neither a raw <script> tag (no require() shim — throws "require is not
 * defined") nor a standard Vite/Rollup ES import (CJS interop wraps the
 * factory but aruco.js's own internal fallback —
 * `var CV = this.CV || require('./cv').CV` — evaluates to undefined
 * regardless of import order, due to how the library's own requireCv()
 * helper returns its placeholder object instead of the populated one)
 * works correctly. Both failure modes were reproduced and confirmed by
 * building this package through Vite and executing the compiled output.
 *
 * The fix: load both files as raw text (Vite's `?raw` suffix) and execute
 * them ourselves via `new Function(src).call(globalThis)`, in cv.js-then-
 * aruco.js order. This exactly replicates the <script>-tag execution model
 * the library was written for — `this` is explicitly globalThis, and
 * because globalThis.CV is set before aruco.js runs, its internal
 * `require('./cv')` fallback is never reached (short-circuited by `||`).
 */

// Raw source text, bundled as strings by Vite — not executed by import itself.
import cvSource    from 'js-aruco2/src/cv.js?raw';
import arucoSource from 'js-aruco2/src/aruco.js?raw';

/**
 * Execute the two CJS-style sources once, in dependency order, with `this`
 * bound to globalThis — matching the library's own expected environment.
 * Idempotent: safe to call from multiple ArucoDetector instances.
 */
let _arucoLoaded = false;
function _ensureArucoLibraryLoaded() {
  if (_arucoLoaded) return;
  // cv.js first — populates globalThis.CV before aruco.js needs it.
  new Function(cvSource).call(globalThis);
  // aruco.js — its internal `this.CV || require('./cv').CV` now finds
  // globalThis.CV already set and never reaches the broken require() path.
  new Function(arucoSource).call(globalThis);
  _arucoLoaded = true;
}

/** Minimum pixel area of a valid marker quad (filters out noise at small scales) */
const MIN_MARKER_AREA = 200;

export class ArucoDetector {
  constructor() {
    _ensureArucoLibraryLoaded();

    // AR is populated on globalThis by _ensureArucoLibraryLoaded() above.
    const AR = globalThis.AR;
    if (!AR || typeof AR.Detector !== 'function') {
      throw new Error(
        '[ArucoDetector] globalThis.AR.Detector is not available after ' +
        'loading js-aruco2 — the library source may have changed shape.'
      );
    }

    /** @type {AR.Detector} */
    this._detector = new AR.Detector();

    /** Offscreen canvas — reused every frame to avoid allocations */
    this._canvas = document.createElement('canvas');
    this._ctx    = this._canvas.getContext('2d', { willReadFrequently: true });

    /** @type {Array<{id:number, corners:Array<{x:number,y:number}>, center:{x:number,y:number}}>} */
    this._lastMarkers = [];
  }

  // ─────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────

  /**
   * Detect ArUco markers in the current video frame.
   *
   * @param {HTMLVideoElement} video  — must be playing with videoWidth/videoHeight set
   * @returns {Array<{id:number, corners:Array<{x:number,y:number}>, center:{x:number,y:number}}>}
   */
  detect(video) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      return this._lastMarkers;
    }

    // Resize offscreen canvas to match actual frame — cheap if dimensions unchanged
    if (this._canvas.width !== w || this._canvas.height !== h) {
      this._canvas.width  = w;
      this._canvas.height = h;
    }

    this._ctx.drawImage(video, 0, 0, w, h);
    const imageData = this._ctx.getImageData(0, 0, w, h);

    let raw;
    try {
      raw = this._detector.detect(imageData);
    } catch (err) {
      console.warn('[ArucoDetector] Detection error:', err);
      return this._lastMarkers;
    }

    this._lastMarkers = raw
      .filter(m => this._quadArea(m.corners) >= MIN_MARKER_AREA)
      .map(m => ({
        id:      m.id,
        corners: m.corners.map(c => ({ x: c.x, y: c.y })),
        center:  this._centroid(m.corners),
      }));

    return this._lastMarkers;
  }

  /**
   * Return the most recent detection result without re-running detection.
   * Useful when you want the data channel payload between detect() calls.
   * @returns {Array}
   */
  getLastMarkers() {
    return this._lastMarkers;
  }

  /** Release canvas resources. Call when the sender stops capture. */
  destroy() {
    this._canvas = null;
    this._ctx    = null;
    this._lastMarkers = [];
  }

  // ─────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────

  /**
   * Shoelace formula — area of a quad defined by four corners.
   * Used to filter out tiny false-positive detections.
   * @param {Array<{x:number,y:number}>} corners  — must have exactly 4 points
   * @returns {number}  pixel area
   */
  _quadArea(corners) {
    let area = 0;
    const n  = corners.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Centroid of a polygon (mean of vertices).
   * @param {Array<{x:number,y:number}>} pts
   * @returns {{x:number,y:number}}
   */
  _centroid(pts) {
    const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }
}
