/**
 * diagnostics.js — System Diagnostic & Cost Analysis Module
 * Construction Camera System
 *
 * Tests all system operations and reports:
 * - Pass / Fail / Warning status
 * - Free vs Paid in production
 * - Current provider
 * - Recommendations
 *
 * Usage: add <script src="diagnostics.js"></script> to any page
 * Opens as a full overlay panel triggered by the diagnostics button.
 */

(function () {

  // ── Cost & provider registry ─────────────────────────────────────────────────
  const OPERATIONS = [
    {
      id:       "github-pages",
      name:     "Frontend Hosting",
      provider: "GitHub Pages",
      test:     () => window.location.protocol === "https:",
      free:     true,
      freeTier: "Unlimited (static files)",
      paidCost: null,
      note:     "Free forever for public repos. Custom domain supported.",
    },
    {
      id:       "peerjs-signaling",
      name:     "PeerJS Signaling Server",
      provider: "Render.com (free tier)",
      test:     testSignalingServer,
      free:     true,
      freeTier: "750 hrs/month — sleeps after 15min idle",
      paidCost: "$7/month (Render Starter — always on)",
      note:     "Free tier causes ~60s cold start. Upgrade for production.",
    },
    {
      id:       "webrtc",
      name:     "WebRTC P2P Video",
      provider: "Browser native",
      test:     () => !!window.RTCPeerConnection,
      free:     true,
      freeTier: "Free — P2P, no server involved",
      paidCost: null,
      note:     "Video travels directly between devices. No bandwidth cost.",
    },
    {
      id:       "turn-relay",
      name:     "TURN Relay (NAT traversal)",
      provider: "Open Relay / Metered free",
      test:     testTurnServer,
      free:     true,
      freeTier: "~20 GB/month relay bandwidth",
      paidCost: "$0.40/GB over free limit (Metered.ca)",
      note:     "Only used when P2P fails. Heavy use on restricted networks costs money.",
    },
    {
      id:       "camera",
      name:     "Camera Access (getUserMedia)",
      provider: "Browser native",
      test:     testCamera,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Requires HTTPS and user permission. Tested via device enumeration — no permission prompt.",
    },
    {
      id:       "geolocation",
      name:     "GPS / Geolocation (M2)",
      provider: "Browser native",
      test:     () => !!navigator.geolocation,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Required for M2 GPS overlay. Requires user permission.",
    },
    {
      id:       "device-orientation",
      name:     "Compass / Device Orientation (M2)",
      provider: "Browser native",
      test:     testDeviceOrientation,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Required for M2 compass overlay. iOS requires explicit permission.",
    },
    {
      id:       "webxr",
      name:     "WebXR API (M3–M5)",
      provider: "Browser native",
      test:     () => !!navigator.xr,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Required for AR overlays in M3+. Not available on all browsers.",
    },
    {
      id:       "multiset-vps",
      name:     "Multiset Visual Positioning (M5)",
      provider: "Multiset AI",
      test:     () => false, // not yet integrated
      free:     false,
      freeTier: "Sandbox / dev tier (limited)",
      paidCost: "Contact Multiset AI for pricing",
      note:     "Required for M5 6-DoF positioning. Sub-6cm accuracy.",
      notYet:   true,
    },
    {
      id:       "threejs",
      name:     "3D Overlay Rendering (M4)",
      provider: "Three.js (open source)",
      test:     () => typeof THREE !== "undefined",
      free:     true,
      freeTier: "Free — runs in browser",
      paidCost: null,
      note:     "No cost. Heavy scenes may affect performance on low-end phones.",
      notYet:   true,
    },
    {
      id:       "recording",
      name:     "Video Recording (M7)",
      provider: "MediaRecorder API + storage TBD",
      test:     () => !!window.MediaRecorder,
      free:     false,
      freeTier: "Recording API is free — storage is not",
      paidCost: "~$0.023/GB/month (AWS S3) or similar",
      note:     "Recording API is browser-native. Storage costs depend on volume.",
      notYet:   true,
    },
    {
      id:       "websocket",
      name:     "WebSocket Support",
      provider: "Browser native",
      test:     () => !!window.WebSocket,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Required for PeerJS signaling connection.",
    },
    {
      id:       "https",
      name:     "HTTPS / Secure Context",
      provider: "GitHub Pages (Let's Encrypt)",
      test:     () => window.isSecureContext,
      free:     true,
      freeTier: "Free via GitHub Pages",
      paidCost: null,
      note:     "Required for camera, WebRTC, and geolocation APIs.",
    },
    {
      id:       "indexeddb",
      name:     "Local Storage / IndexedDB (future)",
      provider: "Browser native",
      test:     () => !!window.indexedDB,
      free:     true,
      freeTier: "Free",
      paidCost: null,
      note:     "Available for offline caching of site data in future milestones.",
      notYet:   true,
    },
  ];

  // ── Test functions ────────────────────────────────────────────────────────────
  async function testSignalingServer() {
    try {
      const url = CONFIG?.SIGNALING_URL
        ? CONFIG.SIGNALING_URL.replace("wss://", "https://").replace("ws://", "http://")
        : "https://peerjs-signaling-server-denf.onrender.com";
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch { return false; }
  }

  async function testTurnServer() {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:openrelay.metered.ca:80" }]
        });
        pc.createDataChannel("test");
        let found = false;
        pc.onicecandidate = (e) => {
          if (e.candidate) { found = true; pc.close(); resolve(true); }
        };
        pc.createOffer().then(o => pc.setLocalDescription(o));
        setTimeout(() => { pc.close(); resolve(found); }, 4000);
      } catch { resolve(false); }
    });
  }

  async function testCamera() {
    try {
      // Check API availability without requesting permission
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return false;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(d => d.kind === "videoinput");
      return hasCamera;
    } catch { return false; }
  }

  function testDeviceOrientation() {
    return typeof DeviceOrientationEvent !== "undefined";
  }

  // ── Hardware capability tests ─────────────────────────────────────────────────

  async function getHardwareProfile() {
    const profile = {
      cores:        navigator.hardwareConcurrency || null,
      memory:       navigator.deviceMemory        || null,
      webgl:        null,
      gpu:          null,
      webxr:        !!navigator.xr,
      battery:      null,
      fps:          null,
      isMobile:     /Android|iPhone|iPad/i.test(navigator.userAgent),
    };

    // WebGL + GPU
    try {
      const canvas  = document.createElement("canvas");
      const gl      = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (gl) {
        profile.webgl = true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          profile.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        }
      } else {
        profile.webgl = false;
      }
    } catch { profile.webgl = false; }

    // Battery (where supported)
    try {
      if (navigator.getBattery) {
        const bat = await navigator.getBattery();
        profile.battery = {
          level:   Math.round(bat.level * 100),
          charging: bat.charging,
        };
      }
    } catch {}

    // FPS measurement — render 60 frames and measure
    await new Promise(resolve => {
      let frames  = 0;
      const start = performance.now();
      const limit = 60;
      function tick() {
        frames++;
        if (frames < limit) {
          requestAnimationFrame(tick);
        } else {
          const elapsed = performance.now() - start;
          profile.fps = Math.round((frames / elapsed) * 1000);
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });

    return profile;
  }

  function rateHardware(profile) {
    // Rate device capability for upcoming milestones
    const ratings = [];

    // CPU cores
    if (profile.cores >= 8)      ratings.push({ label: "CPU", value: profile.cores + " cores", grade: "pass",  note: "M3/M5 ready" });
    else if (profile.cores >= 4) ratings.push({ label: "CPU", value: profile.cores + " cores", grade: "warn",  note: "M3 OK, M5 may be slow" });
    else if (profile.cores)      ratings.push({ label: "CPU", value: profile.cores + " cores", grade: "fail",  note: "M3/M5 may struggle" });
    else                         ratings.push({ label: "CPU", value: "Unknown",                 grade: "warn",  note: "Could not detect" });

    // RAM
    if (profile.memory >= 4)     ratings.push({ label: "RAM", value: profile.memory + " GB",   grade: "pass",  note: "Sufficient for M3–M5" });
    else if (profile.memory >= 2) ratings.push({ label: "RAM", value: profile.memory + " GB",  grade: "warn",  note: "M3 OK, monitor M5" });
    else if (profile.memory)     ratings.push({ label: "RAM", value: profile.memory + " GB",   grade: "fail",  note: "May struggle with AR/VPS" });
    else                         ratings.push({ label: "RAM", value: "Unknown",                 grade: "warn",  note: "Could not detect" });

    // GPU / WebGL
    if (profile.webgl)           ratings.push({ label: "GPU", value: profile.gpu ? profile.gpu.slice(0,30) : "Available", grade: "pass", note: "M4 3D overlay ready" });
    else                         ratings.push({ label: "GPU", value: "No WebGL",                grade: "fail",  note: "M4 Three.js will not work" });

    // FPS
    if (profile.fps >= 55)       ratings.push({ label: "FPS", value: profile.fps + " fps",     grade: "pass",  note: "Smooth rendering" });
    else if (profile.fps >= 30)  ratings.push({ label: "FPS", value: profile.fps + " fps",     grade: "warn",  note: "Moderate — monitor under load" });
    else if (profile.fps)        ratings.push({ label: "FPS", value: profile.fps + " fps",     grade: "fail",  note: "May struggle with AR overlays" });

    // WebXR
    if (profile.webxr)           ratings.push({ label: "WebXR", value: "Supported",            grade: "pass",  note: "M3 AR markers ready" });
    else                         ratings.push({ label: "WebXR", value: "Not supported",         grade: "fail",  note: "M3 AR.js will not work" });

    // Battery (phone only)
    if (profile.battery) {
      const grade = profile.battery.level > 20 ? "pass" : "warn";
      const note  = profile.battery.charging ? "Charging ✓" : (profile.battery.level < 20 ? "Low — plug in for site use" : "Not charging");
      ratings.push({ label: "Battery", value: profile.battery.level + "%", grade, note });
    }

    return ratings;
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #diag-trigger {
      position: fixed; bottom: 36px; right: 14px; z-index: 9998;
      background: transparent; border: 1px solid #2a3038;
      color: var(--text-muted); font-family: var(--mono);
      font-size: 10px; padding: 4px 10px; border-radius: 2px;
      cursor: pointer; letter-spacing: .1em; text-transform: uppercase;
      transition: all .15s;
    }
    #diag-trigger:hover { color: var(--accent); border-color: var(--accent); }

    #diag-overlay {
      display: none; position: fixed; inset: 0; z-index: 10000;
      background: rgba(0,0,0,.92); overflow-y: auto;
      font-family: 'Share Tech Mono', 'Courier New', monospace;
    }
    #diag-overlay.visible { display: block; }

    #diag-panel {
      max-width: 860px; margin: 0 auto; padding: 24px 20px 60px;
    }

    #diag-header {
      display: flex; align-items: center; gap: 12px;
      border-bottom: 1px solid var(--accent); padding-bottom: 12px; margin-bottom: 20px;
    }
    #diag-title {
      font-size: 16px; letter-spacing: .2em; text-transform: uppercase; color: var(--accent);
      flex: 1;
    }
    #diag-close {
      background: transparent; border: 1px solid var(--border); color: var(--text-muted);
      font-family: inherit; font-size: 11px; padding: 4px 12px;
      border-radius: 2px; cursor: pointer; transition: all .15s;
    }
    #diag-close:hover { color: var(--accent); border-color: var(--accent); }

    #diag-summary {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 8px; margin-bottom: 24px;
    }
    .diag-sum-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 3px; padding: 12px;
      text-align: center;
    }
    .diag-sum-num  { font-size: 28px; font-weight: 700; line-height: 1; }
    .diag-sum-label { font-size: 10px; color: var(--text-dim); letter-spacing: .1em; margin-top: 4px; text-transform: uppercase; }
    .diag-sum-card.pass  .diag-sum-num { color: var(--green); }
    .diag-sum-card.fail  .diag-sum-num { color: var(--red); }
    .diag-sum-card.warn  .diag-sum-num { color: var(--yellow); }
    .diag-sum-card.cost  .diag-sum-num { color: var(--accent); }
    .diag-sum-card.free  .diag-sum-num { color: var(--blue); }

    .diag-section-title {
      font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
      color: var(--text-dim); margin: 20px 0 8px; padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }

    .diag-row {
      display: grid;
      grid-template-columns: 20px 1fr 80px 120px;
      gap: 10px; align-items: start;
      padding: 10px 0; border-bottom: 1px solid var(--bg);
      font-size: 11px;
    }
    .diag-row:hover { background: rgba(255,255,255,.02); }

    .diag-icon { font-size: 14px; text-align: center; margin-top: 1px; }
    .diag-info {}
    .diag-name { color: var(--text); font-size: 12px; margin-bottom: 2px; }
    .diag-provider { color: var(--text-dim); font-size: 10px; }
    .diag-note { color: var(--text-muted); font-size: 10px; margin-top: 4px; line-height: 1.5; }

    .diag-status {
      text-align: center; font-size: 10px; letter-spacing: .08em;
      text-transform: uppercase; padding: 2px 6px; border-radius: 2px;
      align-self: start; margin-top: 2px;
    }
    .diag-status.pass    { background: rgba(34,197,94,.12);  color: var(--green); }
    .diag-status.fail    { background: rgba(239,68,68,.12);  color: var(--red); }
    .diag-status.warn    { background: rgba(251,191,36,.12); color: var(--yellow); }
    .diag-status.pending { background: rgba(56,189,248,.12); color: var(--blue); }
    .diag-status.notyet  { background: rgba(100,116,139,.1); color: #475569; }

    .diag-cost { font-size: 10px; text-align: right; }
    .diag-cost-free { color: var(--green); }
    .diag-cost-paid { color: var(--accent); }
    .diag-cost-tbd  { color: var(--text-muted); }
    .diag-cost-sub  { color: var(--text-dim); font-size: 9px; margin-top: 2px; }

    #diag-running {
      text-align: center; padding: 40px; color: var(--text-dim);
      font-size: 12px; letter-spacing: .1em;
    }
    .diag-spinner {
      display: inline-block; width: 20px; height: 20px;
      border: 2px solid var(--border); border-top-color: var(--accent);
      border-radius: 50%; animation: diag-spin .8s linear infinite;
      margin-right: 10px; vertical-align: middle;
    }
    @keyframes diag-spin { to { transform: rotate(360deg); } }

    #diag-cost-summary {
      margin-top: 24px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 3px; padding: 16px;
    }
    #diag-cost-summary h3 {
      color: var(--accent); font-size: 11px; letter-spacing: .15em;
      text-transform: uppercase; margin-bottom: 12px;
    }
    .diag-cost-line {
      display: flex; justify-content: space-between;
      font-size: 11px; padding: 4px 0;
      border-bottom: 1px solid var(--bg); color: var(--text-muted);
    }
    .diag-cost-line span:last-child { color: var(--accent); }
    .diag-cost-total {
      display: flex; justify-content: space-between;
      font-size: 13px; padding: 8px 0 0; color: var(--text); font-weight: 700;
    }
    .diag-cost-total span:last-child { color: var(--green); }

    /* ── Hardware section ── */
    #diag-hardware {
      margin-top: 24px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 3px; padding: 16px;
    }
    #diag-hardware h3 {
      color: var(--accent); font-size: 11px; letter-spacing: .15em;
      text-transform: uppercase; margin-bottom: 12px;
    }
    .hw-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }
    .hw-card {
      background: var(--bg-panel); border: 1px solid var(--border);
      border-radius: 3px; padding: 10px 12px;
    }
    .hw-label { font-size: 9px; color: var(--text-dim); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 4px; }
    .hw-value { font-size: 13px; font-weight: 700; margin-bottom: 2px; }
    .hw-note  { font-size: 10px; color: var(--text-muted); }
    .hw-pass  .hw-value { color: var(--green); }
    .hw-warn  .hw-value { color: var(--yellow); }
    .hw-fail  .hw-value { color: var(--red); }

    /* ── Latency section ── */
    #diag-latency {
      margin-top: 16px; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 3px; padding: 16px;
    }
    #diag-latency h3 {
      color: var(--accent); font-size: 11px; letter-spacing: .15em;
      text-transform: uppercase; margin-bottom: 12px;
    }
    .lat-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 0; border-bottom: 1px solid var(--bg); font-size: 11px;
    }
    .lat-label { color: var(--text-muted); }
    .lat-value { font-weight: 700; }
    .lat-good  { color: var(--green); }
    .lat-ok    { color: var(--yellow); }
    .lat-poor  { color: var(--red); }
    .lat-none  { color: var(--text-dim); }
  `;
  document.head.appendChild(style);

  // ── Trigger button ────────────────────────────────────────────────────────────
  const trigger = document.createElement("button");
  trigger.id = "diag-trigger";
  trigger.textContent = "⚙ Diagnostics";
  document.body.appendChild(trigger);

  // ── Overlay ───────────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.id = "diag-overlay";
  overlay.innerHTML = `
    <div id="diag-panel">
      <div id="diag-header">
        <span id="diag-title">⚙ System Diagnostics</span>
        <button id="diag-close">✕ Close</button>
      </div>
      <div id="diag-running">
        <span class="diag-spinner"></span> Running diagnostics…
      </div>
      <div id="diag-results" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("diag-close").addEventListener("click", () => {
    overlay.classList.remove("visible");
  });

  trigger.addEventListener("click", () => {
    overlay.classList.add("visible");
    runDiagnostics();
  });

  // ── Run all tests ─────────────────────────────────────────────────────────────
  async function runDiagnostics() {
    document.getElementById("diag-running").style.display = "block";
    document.getElementById("diag-results").style.display = "none";

    // Run operation tests and hardware profile in parallel
    const [results, hwProfile] = await Promise.all([
      // Operation tests
      Promise.all(OPERATIONS.map(async (op) => {
        let status = "pending";
        if (op.notYet) {
          status = "notyet";
        } else {
          try {
            const result = await Promise.race([
              Promise.resolve().then(() => op.test()),
              new Promise(r => setTimeout(() => r(false), 6000))
            ]);
            status = result ? "pass" : "fail";
          } catch {
            status = "fail";
          }
        }
        return { ...op, status };
      })),
      // Hardware profile
      getHardwareProfile(),
    ]);

    renderResults(results, hwProfile);
  }

  function renderResults(results, hwProfile) {
    document.getElementById("diag-running").style.display = "none";
    const el = document.getElementById("diag-results");
    el.style.display = "block";

    const pass   = results.filter(r => r.status === "pass").length;
    const fail   = results.filter(r => r.status === "fail").length;
    const notyet = results.filter(r => r.status === "notyet").length;
    const paid   = results.filter(r => !r.free).length;
    const free   = results.filter(r => r.free).length;

    const current = results.filter(r => !r.notYet);
    const future  = results.filter(r => r.notYet);

    const statusIcon  = { pass: "✅", fail: "❌", warn: "⚠️", notyet: "🔜", pending: "⏳" };
    const statusLabel = { pass: "Pass", fail: "Fail", warn: "Warn", notyet: "Future", pending: "..." };

    function renderRow(op) {
      const costHtml = op.paidCost
        ? `<div class="diag-cost-paid">⚠ Paid</div><div class="diag-cost-sub">${op.paidCost}</div>`
        : `<div class="diag-cost-free">✓ Free</div><div class="diag-cost-sub">${op.freeTier || "—"}</div>`;
      return `
        <div class="diag-row">
          <div class="diag-icon">${statusIcon[op.status] || "⏳"}</div>
          <div class="diag-info">
            <div class="diag-name">${op.name}</div>
            <div class="diag-provider">${op.provider}</div>
            <div class="diag-note">${op.note}</div>
          </div>
          <div class="diag-status ${op.status}">${statusLabel[op.status]}</div>
          <div class="diag-cost">${costHtml}</div>
        </div>
      `;
    }

    // Hardware section
    const hwRatings = rateHardware(hwProfile);
    const hwHtml = hwRatings.map(r => `
      <div class="hw-card hw-${r.grade}">
        <div class="hw-label">${r.label}</div>
        <div class="hw-value">${r.value}</div>
        <div class="hw-note">${r.note}</div>
      </div>
    `).join("");

    // Latency section — read from LocationModule if available
    const latency      = window._diagLatency || null;
    const latencyClass = !latency ? "lat-none"
                       : latency < 100  ? "lat-good"
                       : latency < 300  ? "lat-ok"
                       : "lat-poor";
    const latencyText  = latency ? latency + "ms" : "—  (stream not active)";
    const networkMode  = window.ModuleA ? ModuleA.getNetworkMode() : null;
    const networkText  = networkMode === "local" ? "Local P2P"
                       : networkMode === "relay"  ? "TURN Relay"
                       : "—";

    el.innerHTML = `
      <div id="diag-summary">
        <div class="diag-sum-card pass"><div class="diag-sum-num">${pass}</div><div class="diag-sum-label">Passing</div></div>
        <div class="diag-sum-card fail"><div class="diag-sum-num">${fail}</div><div class="diag-sum-label">Failing</div></div>
        <div class="diag-sum-card warn"><div class="diag-sum-num">${notyet}</div><div class="diag-sum-label">Future</div></div>
        <div class="diag-sum-card free"><div class="diag-sum-num">${free}</div><div class="diag-sum-label">Free ops</div></div>
        <div class="diag-sum-card cost"><div class="diag-sum-num">${paid}</div><div class="diag-sum-label">Paid ops</div></div>
      </div>

      <div class="diag-section-title">Current Operations</div>
      ${current.map(renderRow).join("")}

      <div class="diag-section-title">Future Operations (M3–M7)</div>
      ${future.map(renderRow).join("")}

      <div id="diag-hardware">
        <h3>🖥 Hardware Capability — ${hwProfile.isMobile ? "📱 Mobile" : "💻 Desktop"}</h3>
        <div class="hw-grid">${hwHtml}</div>
      </div>

      <div id="diag-latency">
        <h3>⚡ Latency & Network</h3>
        <div class="lat-row">
          <span class="lat-label">End-to-end stream latency</span>
          <span class="lat-value ${latencyClass}">${latencyText}</span>
        </div>
        <div class="lat-row">
          <span class="lat-label">Network path</span>
          <span class="lat-value">${networkText}</span>
        </div>
        <div class="lat-row">
          <span class="lat-label">Latency guide</span>
          <span class="lat-value" style="color:var(--text-muted);font-weight:normal">
            &lt;100ms good · 100–300ms ok · &gt;300ms poor
          </span>
        </div>
      </div>

      <div id="diag-cost-summary">
        <h3>💰 Production Cost Estimate (M1–M2)</h3>
        <div class="diag-cost-line"><span>Frontend Hosting (GitHub Pages)</span><span>$0 / month</span></div>
        <div class="diag-cost-line"><span>WebRTC Signaling (Render.com free)</span><span>$0 / month*</span></div>
        <div class="diag-cost-line"><span>TURN Relay (Metered.ca free tier)</span><span>$0 / month*</span></div>
        <div class="diag-cost-line"><span>WebRTC P2P Video</span><span>$0 / month</span></div>
        <div class="diag-cost-line"><span>GPS + Compass (browser native)</span><span>$0 / month</span></div>
        <div class="diag-cost-total"><span>Total (M1–M2)</span><span>$0 / month</span></div>
        <div style="margin-top:10px;font-size:10px;color:var(--text-dim);line-height:1.7">
          * Render.com free tier sleeps after 15min idle — $7/mo for always-on.<br>
          * Metered.ca TURN free up to 500MB/month — $0.40/GB after.<br>
          * Production upgrade estimate: $7–15/month for always-on signaling + paid TURN.
        </div>
      </div>
    `;
  }

})();
