/**
 * utils.js — Shared Utilities
 * Construction Camera System
 *
 * Pure utility functions — no config, no DOM references at module level.
 * Depends on: config.js (for createBackoff defaults only)
 */

/**
 * Update a status bar element.
 * @param {string} elementId
 * @param {string} text
 * @param {string} state — info | connecting | connected | streaming | error
 */
function setStatus(elementId, text, state = "info") {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `status status--${state}`;
}

/**
 * Timestamped console logger.
 * Also writes to debug panel if available.
 */
function log(...args) {
  const ts  = new Date().toLocaleTimeString();
  const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
  console.log(`[${ts}]`, ...args);
  if (window.debugLog) window.debugLog(msg);
}

/**
 * Exponential backoff generator.
 * @param {number} min — starting delay in ms
 * @param {number} max — maximum delay in ms
 */
function createBackoff(
  min = CONFIG.RECONNECT_MIN,
  max = CONFIG.RECONNECT_MAX
) {
  let delay = min;
  return {
    next()  { const c = delay; delay = Math.min(delay * 1.5, max); return c; },
    reset() { delay = min; },
  };
}

/**
 * Update a named info grid value element.
 * @param {string} elementId
 * @param {string} value
 */
function setInfoValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = value;
}

/**
 * Toggle settings panel open/closed.
 * @param {string} panelId
 * @param {string} toggleId
 */
function toggleSettingsPanel(panelId, toggleId) {
  const panel  = document.getElementById(panelId);
  const toggle = document.getElementById(toggleId);
  if (!panel || !toggle) return;
  panel.classList.toggle("open");
  toggle.textContent = panel.classList.contains("open") ? "▼" : "▶";
}
