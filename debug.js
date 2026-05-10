/**
 * debug.js — Real-time debug panel module
 * Construction Camera System
 *
 * Overrides the global log() function to also write to an on-screen panel.
 * Drop-in: just add <script src="debug.js"></script> after app.js.
 * Remove the script tag to disable — zero impact on production code.
 *
 * Features:
 * - Collapsible panel (remembers open/closed state)
 * - Colour-coded log levels (info, warn, error)
 * - Timestamps on every entry
 * - Copy logs to clipboard
 * - Clear logs button
 * - PeerJS + ICE state monitoring
 * - Max 200 entries (auto-trims oldest)
 */

(function () {
  const MAX_ENTRIES = 200;

  // ── Inject styles ────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #debug-panel {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 9999;
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      font-size: 11px;
      background: rgba(8, 10, 12, 0.97);
      border-top: 1px solid #f59e0b;
      max-height: 40vh;
      display: flex;
      flex-direction: column;
      transition: max-height 0.25s ease;
    }
    #debug-panel.collapsed {
      max-height: 32px;
    }
    #debug-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(245,158,11,0.08);
      border-bottom: 1px solid #2a3038;
      cursor: pointer;
      user-select: none;
      flex-shrink: 0;
    }
    #debug-title {
      color: #f59e0b;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      flex: 1;
    }
    #debug-count {
      color: #5a6a78;
      font-size: 10px;
    }
    .debug-btn {
      background: transparent;
      border: 1px solid #2a3038;
      color: #5a6a78;
      font-family: inherit;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 2px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    }
    .debug-btn:hover { color: #f59e0b; border-color: #f59e0b; }
    #debug-toggle { color: #f59e0b; font-size: 12px; min-width: 16px; text-align: center; }
    #debug-log {
      overflow-y: auto;
      flex: 1;
      padding: 6px 0;
    }
    .debug-entry {
      display: flex;
      gap: 8px;
      padding: 2px 12px;
      line-height: 1.5;
      border-bottom: 1px solid rgba(255,255,255,0.03);
    }
    .debug-entry:hover { background: rgba(255,255,255,0.03); }
    .debug-ts   { color: #3d4a55; flex-shrink: 0; }
    .debug-role { color: #f59e0b; flex-shrink: 0; min-width: 48px; }
    .debug-msg  { color: #d4dde6; word-break: break-all; }
    .debug-entry.warn  .debug-msg { color: #fbbf24; }
    .debug-entry.error .debug-msg { color: #ef4444; }
    .debug-entry.success .debug-msg { color: #22c55e; }
    .debug-entry.ice   .debug-msg { color: #38bdf8; }
    #debug-status-bar {
      display: flex;
      gap: 16px;
      padding: 4px 12px;
      border-top: 1px solid #1a2028;
      flex-shrink: 0;
      background: rgba(0,0,0,0.4);
    }
    .debug-stat { color: #3d4a55; font-size: 10px; }
    .debug-stat span { color: #f59e0b; }
  `;
  document.head.appendChild(style);

  // ── Inject HTML ───────────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.id = "debug-panel";
  panel.innerHTML = `
    <div id="debug-header">
      <span id="debug-toggle">▲</span>
      <span id="debug-title">Debug Console</span>
      <span id="debug-count">0 entries</span>
      <button class="debug-btn" id="debug-copy-btn">Copy</button>
      <button class="debug-btn" id="debug-clear-btn">Clear</button>
    </div>
    <div id="debug-log"></div>
    <div id="debug-status-bar">
      <div class="debug-stat">Peer: <span id="ds-peer">—</span></div>
      <div class="debug-stat">ICE: <span id="ds-ice">—</span></div>
      <div class="debug-stat">Conn: <span id="ds-conn">—</span></div>
      <div class="debug-stat">Stream: <span id="ds-stream">—</span></div>
    </div>
  `;
  document.body.appendChild(panel);

  // ── Collapse / expand ────────────────────────────────────────────────────────
  let collapsed = localStorage.getItem("debug-collapsed") === "true";
  function applyCollapse() {
    panel.classList.toggle("collapsed", collapsed);
    document.getElementById("debug-toggle").textContent = collapsed ? "▼" : "▲";
    localStorage.setItem("debug-collapsed", collapsed);
  }
  applyCollapse();
  document.getElementById("debug-header").addEventListener("click", () => {
    collapsed = !collapsed;
    applyCollapse();
  });

  // ── Copy logs ────────────────────────────────────────────────────────────────
  document.getElementById("debug-copy-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    const text = Array.from(document.querySelectorAll(".debug-entry"))
      .map(el => el.textContent.trim())
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      document.getElementById("debug-copy-btn").textContent = "Copied!";
      setTimeout(() => document.getElementById("debug-copy-btn").textContent = "Copy", 1500);
    });
  });

  // ── Clear logs ───────────────────────────────────────────────────────────────
  document.getElementById("debug-clear-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("debug-log").innerHTML = "";
    entryCount = 0;
    updateCount();
  });

  // ── Entry writer ─────────────────────────────────────────────────────────────
  let entryCount = 0;
  const logEl = document.getElementById("debug-log");

  function updateCount() {
    document.getElementById("debug-count").textContent = `${entryCount} entries`;
  }

  function writeEntry(msg, level = "info") {
    const ts = new Date().toLocaleTimeString("en", { hour12: false });
    const role = document.title.includes("Sender") ? "SENDER" : "VIEWER";

    // Detect level from message content
    if (!level || level === "info") {
      if (/error|fail|denied|refused/i.test(msg)) level = "error";
      else if (/warn|conflict|retry|disconnect/i.test(msg)) level = "warn";
      else if (/✓|live|streaming|ready|connected|answered/i.test(msg)) level = "success";
      else if (/ice|stun|turn|candidate/i.test(msg)) level = "ice";
    }

    const entry = document.createElement("div");
    entry.className = `debug-entry ${level}`;
    entry.innerHTML = `
      <span class="debug-ts">${ts}</span>
      <span class="debug-role">${role}</span>
      <span class="debug-msg">${escapeHtml(String(msg))}</span>
    `;

    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
    entryCount++;
    updateCount();

    // Trim oldest entries
    const entries = logEl.querySelectorAll(".debug-entry");
    if (entries.length > MAX_ENTRIES) entries[0].remove();
  }

  function escapeHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  // ── Override global log() ────────────────────────────────────────────────────
  const originalLog = window.log;
  window.log = function (...args) {
    if (originalLog) originalLog(...args);  // keep console output
    writeEntry(args.map(a =>
      typeof a === "object" ? JSON.stringify(a) : String(a)
    ).join(" "));
  };

  // ── Status bar updaters (called from sender/viewer) ──────────────────────────
  window.debugSetPeer  = (v) => { const el = document.getElementById("ds-peer");   if(el) el.textContent = v; };
  window.debugSetIce   = (v) => { const el = document.getElementById("ds-ice");    if(el) el.textContent = v; };
  window.debugSetConn  = (v) => { const el = document.getElementById("ds-conn");   if(el) el.textContent = v; };
  window.debugSetStream= (v) => { const el = document.getElementById("ds-stream"); if(el) el.textContent = v; };

  // ── Intercept console.error for PeerJS internal errors ───────────────────────
  const origError = console.error;
  console.error = function (...args) {
    origError(...args);
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ");
    if (msg.includes("PeerJS")) writeEntry("PeerJS: " + msg, "error");
  };

  writeEntry("Debug panel ready", "success");
})();
