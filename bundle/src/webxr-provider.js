/**
 * WebXRProvider — Phase 1 VPS implementation.
 *
 * Uses the WebXR Device API backed by ARCore (Android Chrome) or ARKit (iOS Safari).
 * Provides relative 6-DoF — position and orientation relative to the session origin.
 * No API key, no external dependency: works on GitHub Pages over HTTPS today.
 *
 * Swap this for MultisetProvider in Phase 2 when absolute georeferenced
 * positioning is needed for persistent BIM anchor placement.
 *
 * Requirements:
 *   - HTTPS (GitHub Pages satisfies this)
 *   - navigator.xr present (Android Chrome or iOS Safari 15.4+)
 *   - init() called from a user gesture (button click)
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API
 */

import { VPSProvider } from './vps-provider.js';

/** Degrees-per-radian conversion */
const RAD = 180 / Math.PI;

/** How stale a pose can be (ms) before getPose() returns null */
const POSE_STALE_MS = 200;

export class WebXRProvider extends VPSProvider {
  constructor() {
    super();
    /** @type {XRSession|null} */
    this._session = null;
    /** @type {XRReferenceSpace|null} */
    this._refSpace = null;
    /** @type {import('./vps-provider.js').VPSPose|null} */
    this._lastPose = null;
    /** @type {Map<string, {name:string, pose:import('./vps-provider.js').VPSPose}>} */
    this._anchors = new Map();
    this._raf = null;
    this._running = false;
  }

  // ─────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────

  /**
   * Start a WebXR immersive-ar session.
   * Must be called from a user gesture handler.
   * @throws if WebXR is unavailable or the device does not support AR
   */
  async init() {
    if (!navigator.xr) {
      throw new Error(
        'WebXR not available. Ensure the page is served over HTTPS and the ' +
        'device supports ARCore (Android Chrome) or ARKit (iOS Safari 15.4+).'
      );
    }

    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      throw new Error(
        'immersive-ar session not supported on this device. ' +
        'ARCore or ARKit integration is required for WebXRProvider.'
      );
    }

    this._session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['anchors', 'hit-test'],
    });

    this._refSpace = await this._session.requestReferenceSpace('local-floor');

    this._session.addEventListener('end', () => {
      this._running = false;
      this._session = null;
    });

    this._running = true;
    this._session.requestAnimationFrame((t, f) => this._tick(t, f));

    console.log('[WebXRProvider] AR session started');
  }

  /**
   * Return the most recent pose captured from the XR frame loop.
   * Returns null if not yet initialised or if the last pose is stale.
   * @returns {Promise<import('./vps-provider.js').VPSPose|null>}
   */
  async getPose() {
    if (!this._lastPose) return null;
    if (performance.now() - this._lastPose.timestamp > POSE_STALE_MS) return null;
    return this._lastPose;
  }

  /**
   * Register a named spatial anchor in memory.
   * In Phase 1 anchors are not persistent — they exist only for this session.
   * The MultisetProvider in Phase 2 will persist them via the MapSet API.
   * @param {string} name
   * @param {import('./vps-provider.js').VPSPose} pose
   * @returns {Promise<string>} anchor ID
   */
  async registerAnchor(name, pose) {
    const id = `webxr-anchor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this._anchors.set(id, { name, pose });
    console.log(`[WebXRProvider] Anchor registered locally: ${name} → ${id}`);
    return id;
  }

  /** End the XR session and clean up. */
  destroy() {
    this._running = false;
    if (this._session) {
      this._session.end().catch(() => {});
      this._session = null;
    }
    this._lastPose = null;
    this._anchors.clear();
    console.log('[WebXRProvider] Session destroyed');
  }

  // ─────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────

  /**
   * XRSession frame callback — runs every display frame (~60 fps).
   * Extracts position + orientation from XRViewerPose and converts
   * the orientation quaternion to Euler angles for the data channel.
   * @param {number}   _time  DOMHighResTimeStamp (unused; we use performance.now())
   * @param {XRFrame}  frame
   */
  _tick(_time, frame) {
    if (!this._running) return;

    try {
      const viewerPose = frame.getViewerPose(this._refSpace);
      if (viewerPose) {
        const { x, y, z }      = viewerPose.transform.position;
        const q                 = viewerPose.transform.orientation;

        // Quaternion → Euler (ZYX convention, degrees)
        const yaw   = Math.atan2(2 * (q.w * q.y - q.z * q.x),
                                 1 - 2 * (q.y * q.y + q.x * q.x)) * RAD;
        const pitch = Math.asin (Math.max(-1, Math.min(1,
                                 2 * (q.w * q.x + q.y * q.z))))    * RAD;
        const roll  = Math.atan2(2 * (q.w * q.z - q.x * q.y),
                                 1 - 2 * (q.x * q.x + q.z * q.z)) * RAD;

        this._lastPose = {
          position:    { x, y, z },
          orientation: { yaw, pitch, roll },
          confidence:  0.85,  // WebXR doesn't expose localisation confidence; use fixed value
          timestamp:   performance.now(),
        };
      }
    } catch (err) {
      console.warn('[WebXRProvider] Frame error:', err);
    }

    // Re-queue next frame
    this._session?.requestAnimationFrame((t, f) => this._tick(t, f));
  }
}
