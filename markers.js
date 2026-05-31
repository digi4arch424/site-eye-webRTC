/**
 * markers.js — Visual Marker Detection Module
 * Construction Camera System — M3
 *
 * Detects QR codes and ArUco markers from the sender camera feed.
 * Transmits detections to viewer via WebRTC data channel.
 * Viewer displays marker ID, position, and custom label as overlay.
 *
 * Libraries (loaded from vendor-js repo):
 *   jsQR v1.4.0     — QR code detection
 *   js-aruco2       — ArUco marker detection
 *
 * CPU strategy:
 *   - Scans at CONFIG.MARKERS.scanIntervalMs (default 200ms = 5fps)
 *   - Scales frame to CONFIG.MARKERS.canvasScale before scanning
 *   - Uses requestAnimationFrame only when streaming is active
 *   - Pauses automatically when page is hidden (visibilitychange)
 *
 * Data channel message format:
 * {
 *   type:      "markers",
 *   timestamp: 1712345678000,
 *   markers: [
 *     {
 *       id:         "SITE-COL-A3",
 *       kind:       "qr | aruco",
 *       label:      "Column A3 — Grid Ref 4.2",
 *       confidence: 0.94,
 *       corners: [
 *         { x: 120, y: 240 },
 *         { x: 180, y: 240 },
 *         { x: 180, y: 300 },
 *         { x: 120, y: 300 },
 *       ],
 *       center: { x: 150, y: 270 },
 *     }
 *   ]
 * }
 *
 * Future placeholder slots:
 *   pose3d    (M5) — 6-DoF pose from Multiset VPS
 *   anchorId  (M5) — Multiset spatial anchor ID
 *   bimRef    (M6) — BIM element reference
 */

const MarkersModule = (function () {

  // ── State ─────────────────────────────────────────────────────────────────────
  let _role          = null;   // "sender" | "viewer"
  let _dataChannel   = null;
  let _videoEl       = null;   // sender local video element
  let _scanCanvas    = null;   // offscreen canvas for frame capture
  let _scanCtx       = null;
  let _overlayCanvas = null;   // viewer overlay canvas
  let _overlayCtx    = null;
  let _detector      = null;   // js-aruco2 AR.Detector instance
  let _active        = false;
  let _scanTimer     = null;
  let _overlayVisible = false;
  let _lastMarkers   = [];     // last detected markers for overlay redraw

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init(role) {
    _role = role;

    if (role === "sender") {
      _initDetector();
      _injectSenderIndicator();
    }

    if (role === "viewer") {
      _injectViewerOverlay();
      _injectToggleButton();
    }

    // Pause scanning when tab is hidden — saves phone battery
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) _pauseScan();
      else if (_active)    _resumeScan();
    });

    _log("Markers module initialised — role: " + role);
  }

  // ── ArUco detector ────────────────────────────────────────────────────────────
  function _initDetector() {
    try {
      if (typeof AR === "undefined") {
        _log("js-aruco2 not loaded — ArUco detection unavailable", "warn");
        return;
      }
      _detector = new AR.Detector({
        dictionaryName: CONFIG.MARKERS.arucoDictionary,
      });
      _log("ArUco detector ready — dictionary: " + CONFIG.MARKERS.arucoDictionary);
    } catch (e) {
      _log("ArUco detector init failed: " + e.message, "warn");
    }
  }

  // ── Start / stop scanning (sender) ────────────────────────────────────────────
  function startScanning(videoElement) {
    if (_role !== "sender") return;
    _videoEl = videoElement;
    _active  = true;

    // Create offscreen scan canvas
    _scanCanvas = document.createElement("canvas");
    _scanCtx    = _scanCanvas.getContext("2d", { willReadFrequently: true });

    _scheduleScan();
    _log("Marker scanning started");
  }

  function stopScanning() {
    _active = false;
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
    _log("Marker scanning stopped");
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

    // Scale canvas for performance
    const scale = CONFIG.MARKERS.canvasScale;
    const sw    = Math.floor(vw * scale);
    const sh    = Math.floor(vh * scale);

    _scanCanvas.width  = sw;
    _scanCanvas.height = sh;
    _scanCtx.drawImage(_videoEl, 0, 0, sw, sh);

    const imageData = _scanCtx.getImageData(0, 0, sw, sh);
    const found     = [];

    // ── QR detection (jsQR) ───────────────────────────────────────────────────
    try {
      if (typeof jsQR !== "undefined") {
        const qr = jsQR(imageData.data, sw, sh, {
          inversionAttempts: "dontInvert",
        });
        if (qr) {
          const corners = [
            qr.location.topLeftCorner,
            qr.location.topRightCorner,
            qr.location.bottomRightCorner,
            qr.location.bottomLeftCorner,
          ].map(c => ({ x: Math.round(c.x / scale), y: Math.round(c.y / scale) }));

          found.push({
            id:         qr.data,
            kind:       "qr",
            label:      _getLabel(qr.data),
            confidence: 1.0,
            corners,
            center:     _centroid(corners),
            // Future placeholders
            pose3d:   null,
            anchorId: null,
            bimRef:   null,
          });
        }
      }
    } catch (e) { _log("QR scan error: " + e.message, "warn"); }

    // ── ArUco detection (js-aruco2) ───────────────────────────────────────────
    try {
      if (_detector) {
        const markers = _detector.detect(imageData);
        markers.forEach(m => {
          const corners = m.corners.map(c => ({
            x: Math.round(c.x / scale),
            y: Math.round(c.y / scale),
          }));
          const id = String(m.id);
          found.push({
            id,
            kind:       "aruco",
            label:      _getLabel(id),
            confidence: CONFIG.MARKERS.confidenceMin, // aruco2 doesn't return confidence
            corners,
            center:     _centroid(corners),
            pose3d:   null,
            anchorId: null,
            bimRef:   null,
          });
        });
      }
    } catch (e) { _log("ArUco scan error: " + e.message, "warn"); }

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
          // Dispatch event for future modules (M5 VPS, M6 BIM)
          window.dispatchEvent(new CustomEvent("markers-update", { detail: msg.markers }));
        }
      } catch { _log("Invalid markers message", "warn"); }
    };

    channel.onopen  = () => _log("Markers data channel open (viewer) ✓", "success");
    channel.onclose = () => {
      _log("Markers data channel closed (viewer)", "warn");
      _clearOverlay();
    };
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

    const indicator = document.createElement("div");
    indicator.id = "marker-indicator";
    indicator.style.cssText = `
      display: none;
      position: absolute;
      top: 36px; left: 10px;
      z-index: 5;
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(34,197,94,0.5);
      border-radius: var(--radius, 4px);
      padding: 4px 10px;
      font-family: var(--mono, monospace);
      font-size: 10px;
      color: var(--green, #22c55e);
      pointer-events: none;
    `;
    indicator.textContent = "◉ Marker detected";
    panel.appendChild(indicator);
  }

  function _updateSenderIndicator(markers) {
    const el = document.getElementById("marker-indicator");
    if (!el) return;
    el.style.display = "block";
    el.textContent   = "◉ " + markers.length + " marker" + (markers.length > 1 ? "s" : "") + " detected";
  }

  function _clearSenderIndicator() {
    const el = document.getElementById("marker-indicator");
    if (el) el.style.display = "none";
  }

  // ── Viewer overlay ────────────────────────────────────────────────────────────
  function _injectViewerOverlay() {
    const wrap = document.querySelector(".video-wrap");
    if (!wrap) return;

    _overlayCanvas        = document.createElement("canvas");
    _overlayCanvas.id     = "marker-overlay-canvas";
    _overlayCanvas.style.cssText = `
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 6;
      display: none;
    `;
    wrap.appendChild(_overlayCanvas);
    _overlayCtx = _overlayCanvas.getContext("2d");

    // Resize canvas when video resizes
    const ro = new ResizeObserver(() => _resizeOverlayCanvas());
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

    const btn = document.createElement("button");
    btn.id          = "markers-toggle-btn";
    btn.className   = "btn";
    btn.textContent = "◉ Markers";
    btn.addEventListener("click", toggleOverlay);
    controls.appendChild(btn);
  }

  function toggleOverlay() {
    _overlayVisible = !_overlayVisible;

    if (_overlayCanvas) {
      _overlayCanvas.style.display = _overlayVisible ? "block" : "none";
    }

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

    const cw = _overlayCanvas.width;
    const ch = _overlayCanvas.height;
    _overlayCtx.clearRect(0, 0, cw, ch);

    // Get video element dimensions to scale coordinates
    const video = document.getElementById("remoteVideo");
    if (!video || !video.videoWidth) return;

    const scaleX = cw / video.videoWidth;
    const scaleY = ch / video.videoHeight;

    markers.forEach(m => {
      const corners = m.corners.map(c => ({
        x: c.x * scaleX,
        y: c.y * scaleY,
      }));
      const center = {
        x: m.center.x * scaleX,
        y: m.center.y * scaleY,
      };

      // Draw bounding box
      const color = m.kind === "qr" ? "var(--accent, #f59e0b)" : "var(--blue, #38bdf8)";
      _overlayCtx.strokeStyle = m.kind === "qr" ? "#f59e0b" : "#38bdf8";
      _overlayCtx.lineWidth   = 2;
      _overlayCtx.beginPath();
      _overlayCtx.moveTo(corners[0].x, corners[0].y);
      corners.forEach(c => _overlayCtx.lineTo(c.x, c.y));
      _overlayCtx.closePath();
      _overlayCtx.stroke();

      // Draw corner dots
      corners.forEach(c => {
        _overlayCtx.fillStyle = m.kind === "qr" ? "#f59e0b" : "#38bdf8";
        _overlayCtx.beginPath();
        _overlayCtx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        _overlayCtx.fill();
      });

      // Draw label box
      const labelText = m.label || m.id;
      const idText    = "[" + m.kind.toUpperCase() + " " + m.id + "]";
      _overlayCtx.font         = "bold 12px 'Share Tech Mono', monospace";
      const labelW             = Math.max(
        _overlayCtx.measureText(labelText).width,
        _overlayCtx.measureText(idText).width
      ) + 16;
      const labelH             = 40;
      const labelX             = Math.min(center.x - labelW / 2, cw - labelW - 4);
      const labelY             = Math.max(center.y - 30, 4);

      // Background
      _overlayCtx.fillStyle = "rgba(0,0,0,0.75)";
      _overlayCtx.fillRect(labelX, labelY, labelW, labelH);

      // Border
      _overlayCtx.strokeStyle = m.kind === "qr" ? "#f59e0b" : "#38bdf8";
      _overlayCtx.lineWidth   = 1;
      _overlayCtx.strokeRect(labelX, labelY, labelW, labelH);

      // Label text
      _overlayCtx.fillStyle = m.kind === "qr" ? "#f59e0b" : "#38bdf8";
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
    const x = corners.reduce((s, c) => s + c.x, 0) / corners.length;
    const y = corners.reduce((s, c) => s + c.y, 0) / corners.length;
    return { x: Math.round(x), y: Math.round(y) };
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
