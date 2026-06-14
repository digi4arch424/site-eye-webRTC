/**
 * VPSProvider — abstract base class for all spatial positioning backends.
 *
 * Phase 1: implemented by WebXRProvider (relative 6-DoF, no API key)
 * Phase 2: swapped for MultisetProvider (absolute georeferenced, API key required)
 *
 * Concrete subclasses must override: init, getPose, registerAnchor, destroy.
 * Nothing outside this file cares which provider is active.
 */

/**
 * @typedef {Object} VPSPosition
 * @property {number} x  — metres, right
 * @property {number} y  — metres, up
 * @property {number} z  — metres, forward
 */

/**
 * @typedef {Object} VPSOrientation
 * @property {number} yaw    — degrees, −180 to +180
 * @property {number} pitch  — degrees, −90  to +90
 * @property {number} roll   — degrees, −180 to +180
 */

/**
 * @typedef {Object} VPSPose
 * @property {VPSPosition}    position
 * @property {VPSOrientation} orientation
 * @property {number}         confidence  — 0 (none) to 1 (full)
 * @property {number}         timestamp   — performance.now() at capture
 */

export class VPSProvider {
  /**
   * Connect to the VPS backend and prepare for pose queries.
   * Must be called from a user-gesture handler (required by WebXR).
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('VPSProvider.init() must be implemented by subclass');
  }

  /**
   * Return the most recent pose, or null if not yet localised.
   * @returns {Promise<VPSPose|null>}
   */
  async getPose() {
    throw new Error('VPSProvider.getPose() must be implemented by subclass');
  }

  /**
   * Register a named spatial anchor at the given pose.
   * In Phase 1 (WebXR) these are stored in memory only.
   * In Phase 2 (Multiset) they persist across sessions via MapSet.
   * @param {string}   name
   * @param {VPSPose}  pose
   * @returns {Promise<string>}  anchor ID
   */
  async registerAnchor(name, pose) {
    throw new Error('VPSProvider.registerAnchor() must be implemented by subclass');
  }

  /**
   * Tear down the session and release resources.
   */
  destroy() {
    throw new Error('VPSProvider.destroy() must be implemented by subclass');
  }
}
