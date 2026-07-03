/**
 * app.js — Application Bootstrap
 * Construction Camera System
 *
 * Thin bootstrap layer — initialises network modules with config.
 * All config lives in config.js, all utilities in utils.js.
 *
 * Load order in HTML:
 *   1. config.js       — CONFIG object
 *   2. utils.js        — setStatus, log, createBackoff, etc.
 *   3. module-b.js     — ModuleB (from webrtc-network-modules)
 *   4. module-c.js     — ModuleC
 *   5. module-a.js     — ModuleA
 *   6. signaling.js    — SignalingClient
 *   7. debug.js        — debug panel (optional)
 *   8. diagnostics.js  — diagnostics panel (optional)
 *   9. sender.js       — or viewer.js
 *   10. settings.js    — page settings logic
 */

/**
 * Initialise Module A with project config.
 * Called from sender.js and viewer.js on DOMContentLoaded.
 * @param {string} role — "sender" | "viewer"
 */
function initNetworkModules(role) {
  ModuleA.configure({
    ...CONFIG.NETWORK,
    onStateChange: (state, mode) => {
      const el = document.getElementById("network-mode-indicator");
      if (!el) return;
      const labels = {
        idle:          { text: "—",                                    color: "#3d4a55" },
        local_attempt: { text: "Local P2P…",                          color: "#f59e0b" },
        relay_attempt: { text: "TURN Relay…",                         color: "#f59e0b" },
        connected:     { text: mode === "relay" ? "Relay ✓" : "Local P2P ✓", color: "#22c55e" },
        failed:        { text: "Failed",                               color: "#ef4444" },
      };
      const label    = labels[state] || { text: state, color: "#3d4a55" };
      el.textContent = label.text;
      el.style.color = label.color;
    },
  });

  log("Network modules initialised — role: " + role);
}
