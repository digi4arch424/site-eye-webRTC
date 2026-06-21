/**
 * src/main.js — Vite bundle entry point
 *
 * This file is the single entry point for the IIFE bundle built by Vite.
 * It imports every Phase 1 module and exposes them on window.* so that
 * the existing vanilla JS files (location.js, markers.js, etc.) can
 * reference them without any import statements.
 *
 * The bundle is output to bundle/dist/bundle.js and must be loaded FIRST
 * in every HTML file that uses these classes:
 *
 *   <script src="bundle/dist/bundle.js"></script>   ← before all other scripts
 *   <script src="location.js"></script>
 *   <script src="markers.js"></script>
 *
 * ─── Adding new modules ───────────────────────────────────────────────────
 * 1. Create src/your-module.js
 * 2. Import it here
 * 3. Assign it to window.YourClass = YourClass
 * 4. Run npm run build
 * No other file needs to change.
 *
 * ─── Phase timeline ──────────────────────────────────────────────────────
 * Phase 1 (now):  ArucoDetector, OrientationTracker, VPS factory
 * Phase 2:        Three.js scene helpers, BIM loader (when added)
 * Phase 3:        Recording helpers (when added)
 */

// ── Phase 1 imports ───────────────────────────────────────────────────────────

import { ArucoDetector }                   from './aruco-detector.js';
import { OrientationTracker }              from './orientation.js';
import { createVPSProvider, checkVPSSupport } from './vps-config.js';

// ── Window global exports ─────────────────────────────────────────────────────
//
// These assignments run immediately when dist/bundle.js is parsed,
// so by the time the browser reaches <script src="location.js">, all
// of the following are available on window.

window.ArucoDetector      = ArucoDetector;
window.OrientationTracker = OrientationTracker;
window.createVPSProvider  = createVPSProvider;   // Track 4: VPS provider factory
window.checkVPSSupport    = checkVPSSupport;     // Track 4: VPS capability check

// ── Readiness signal ─────────────────────────────────────────────────────────
//
// Other scripts can guard their init with:
//   document.addEventListener('bim:bundle:ready', () => { ... });
//
// The event fires synchronously at this point since the bundle is loaded
// before DOMContentLoaded. Listening code that runs after DOMContentLoaded
// will always see it as already fired via the flag below.

window._bimBundleReady = true;
document.dispatchEvent(new CustomEvent('bim:bundle:ready', { bubbles: false }));

console.log(
  '[BIM Bundle] Ready — ArucoDetector, OrientationTracker, VPS factory loaded'
);
