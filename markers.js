/**
 * markers.js — Visual Marker Detection Module
 * Construction Camera System — M3
 *
 * M3: QR code detection only (jsQR)
 * M5: ArUco marker detection added when Vite build system
 *     is introduced and js-aruco2 bundled as npm package.
 *
 * CPU strategy:
 *   - Scans at CONFIG.MARKERS.scanIntervalMs (200ms = 5fps)
 *   - Scales frame to CONFIG.MARKERS.canvasScale (0.5 = half res)
 *   - Pauses when page is hidden (visibilitychange)
 *
 * Data channel message format:
 * {
 *   type:      "markers",
 *   timestamp: 1712345678000,
 *   markers: [
 *     {
 *       id:      "SITE-COL-A1",
 *       kind:    "qr",
 *       label:   "Column A1 — Grid Ref 1.1",
 *       corners: [{ x, y }, { x, y }, { x, y }, { x, y }],
 *       center:  { x, y },
 *       // Future placeholders
 *       pose3d:   null,   // M5 — Multiset VPS 6-DoF pose
 *       anchorId: null,   // M5 — Multiset spatial anchor
 *       bimRef:   null,   // M6 — BIM element reference
 *     }
 *   ]
 * }
 */

const MarkersModule = (function () {

  // ── State ─────────────────────────────────────────────────────────────────────
  let _role           = null;
  let _dataChannel    = null;
  let _videoEl        = null;
  let _scanCanvas     = null;
  let _scanCtx        = null;
  let _overlayCanvas  = null;
  let _overlayCtx     = null;
  let _active         = false;
  let _scanTimer      = null;
  let _overlayVisible = false;
  let _lastMarkers    = [];

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init(role) {
    _role = role;

    if (role === "sender") _injectSenderIndicator();
    if (role === "viewer") {
      _injectViewerOverlay();
      _injectToggleButton();
    }

    // Pause when tab hidden — saves phone battery
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) _pauseScan();
      else if (_active)    _resumeScan();
    });

    // Check jsQR loaded
    if (typeof jsQR === "undefined") {
      _log("jsQR not loaded — QR detection unavailable", "warn");
    } else {
      _log("jsQR ready ✓");
    }

    _log("Markers module initialised — role: " + role);
  }

  // ── Start / stop ──────────────────────────────────────────────────────────────
  function startScanning(videoElement) {
    if (_role !== "sender") return;
    if (typeof jsQR === "undefined") {
      _log("jsQR not available — skipping scan start", "warn");
      return;
    }
    _videoEl = videoElement;
    _active  = true;
    _scanCanvas = document.createElement("canvas");
    _scanCtx    = _scanCanvas.getContext("2d", { willReadFrequently: true });
    _scheduleScan();
    _log("QR scanning started");
  }

  function stopScanning() {
    _active = false;
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
    _clearSenderIndicator();
    _log("QR scanning stopped");
  }

  function _pauseScan() {
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
  }

  function _resumeScan() {
    if (_active && !_scanTimer) _scheduleScan();
  }

  function _scheduleScan() {
    if (!_active) return;
    _scanTimer = setTimeout(() => {
      _scanFrame();
      _scheduleScan();
    }, CONFIG.MARKERS.scanIntervalMs);
  }

  // ── Frame scanning ────────────────────────────────────────────────────────────
  function _scanFrame() {
    if (!_videoEl || _videoEl.readyState < 2) return;
    const vw = _videoEl.videoWidth;
    const vh = _videoEl.videoHeight;
    if (!vw || !vh) return;

    const scale = CONFIG.MARKERS.canvasScale;
    const sw    = Math.floor(vw * scale);
    const sh    = Math.floor(vh * scale);

    _scanCanvas.width  = sw;
    _scanCanvas.height = sh;
    _scanCtx.drawImage(_videoEl, 0, 0, sw, sh);

    const imageData = _scanCtx.getImageData(0, 0, sw, sh);
    const found     = [];

    // ── QR detection ─────────────────────────────────────────────────────────
    try {
      const qr = jsQR(imageData.data, sw, sh, {
        inversionAttempts: "dontInvert",
      });
      if (qr) {
        const corners = [
          qr.location.topLeftCorner,
          qr.location.topRightCorner,
          qr.location.bottomRightCorner,
          qr.location.bottomLeftCorner,
        ].map(c => ({
          x: Math.round(c.x / scale),
          y: Math.round(c.y / scale),
        }));

        found.push({
          id:       qr.data,
          kind:     "qr",
          label:    _getLabel(qr.data),
          corners,
          center:   _centroid(corners),
          // Future placeholders (M5, M6)
          pose3d:   null,
          anchorId: null,
          bimRef:   null,
        });

        _log("QR detected: " + qr.data);
      }
    } catch (e) {
      _log("QR scan error: " + e.message, "warn");
    }

    // ── ArUco placeholder (M5) ────────────────────────────────────────────────
    // ArUco detection added at M5 using js-aruco2 via Vite npm bundle.
    // window.dispatchEvent(new CustomEvent("aruco-ready")) will trigger init.

    if (found.length > 0) {
      _updateSenderIndicator(found);
      _transmit(found);
    } else {
      _clearSenderIndicator();
    }
  }

  // ── Data channel ──────────────────────────────────────────────────────────────
  function attachDataChannel(channel) {
    _dataChannel = channel;
    _log("Markers data channel attached");
    channel.onopen  = () => _log("Markers data channel open ✓", "success");
    channel.onclose = () => _log("Markers data channel closed", "warn");
    channel.onerror = (e) => _log("Markers data channel error: " + e.message, "error");
  }

  function onDataChannel(event) {
    if (event.channel.label !== "markers") return;
    const channel = event.channel;
    _log("Markers data channel received");

    channel.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "markers") {
          _lastMarkers = msg.markers;
          _drawOverlay(msg.markers);
          // Dispatch for future modules (M5 VPS, M6 BIM)
          window.dispatchEvent(new CustomEvent("markers-update", { detail: msg.markers }));
        }
      } catch { _log("Invalid markers message", "warn"); }
    };

    channel.onopen  = () => _log("Markers data channel open (viewer) ✓", "success");
    channel.onclose = () => { _log("Markers data channel closed", "warn"); _clearOverlay(); };
  }

  function _transmit(markers) {
    if (!_dataChannel || _dataChannel.readyState !== "open") return;
    _dataChannel.send(JSON.stringify({
      type:      "markers",
      timestamp: Date.now(),
      markers,
    }));
  }

  // ── Sender indicator ──────────────────────────────────────────────────────────
  function _injectSenderIndicator() {
    const panel = document.querySelector(".video-panel");
    if (!panel) return;
    const el    = document.createElement("div");
    el.id       = "marker-indicator";
    el.style.cssText = `
      display: none; position: absolute; top: 36px; left: 10px; z-index: 5;
      background: rgba(0,0,0,0.65); border: 1px solid rgba(34,197,94,0.5);
      border-radius: var(--radius,4px); padding: 4px 10px;
      font-family: var(--mono,monospace); font-size: 10px;
      color: var(--green,#22c55e); pointer-events: none;
    `;
    el.textContent = "◉ QR detected";
    panel.appendChild(el);
  }

  function _updateSenderIndicator(markers) {
    const el = document.getElementById("marker-indicator");
    if (!el) return;
    el.style.display = "block";
    el.textContent   = "◉ " + markers.length + " QR code" + (markers.length > 1 ? "s" : "") + " detected";
  }

  function _clearSenderIndicator() {
    const el = document.getElementById("marker-indicator");
    if (el) el.style.display = "none";
  }

  // ── Viewer overlay ────────────────────────────────────────────────────────────
  function _injectViewerOverlay() {
    const wrap = document.querySelector(".video-wrap");
    if (!wrap) return;
    _overlayCanvas           = document.createElement("canvas");
    _overlayCanvas.id        = "marker-overlay-canvas";
    _overlayCanvas.style.cssText = `
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 6; display: none;
    `;
    wrap.appendChild(_overlayCanvas);
    _overlayCtx = _overlayCanvas.getContext("2d");
    const ro    = new ResizeObserver(() => _resizeOverlayCanvas());
    ro.observe(wrap);
  }

  function _resizeOverlayCanvas() {
    const wrap = document.querySelector(".video-wrap");
    if (!wrap || !_overlayCanvas) return;
    _overlayCanvas.width  = wrap.clientWidth;
    _overlayCanvas.height = wrap.clientHeight;
    if (_lastMarkers.length > 0) _drawOverlay(_lastMarkers);
  }

  function _injectToggleButton() {
    const controls = document.querySelector(".controls");
    if (!controls) return;
    const btn       = document.createElement("button");
    btn.id          = "markers-toggle-btn";
    btn.className   = "btn";
    btn.textContent = "◉ Markers";
    btn.addEventListener("click", toggleOverlay);
    controls.appendChild(btn);
  }

  function toggleOverlay() {
    _overlayVisible = !_overlayVisible;
    if (_overlayCanvas) _overlayCanvas.style.display = _overlayVisible ? "block" : "none";
    const btn = document.getElementById("markers-toggle-btn");
    if (btn) {
      btn.style.color       = _overlayVisible ? "var(--green)" : "";
      btn.style.borderColor = _overlayVisible ? "var(--green)" : "";
    }
    if (_overlayVisible && _lastMarkers.length > 0) _drawOverlay(_lastMarkers);
    else _clearOverlay();
  }

  function _drawOverlay(markers) {
    if (!_overlayCtx || !_overlayVisible) return;
    const cw    = _overlayCanvas.width;
    const ch    = _overlayCanvas.height;
    _overlayCtx.clearRect(0, 0, cw, ch);

    const video = document.getElementById("remoteVideo");
    if (!video || !video.videoWidth) return;

    const scaleX = cw / video.videoWidth;
    const scaleY = ch / video.videoHeight;

    markers.forEach(m => {
      const corners = m.corners.map(c => ({
        x: c.x * scaleX,
        y: c.y * scaleY,
      }));
      const center = { x: m.center.x * scaleX, y: m.center.y * scaleY };

      // Bounding box
      _overlayCtx.strokeStyle = "#f59e0b";
      _overlayCtx.lineWidth   = 2;
      _overlayCtx.beginPath();
      _overlayCtx.moveTo(corners[0].x, corners[0].y);
      corners.forEach(c => _overlayCtx.lineTo(c.x, c.y));
      _overlayCtx.closePath();
      _overlayCtx.stroke();

      // Corner dots
      corners.forEach(c => {
        _overlayCtx.fillStyle = "#f59e0b";
        _overlayCtx.beginPath();
        _overlayCtx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        _overlayCtx.fill();
      });

      // Label box
      const labelText = m.label || m.id;
      const idText    = "[QR] " + m.id.slice(0, 20) + (m.id.length > 20 ? "…" : "");
      _overlayCtx.font = "11px 'Share Tech Mono', monospace";
      const labelW    = Math.max(
        _overlayCtx.measureText(labelText).width,
        _overlayCtx.measureText(idText).width
      ) + 16;
      const labelH    = 40;
      const labelX    = Math.min(Math.max(center.x - labelW / 2, 4), cw - labelW - 4);
      const labelY    = Math.max(center.y - 50, 4);

      _overlayCtx.fillStyle = "rgba(0,0,0,0.75)";
      _overlayCtx.fillRect(labelX, labelY, labelW, labelH);
      _overlayCtx.strokeStyle = "#f59e0b";
      _overlayCtx.lineWidth   = 1;
      _overlayCtx.strokeRect(labelX, labelY, labelW, labelH);

      _overlayCtx.fillStyle = "#f59e0b";
      _overlayCtx.font      = "10px 'Share Tech Mono', monospace";
      _overlayCtx.fillText(idText, labelX + 8, labelY + 14);

      _overlayCtx.fillStyle = "#d4dde6";
      _overlayCtx.font      = "bold 11px 'Share Tech Mono', monospace";
      _overlayCtx.fillText(labelText, labelX + 8, labelY + 30);
    });
  }

  function _clearOverlay() {
    if (_overlayCtx && _overlayCanvas) {
      _overlayCtx.clearRect(0, 0, _overlayCanvas.width, _overlayCanvas.height);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function _getLabel(id) {
    return CONFIG.MARKERS.labels[id] || CONFIG.MARKERS.defaultLabel;
  }

  function _centroid(corners) {
    return {
      x: Math.round(corners.reduce((s, c) => s + c.x, 0) / corners.length),
      y: Math.round(corners.reduce((s, c) => s + c.y, 0) / corners.length),
    };
  }

  function _log(msg, type) {
    if (window.debugLog) window.debugLog("Markers: " + msg, type || "info");
    else console.log("[Markers]", msg);
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    init,
    startScanning,
    stopScanning,
    attachDataChannel,
    onDataChannel,
    toggleOverlay,
    getLastMarkers: () => [..._lastMarkers],
  };

})();
