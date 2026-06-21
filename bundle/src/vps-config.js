/**
 * vps-config.js — VPS provider factory.
 *
 * THIS IS THE ONLY FILE THAT CHANGES WHEN THE MULTISET KEY ARRIVES.
 *
 * Phase 1 (now):
 *   WebXRProvider — relative 6-DoF via ARCore/ARKit, no API key.
 *
 * Phase 2 (when key arrives):
 *   1. Comment out the WebXRProvider lines below.
 *   2. Uncomment the MultisetProvider lines below.
 *   3. Add VITE_MULTISET_API_KEY to GitHub Actions secrets and .env.local.
 *   4. No other file needs to change.
 */

import { WebXRProvider }    from './webxr-provider.js';
// import { MultisetProvider } from './multiset-provider.js';   // ← Phase 2

/**
 * Returns the active VPS provider for this build.
 * All consumers call this — none import a provider class directly.
 * @returns {import('./vps-provider.js').VPSProvider}
 */
export function createVPSProvider() {
  return new WebXRProvider();

  // ── Phase 2 swap ──────────────────────────────────────────────────────────
  // const key = import.meta.env.VITE_MULTISET_API_KEY;
  // if (!key) throw new Error('VITE_MULTISET_API_KEY is not set');
  // return new MultisetProvider(key);
  // ─────────────────────────────────────────────────────────────────────────
}

/**
 * Capability check — call this at startup to decide whether to show the
 * "Start AR" button or display a "device not supported" warning.
 * Mirrors the hardware-detection pattern needed for Phase 2 LiDAR detection.
 *
 * @returns {Promise<{supported: boolean, reason: string|null}>}
 */
export async function checkVPSSupport() {
  if (!navigator.xr) {
    return {
      supported: false,
      reason: 'WebXR is not available. Use Android Chrome or iOS Safari 15.4+ over HTTPS.',
    };
  }
  try {
    const ok = await navigator.xr.isSessionSupported('immersive-ar');
    return ok
      ? { supported: true,  reason: null }
      : { supported: false, reason: 'This device does not support immersive-ar (ARCore/ARKit required).' };
  } catch {
    return { supported: false, reason: 'WebXR support check failed.' };
  }
}
