/**
 * utils.js
 *
 * Shared utility functions used by sender.js, viewer.js, settings.js,
 * location.js, and markers.js. No dependencies other than config.js
 * (must load before this file — CONFIG is referenced by some callers).
 *
 * ── ⚠ RECONSTRUCTION NOTICE ──────────────────────────────────────────
 *
 * This file was reconstructed from project documentation, not extracted
 * from your actual source. The original utils.js was never uploaded or
 * pasted as literal code in the handover transcript — only its function
 * list, script load order, and observed runtime log output were
 * documented. If your real utils.js differs from this implementation,
 * replace this file with your actual one — do not assume this matches.
 *
 * Documented API surface (handover transcript references):
 *   "utils.js — setStatus, log, createBackoff, setInfoValue, toggleSettingsPanel"
 *   Observed log format: "[12:38:04 pm] Camera error: ReferenceError error"
 *   Observed usage:       backoff = createBackoff();  (called with no args)
 *
 * ── Script load order (per handover) ────────────────────────────────
 *   config.js → utils.js → [module files] → signaling.js → app.js →
 *   debug.js → diagnostics.js → sender.js/viewer.js → settings.js
 */

/* global CONFIG */

// ─────────────────────────────────────────────────────────────────────────────
// setStatus — update a visible status/banner element
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update the page's status display element.
 * Looks for an element with id="status" — adjust STATUS_ELEMENT_ID below
 * if your HTML uses a different id.
 *
 * @param {string} message              — text to display
 * @param {'info'|'success'|'warning'|'error'} [level='info']
 */
const STATUS_ELEMENT_ID = 'status';

function setStatus(message, level = 'info') {
  const el = document.getElementById(STATUS_ELEMENT_ID);
  if (el) {
    el.textContent = message;
    el.className = `status status-${level}`;
  }

  // Always mirror to the log so status changes are visible in the debug
  // panel and console even if the #status element isn't present yet
  // (e.g. before DOMContentLoaded).
  log(message, level === 'error' ? 'error' : 'info');
}


// ─────────────────────────────────────────────────────────────────────────────
// log — timestamped console + debug panel logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Observed output format from the handover transcript:
 *   "[12:38:04 pm] Camera error: ReferenceError error"
 *
 * Writes to console and, if debug.js has created a debug panel element
 * (id="debug-log"), appends a line there too. log() has no hard
 * dependency on debug.js — it degrades gracefully if that panel
 * doesn't exist.
 *
 * @param {string} message
 * @param {'info'|'warn'|'error'} [level='info']
 */
function log(message, level = 'info') {
  const ts = new Date().toLocaleTimeString('en-US', {
    hour:   'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).toLowerCase();

  const line = `[${ts}] ${message}`;

  switch (level) {
    case 'error': console.error(line); break;
    case 'warn':  console.warn(line);  break;
    default:      console.log(line);
  }

  // Optional debug panel (populated by debug.js, if present)
  const panel = document.getElementById('debug-log');
  if (panel) {
    const row = document.createElement('div');
    row.className = `debug-row debug-${level}`;
    row.textContent = line;
    panel.appendChild(row);
    panel.scrollTop = panel.scrollHeight;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// createBackoff — exponential backoff generator for reconnect logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Used for signaling-server reconnect attempts — particularly relevant
 * given the Render.com free-tier cold-start behavior (server sleeps
 * after ~15 min, first reconnect after wake can take 20–30s).
 *
 * Usage (per handover transcript):
 *   backoff = createBackoff();
 *   const delay = backoff.next();   // ms to wait before next retry
 *   backoff.reset();                // call on successful connection
 *
 * @param {object}  [opts]
 * @param {number}  [opts.baseMs=500]      — initial delay
 * @param {number}  [opts.maxMs=30000]     — delay ceiling
 * @param {number}  [opts.factor=2]        — multiplier per attempt
 * @param {number}  [opts.jitter=0.3]      — randomisation fraction (0–1)
 * @returns {{ next: () => number, reset: () => void, attempt: number }}
 */
function createBackoff({ baseMs = 500, maxMs = 30000, factor = 2, jitter = 0.3 } = {}) {
  let attempt = 0;

  return {
    /** Returns the delay (ms) to wait before the next retry, and increments. */
    next() {
      const raw    = Math.min(baseMs * Math.pow(factor, attempt), maxMs);
      const jitterRange = raw * jitter;
      const delay  = raw - jitterRange + Math.random() * (jitterRange * 2);
      attempt += 1;
      return Math.round(delay);
    },

    /** Reset the attempt counter — call after a successful connection. */
    reset() {
      attempt = 0;
    },

    /** Current attempt count, read-only convenience accessor. */
    get attempt() {
      return attempt;
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// setInfoValue — generic "set text content of element by id" helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Used throughout sender.js / viewer.js to populate info/overlay fields
 * without each call site needing its own getElementById + null check.
 *
 * @param {string} elementId
 * @param {string|number} value
 */
function setInfoValue(elementId, value) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = value;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// toggleSettingsPanel — show/hide the settings panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toggles visibility of the settings panel element (id="settings-panel").
 * settings.js wires this to the settings button's click handler.
 *
 * @param {boolean} [force]  — optional explicit show(true)/hide(false);
 *                             omit to toggle current state
 */
function toggleSettingsPanel(force) {
  const panel = document.getElementById('settings-panel');
  if (!panel) {
    log('toggleSettingsPanel: #settings-panel not found in DOM', 'warn');
    return;
  }

  const shouldShow = force !== undefined ? force : panel.hidden;
  panel.hidden = !shouldShow;

  // Optional: toggle a class for CSS transition support
  panel.classList.toggle('settings-panel-open', shouldShow);
}


// ─────────────────────────────────────────────────────────────────────────────
// Expose as globals — matches the non-module script tag pattern used
// throughout Phase 0 (config.js → utils.js → ... load order)
// ─────────────────────────────────────────────────────────────────────────────

window.setStatus            = setStatus;
window.log                  = log;
window.createBackoff        = createBackoff;
window.setInfoValue         = setInfoValue;
window.toggleSettingsPanel  = toggleSettingsPanel;
