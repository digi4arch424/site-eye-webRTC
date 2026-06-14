/**
 * MultisetProvider — Phase 2 VPS implementation.
 *
 * Provides absolute georeferenced 6-DoF positioning via Multiset's Visual
 * Positioning System (sub-5 cm accuracy, persistent spatial anchors via MapSet).
 * This is what makes BIM model placement accurate across sessions and devices.
 *
 * STATUS: Stub — awaiting Multiset sandbox API key.
 * All methods are implemented as no-ops until the SDK is initialised.
 *
 * SWAP: To activate, in src/vps-config.js:
 *   1. Comment out the WebXRProvider import/return
 *   2. Uncomment the MultisetProvider import/return
 *   3. Add VITE_MULTISET_API_KEY to your GitHub Actions secret and .env.local
 *
 * @see https://multiset.com/docs (VPS SDK documentation)
 */

import { VPSProvider } from './vps-provider.js';

export class MultisetProvider extends VPSProvider {
  /**
   * @param {string} apiKey — from import.meta.env.VITE_MULTISET_API_KEY
   */
  constructor(apiKey) {
    super();
    this._apiKey  = apiKey;
    this._ready   = false;
    this._session = null;
  }

  // ─────────────────────────────────────────────────────
  // Public API  (all stubs — fill in from Multiset SDK docs)
  // ─────────────────────────────────────────────────────

  async init() {
    if (!this._apiKey) {
      throw new Error(
        'MultisetProvider: VITE_MULTISET_API_KEY is not set. ' +
        'Add it as a GitHub Actions secret and to your .env.local file.'
      );
    }

    // TODO: Replace with actual Multiset SDK initialisation
    // Example (check Multiset docs for exact API):
    //
    // await MultisetSDK.init({
    //   apiKey:  this._apiKey,
    //   mode:    'ar',
    //   mapSet:  import.meta.env.VITE_MULTISET_MAPSET_ID,
    // });
    // this._session = await MultisetSDK.startLocalization();
    // this._ready = true;
    //
    console.warn('[MultisetProvider] SDK not yet integrated — awaiting API key');
  }

  async getPose() {
    if (!this._ready) return null;

    // TODO: Replace with actual Multiset SDK localisation query
    // Example (check Multiset docs for exact shape):
    //
    // const result = await MultisetSDK.getLocalizationResult();
    // if (!result || result.status !== 'localised') return null;
    // return {
    //   position:    result.position,        // world-space metres
    //   orientation: {
    //     yaw:   result.orientation.heading,
    //     pitch: result.orientation.pitch,
    //     roll:  result.orientation.roll,
    //   },
    //   confidence:  result.confidence,      // 0–1
    //   timestamp:   performance.now(),
    // };

    return null;
  }

  async registerAnchor(name, pose) {
    if (!this._ready) {
      throw new Error('MultisetProvider: not initialised');
    }

    // TODO: Replace with actual Multiset spatial anchor creation
    // Example:
    //
    // const anchor = await MultisetSDK.createSpatialAnchor({
    //   name,
    //   position:    pose.position,
    //   orientation: pose.orientation,
    // });
    // return anchor.id;

    return `stub-anchor-${Date.now()}`;
  }

  destroy() {
    this._ready   = false;
    this._session = null;

    // TODO: Tear down Multiset session
    // MultisetSDK.stopLocalization();
  }
}
