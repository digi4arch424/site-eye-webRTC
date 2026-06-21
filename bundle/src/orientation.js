/**
 * orientation.js — Phase 1 Track 1
 *
 * Tracks device pitch, roll, and yaw via the DeviceOrientationEvent API.
 * Handles the iOS 13+ permission request (must be called from a user gesture).
 *
 * DeviceOrientationEvent axis mapping:
 *   alpha → yaw   (rotation around Z, 0–360°, true north if absolute=true)
 *   beta  → pitch (rotation around X, −180°–+180°, front/back tilt)
 *   gamma → roll  (rotation around Y, −90°–+90°, left/right tilt)
 *
 * Exposed on window.OrientationTracker by src/main.js.
 *
 * Usage (from location.js):
 *   const tracker = new window.OrientationTracker();
 *   await tracker.start();   // call from a button click handler
 *   const { pitch, roll, yaw } = tracker.getOrientation() ?? {};
 *   tracker.stop();
 *
 * Note: The existing location.js (Phase 0) listens to 'deviceorientationabsolute'
 * for compass heading. This tracker adds its own listener for pitch/roll and
 * does NOT interfere with the heading listener — multiple listeners are supported.
 */

/** How long (ms) to wait for the first orientation event before assuming no support */
const SUPPORT_TIMEOUT_MS = 2000;

export class OrientationTracker {
  constructor() {
    /** @type {{pitch:number|null, roll:number|null, yaw:number|null}|null} */
    this._orientation = null;
    /** @type {((e:DeviceOrientationEvent)=>void)|null} */
    this._handler     = null;
    this._active      = false;
    /** Resolves when the first event fires, rejects if no event within SUPPORT_TIMEOUT_MS */
    this._firstEventResolver = null;
  }

  // ─────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────

  /**
   * Request permission (iOS 13+) and start listening.
   * MUST be called from inside a user gesture handler (button click).
   *
   * @returns {Promise<void>}
   * @throws  if permission is denied or the API is unavailable
   */
  async start() {
    if (this._active) return;

    await this._requestPermission();

    this._handler = (e) => {
      this._orientation = {
        pitch: e.beta  ?? null,   // −180 to +180
        roll:  e.gamma ?? null,   // −90  to +90
        yaw:   e.alpha ?? null,   // 0    to 360
      };
      // Resolve the first-event promise on initial data
      if (this._firstEventResolver) {
        this._firstEventResolver();
        this._firstEventResolver = null;
      }
    };

    window.addEventListener('deviceorientation', this._handler, true);
    this._active = true;

    // Wait for the first event to confirm the device actually fires them
    await this._awaitFirstEvent();
  }

  /**
   * Return the most recent orientation snapshot, or null if not started / no data.
   * @returns {{pitch:number|null, roll:number|null, yaw:number|null}|null}
   */
  getOrientation() {
    return this._active ? this._orientation : null;
  }

  /**
   * Check whether orientation tracking is available without starting it.
   * Safe to call any time (no user gesture required).
   * @returns {boolean}
   */
  static isSupported() {
    return typeof DeviceOrientationEvent !== 'undefined';
  }

  /** Stop listening and release resources. */
  stop() {
    if (this._handler) {
      window.removeEventListener('deviceorientation', this._handler, true);
      this._handler = null;
    }
    this._active      = false;
    this._orientation = null;
  }

  // ─────────────────────────────────────────────────────
  // Private
  // ─────────────────────────────────────────────────────

  /**
   * Request DeviceOrientationEvent permission on iOS 13+.
   * On all other platforms this is a no-op.
   */
  async _requestPermission() {
    if (!OrientationTracker.isSupported()) {
      throw new Error(
        'DeviceOrientationEvent is not supported in this browser. ' +
        'Orientation tracking requires a mobile device.'
      );
    }

    // iOS 13+ requires explicit permission via a static async method
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      let permission;
      try {
        permission = await DeviceOrientationEvent.requestPermission();
      } catch (err) {
        throw new Error(
          'DeviceOrientationEvent.requestPermission() must be called ' +
          'from a user gesture (e.g. button click). ' + err.message
        );
      }
      if (permission !== 'granted') {
        throw new Error(
          `Orientation permission ${permission}. ` +
          'The user must tap "Allow" to enable pitch and roll tracking.'
        );
      }
    }
    // Android and desktop browsers grant permission automatically (no prompt needed)
  }

  /**
   * Wait for the first deviceorientation event or timeout.
   * If the device does not fire events within SUPPORT_TIMEOUT_MS we warn but
   * do not throw — some Android models fire slowly on first attach.
   */
  _awaitFirstEvent() {
    return new Promise((resolve) => {
      if (this._orientation) {
        resolve();
        return;
      }
      this._firstEventResolver = resolve;
      setTimeout(() => {
        if (this._firstEventResolver) {
          this._firstEventResolver = null;
          console.warn(
            '[OrientationTracker] No deviceorientation event received within ' +
            `${SUPPORT_TIMEOUT_MS} ms. The device may not support orientation tracking.`
          );
          resolve(); // don't reject — let the caller decide what to do with null data
        }
      }, SUPPORT_TIMEOUT_MS);
    });
  }
}
