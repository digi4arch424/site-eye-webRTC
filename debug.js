/**
 * debug.js — Real-time debug panel module
 * Construction Camera System
 *
 * Features:
 * - Pause / Resume log capture
 * - Clear logs
 * - Filter by type (error, network, ice, ai, info, success, warn)
 * - Search / highlight
 * - Auto-scroll toggle
 * - Export logs (.txt)
 * - Collapsible panel (state remembered)
 * - Max 500 entries (auto-trims oldest)
 * - PeerJS / ICE / stream status bar
 *
 * To disable in production: remove <script src="debug.js"> from HTML.
 * Zero impact on app.js, sender.js, viewer.js when removed.
 */

(function () {
  const MAX_ENTRIES = 500;
  let paused       = false;
  let autoScroll   = true;
  let activeFilter = "all";
  let searchTerm   = "";
  let entryCount   = 0;
  let allEntries   = []; // { el, type, text, ts }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #dbg {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      font-size: 11px;
      background: var(--bg);
      border-top: 2px solid var(--accent);
      display: flex; flex-direction: column;
      max-height: 44vh;
      transition: max-height 0.2s ease;
    }
    #dbg.collapsed { max-height: 30px; }

    /* ── Header ── */
    #dbg-head {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 10px; flex-shrink: 0;
      background: rgba(245,158,11,0.07);
      border-bottom: 1px solid var(--border);
      cursor: pointer; user-select: none;
    }
    #dbg-chevron { color: var(--accent); font-size: 11px; width: 14px; }
    #dbg-title   { color: var(--accent); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; }
    #dbg-count   { color: var(--text-dim); font-size: 10px; margin-left: 4px; }
    #dbg-paused-badge {
      display: none; background: var(--red); color: #fff;
      font-size: 9px; padding: 1px 6px; border-radius: 2px;
      letter-spacing: .1em; text-transform: uppercase;
    }
    #dbg-paused-badge.visible { display: inline-block; }
    #dbg-spacer { flex: 1; }

    /* ── Toolbar ── */
    #dbg-toolbar {
      display: flex; align-items: center; gap: 5px;
      padding: 5px 10px; flex-shrink: 0;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }
    .dbg-btn {
      background: transparent;
      border: 1px solid var(--border); color: var(--text-muted);
      font-family: inherit; font-size: 10px;
      padding: 2px 8px; border-radius: 2px;
      cursor: pointer; transition: all .15s; white-space: nowrap;
    }
    .dbg-btn:hover           { color: var(--accent); border-color: var(--accent); }
    .dbg-btn.active          { color: #f59e0b; border-color: #f59e0b; background: rgba(245,158,11,.1); }
    .dbg-btn.pause-active    { color: var(--red); border-color: var(--red); background: rgba(239,68,68,.1); }
    .dbg-btn.as-active       { color: var(--green); border-color: var(--green); }

    .dbg-divider { width: 1px; height: 16px; background: var(--border); flex-shrink: 0; }

    #dbg-search {
      background: var(--bg); border: 1px solid var(--border);
      color: var(--text); font-family: inherit; font-size: 10px;
      padding: 2px 8px; border-radius: 2px; outline: none;
      width: 140px; transition: border-color .15s;
    }
    #dbg-search:focus { border-color: var(--accent); }
    #dbg-search::placeholder { color: var(--text-dim); }

    /* ── Filter chips ── */
    .dbg-filter { font-size: 9px; padding: 2px 7px; }
    .dbg-filter[data-f="error"]   { --fc: var(--red); }
    .dbg-filter[data-f="warn"]    { --fc: var(--yellow); }
    .dbg-filter[data-f="success"] { --fc: var(--green); }
    .dbg-filter[data-f="ice"]     { --fc: var(--blue); }
    .dbg-filter[data-f="network"] { --fc: var(--purple); }
    .dbg-filter[data-f="ai"]      { --fc: var(--pink); }
    .dbg-filter[data-f="info"]    { --fc: var(--text-muted); }
    .dbg-filter.active { color: var(--fc,#f59e0b); border-color: var(--fc,#f59e0b); background: color-mix(in srgb, var(--fc,#f59e0b) 12%, transparent); }

    /* ── Log area ── */
    #dbg-log { overflow-y: auto; flex: 1; padding: 3px 0; }

    .dbg-entry {
      display: flex; gap: 8px;
      padding: 2px 10px; line-height: 1.5;
      border-bottom: 1px solid rgba(255,255,255,.025);
      transition: background .1s;
    }
    .dbg-entry:hover { background: rgba(255,255,255,.03); }
    .dbg-entry.hidden { display: none; }

    .dbg-ts   { color: var(--text-faint); flex-shrink: 0; }
    .dbg-role { color: var(--accent); flex-shrink: 0; min-width: 48px; }
    .dbg-type { flex-shrink: 0; min-width: 54px; font-size: 9px; opacity: .7; text-transform: uppercase; letter-spacing: .06em; }
    .dbg-msg  { color: var(--text); word-break: break-all; }

    .dbg-entry.error   .dbg-msg, .dbg-entry.error   .dbg-type { color: var(--red); }
    .dbg-entry.warn    .dbg-msg, .dbg-entry.warn    .dbg-type { color: var(--yellow); }
    .dbg-entry.success .dbg-msg, .dbg-entry.success .dbg-type { color: var(--green); }
    .dbg-entry.ice     .dbg-msg, .dbg-entry.ice     .dbg-type { color: var(--blue); }
    .dbg-entry.network .dbg-msg, .dbg-entry.network .dbg-type { color: var(--purple); }
    .dbg-entry.ai      .dbg-msg, .dbg-entry.ai      .dbg-type { color: var(--pink); }
    .dbg-entry.info    .dbg-msg, .dbg-entry.info    .dbg-type { color: var(--text-muted); }

    mark.dbg-hl { background: rgba(245,158,11,.35); color: inherit; border-radius: 1px; }

    /* ── Status bar ── */
    #dbg-status {
      display: flex; gap: 14px; flex-wrap: wrap;
      padding: 3px 10px; flex-shrink: 0;
      border-top: 1px solid var(--border);
      background: rgba(0,0,0,.5);
    }
    .dbg-stat { color: var(--text-faint); font-size: 10px; }
    .dbg-stat span { color: var(--accent); }
  `;
  document.head.appendChild(style);

  // ── HTML ────────────────────────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.id = "dbg";
  panel.innerHTML = `
    <div id="dbg-head">
      <span id="dbg-chevron">▲</span>
      <span id="dbg-title">Debug Console</span>
      <span id="dbg-count">0 entries</span>
      <span id="dbg-paused-badge">⏸ Paused</span>
      <span id="dbg-spacer"></span>
    </div>

    <div id="dbg-toolbar">
      <!-- Pause / Resume -->
      <button class="dbg-btn" id="dbg-pause">⏸ Pause</button>

      <div class="dbg-divider"></div>

      <!-- Auto-scroll -->
      <button class="dbg-btn as-active" id="dbg-autoscroll" title="Toggle auto-scroll">↓ Auto</button>

      <!-- Search -->
      <input id="dbg-search" type="text" placeholder="Search logs…" />

      <div class="dbg-divider"></div>

      <!-- Filters -->
      <button class="dbg-btn dbg-filter active" data-f="all">All</button>
      <button class="dbg-btn dbg-filter" data-f="error">Error</button>
      <button class="dbg-btn dbg-filter" data-f="warn">Warn</button>
      <button class="dbg-btn dbg-filter" data-f="success">OK</button>
      <button class="dbg-btn dbg-filter" data-f="ice">ICE</button>
      <button class="dbg-btn dbg-filter" data-f="network">Network</button>
      <button class="dbg-btn dbg-filter" data-f="ai">AI</button>
      <button class="dbg-btn dbg-filter" data-f="info">Info</button>

      <div class="dbg-divider"></div>

      <!-- Actions -->
      <button class="dbg-btn" id="dbg-export">⬇ Export</button>
      <button class="dbg-btn" id="dbg-clear">✕ Clear</button>
    </div>

    <div id="dbg-log"></div>

    <div id="dbg-status">
      <div class="dbg-stat">Peer: <span id="ds-peer">—</span></div>
      <div class="dbg-stat">ICE: <span id="ds-ice">—</span></div>
      <div class="dbg-stat">Conn: <span id="ds-conn">—</span></div>
      <div class="dbg-stat">Stream: <span id="ds-stream">—</span></div>
      <div class="dbg-stat">Latency: <span id="ds-latency">—</span></div>
    </div>
  `;
  document.body.appendChild(panel);

  const logEl      = document.getElementById("dbg-log");
  const countEl    = document.getElementById("dbg-count");
  const pauseBadge = document.getElementById("dbg-paused-badge");
  const pauseBtn   = document.getElementById("dbg-pause");
  const asBtn      = document.getElementById("dbg-autoscroll");
  const searchEl   = document.getElementById("dbg-search");

  // ── Collapse ─────────────────────────────────────────────────────────────────
  let collapsed = localStorage.getItem("dbg-collapsed") === "true";
  function applyCollapse() {
    panel.classList.toggle("collapsed", collapsed);
    document.getElementById("dbg-chevron").textContent = collapsed ? "▼" : "▲";
    localStorage.setItem("dbg-collapsed", collapsed);
  }
  applyCollapse();
  document.getElementById("dbg-head").addEventListener("click", () => {
    collapsed = !collapsed; applyCollapse();
  });

  // ── Pause / Resume ────────────────────────────────────────────────────────────
  pauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    paused = !paused;
    pauseBtn.textContent = paused ? "▶ Resume" : "⏸ Pause";
    pauseBtn.classList.toggle("pause-active", paused);
    pauseBadge.classList.toggle("visible", paused);
  });

  // ── Auto-scroll ───────────────────────────────────────────────────────────────
  asBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    autoScroll = !autoScroll;
    asBtn.classList.toggle("as-active", autoScroll);
    asBtn.textContent = autoScroll ? "↓ Auto" : "↕ Manual";
  });

  // ── Filter ────────────────────────────────────────────────────────────────────
  document.querySelectorAll(".dbg-filter").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".dbg-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.f;
      applyFilters();
    });
  });

  // ── Search ────────────────────────────────────────────────────────────────────
  searchEl.addEventListener("input", (e) => {
    e.stopPropagation();
    searchTerm = e.target.value.toLowerCase().trim();
    applyFilters();
  });
  searchEl.addEventListener("click", e => e.stopPropagation());
  searchEl.addEventListener("keydown", e => e.stopPropagation());

  // ── Export ────────────────────────────────────────────────────────────────────
  document.getElementById("dbg-export").addEventListener("click", (e) => {
    e.stopPropagation();
    const lines = allEntries.map(entry =>
      `[${entry.ts}] [${entry.type.toUpperCase()}] ${entry.text}`
    ).join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `construction-cam-debug-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ── Clear ─────────────────────────────────────────────────────────────────────
  document.getElementById("dbg-clear").addEventListener("click", (e) => {
    e.stopPropagation();
    logEl.innerHTML = "";
    allEntries = [];
    entryCount = 0;
    updateCount();
  });

  // ── Filter + Search logic ─────────────────────────────────────────────────────
  function applyFilters() {
    allEntries.forEach(({ el, type, text }) => {
      const typeMatch   = activeFilter === "all" || type === activeFilter;
      const searchMatch = !searchTerm || text.toLowerCase().includes(searchTerm);
      el.classList.toggle("hidden", !(typeMatch && searchMatch));

      // Highlight search term in message
      const msgEl = el.querySelector(".dbg-msg");
      if (msgEl) {
        if (searchTerm && searchMatch) {
          const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          msgEl.innerHTML = escapeHtml(text).replace(
            new RegExp(escaped, "gi"),
            m => `<mark class="dbg-hl">${m}</mark>`
          );
        } else {
          msgEl.textContent = text;
        }
      }
    });
    if (autoScroll) logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Classify message type ─────────────────────────────────────────────────────
  function classifyType(msg) {
    const m = msg.toLowerCase();
    if (/error|fail|denied|refused|unavailable/.test(m)) return "error";
    if (/warn|conflict|retry|timeout/.test(m))           return "warn";
    if (/✓|live|streaming|ready|answered|registered/.test(m)) return "success";
    if (/ice|stun|turn|candidate/.test(m))               return "ice";
    if (/disconnect|reconnect|network|socket|ws|peer/.test(m)) return "network";
    if (/ai|model|inference|track|detect|vps|multiset/.test(m)) return "ai";
    return "info";
  }

  // ── Write entry ───────────────────────────────────────────────────────────────
  function updateCount() {
    countEl.textContent = `${entryCount} entries`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function writeEntry(rawMsg, forceType) {
    if (paused) return;

    const ts   = new Date().toLocaleTimeString("en", { hour12: false });
    const text = String(rawMsg);
    const type = forceType || classifyType(text);
    const role = document.title.includes("Sender") ? "SENDER" : "VIEWER";

    const el = document.createElement("div");
    el.className = `dbg-entry ${type}`;
    el.innerHTML = `
      <span class="dbg-ts">${ts}</span>
      <span class="dbg-role">${role}</span>
      <span class="dbg-type">${type}</span>
      <span class="dbg-msg">${escapeHtml(text)}</span>
    `;

    const entry = { el, type, text, ts, role };
    allEntries.push(entry);
    logEl.appendChild(el);
    entryCount++;
    updateCount();

    // Trim
    if (allEntries.length > MAX_ENTRIES) {
      const removed = allEntries.shift();
      removed.el.remove();
    }

    // Apply current filter/search to new entry
    const typeMatch   = activeFilter === "all" || type === activeFilter;
    const searchMatch = !searchTerm || text.toLowerCase().includes(searchTerm);
    if (!(typeMatch && searchMatch)) el.classList.add("hidden");

    if (autoScroll) logEl.scrollTop = logEl.scrollHeight;
  }

  // ── Override global log() ─────────────────────────────────────────────────────
  const originalLog = window.log;
  window.log = function (...args) {
    if (originalLog) originalLog(...args);
    writeEntry(args.map(a =>
      typeof a === "object" ? JSON.stringify(a) : String(a)
    ).join(" "));
  };

  // ── Intercept console.error for PeerJS internals ──────────────────────────────
  const origConsoleError = console.error;
  console.error = function (...args) {
    origConsoleError(...args);
    const msg = args.map(a =>
      typeof a === "object" ? JSON.stringify(a) : String(a)
    ).join(" ");
    if (msg.includes("PeerJS")) writeEntry("PeerJS: " + msg, "error");
  };

  // ── Status bar API (called from sender/viewer) ────────────────────────────────
  window.debugSetPeer   = (v) => { const el = document.getElementById("ds-peer");   if (el) el.textContent = v; };
  window.debugSetIce    = (v) => { const el = document.getElementById("ds-ice");    if (el) el.textContent = v; };
  window.debugSetConn   = (v) => { const el = document.getElementById("ds-conn");   if (el) el.textContent = v; };
  window.debugSetStream = (v) => { const el = document.getElementById("ds-stream"); if (el) el.textContent = v; };

  // ── Public API for future modules ─────────────────────────────────────────────
  // Usage: window.debugLog("AI model loaded", "ai")
  window.debugLog = writeEntry;

  // ── ICE / PeerConnection monitor ──────────────────────────────────────────────
  // Call this from sender.js or viewer.js after a call is established:
  // window.debugMonitorCall(call)
  window.debugMonitorCall = function(call) {
    if (!call || !call.peerConnection) return;
    const pc = call.peerConnection;

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      const type = state === "failed" || state === "disconnected" ? "error"
                 : state === "connected" || state === "completed"  ? "success"
                 : "ice";
      writeEntry("ICE connection state: " + state, type);
      if (window.debugSetIce) debugSetIce(state);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const type = state === "failed" ? "error"
                 : state === "connected" ? "success"
                 : "network";
      writeEntry("Connection state: " + state, type);
      if (window.debugSetConn) debugSetConn(state);
    };

    pc.onicegatheringstatechange = () => {
      writeEntry("ICE gathering state: " + pc.iceGatheringState, "ice");
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        writeEntry("ICE candidate: " + e.candidate.type + " / " + e.candidate.protocol, "ice");
      } else {
        writeEntry("ICE gathering complete", "ice");
      }
    };
  };

  writeEntry("Debug panel ready — v2", "success");
})();
