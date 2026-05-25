/**
 * location.js — GPS + Compass Metadata Module
 * Construction Camera System — M2
 *
 * Captures GPS coordinates and compass heading from the sender device.
 * Transmits to viewer via WebRTC data channel alongside the video stream.
 * Displays as a toggleable overlay on the video panel on both sender and viewer.
 *
 * All tuneable values live in CONFIG.GPS (config.js) — no magic numbers here.
 *
 * GPS strategy (two-phase):
 *   Phase 1 — fast fix (enableHighAccuracy: false) — quick position from cell/WiFi
 *   Phase 2 — precise fix (enableHighAccuracy: true) — full GPS after CONFIG.GPS.highAccuracyDelay
 *
 * Heading smoothing:
 *   Low-pass filter  — smooths sensor noise, handles 355°→5° wrap-around
 *   Deadband         — suppresses micro-fluctuations below CONFIG.GPS.deadbandDegrees
 *
 * Current (M2):
 *   - GPS coordinates (lat/lng)
 *   - Compass heading (degrees + cardinal point)
 *   - Accuracy (metres)
 *
 * Placeholder slots for future milestones:
 *   - altitude        (M3 — AR marker anchoring)
 *   - speed           (M4 — site movement tracking)
 *   - pitch / roll    (M5 — Multiset VPS 6-DoF)
 *   - siteAnchorId    (M5 — Multiset spatial anchor)
 *   - bimElementId    (M6 — BIM overlay target)
 *
 * Data channel message format:
 * {
 *   type:      "location",
 *   timestamp: 1712345678000,
 *   coords: {
 *     lat:         -25.2744,
 *     lng:         133.7751,
 *     accuracy:    5.2,
 *     heading:     247,
 *     altitude:    null,   // M3
 *     speed:       null,   // M4
 *     pitch:       null,   // M5
 *     roll:        null,   // M5
 *     siteAnchorId: null,  // M5
 *     bimElementId: null,  // M6
 *   }
 * }
 */

const LocationModule = (function () {

  // ── Read all tuneable values from CONFIG.GPS ──────────────────────────────────
  // No magic numbers in this file — all values come from config.js
  function _cfg() { return CONFIG.GPS; }

  // ── State ─────────────────────────────────────────────────────────────────────
  let _dataChannel      = null;
  let _watchId          = null;
  let _orientationBound = false;
  let _overlayVisible   = false;
  let _role             = null;
  let _intervalHandle   = null;
  let _phaseTimer       = null;
  let _gpsPhase         = 0;      // 0 = not started, 1 = fast, 2 = precise

  // Heading smoothing state
  let _smoothedHeading  = null;
  let _displayedHeading = null;

  // Last known position
  let _lastCoords = {
    lat:          null,
    lng:          null,
    accuracy:     null,
    heading:      null,
    // Future placeholders
    altitude:     null,
    speed:        null,
    pitch:        null,
    roll:         null,
    siteAnchorId: null,
    bimElementId: null,
  };

  // ── Init — called on DOMContentLoaded ────────────────────────────────────────
  function init(role) {
    _role = role;
    _injectOverlay();
    _injectToggleButton();

    if (role === "sender") {
      // Start compass immediately — no GPS or stream needed
      _startCompass();
      // Start GPS immediately — don't wait for stream
      _startGpsPhase1();
    }

    _log("Location module initialised — role: " + role);
  }

  // ── Two-phase GPS ─────────────────────────────────────────────────────────────

  function _startGpsPhase1() {
    if (!navigator.geolocation) {
      _log("Geolocation not supported", "warn");
      _setOverlayMessage("GPS not supported on this device");
      return;
    }

    _gpsPhase = 1;
    _log("GPS phase 1 — fast fix");
    _setOverlayMessage("Acquiring GPS…");

    _watchId = navigator.geolocation.watchPosition(
      _onPosition,
      _onGpsError,
      {
        enableHighAccuracy: false,           // fast fix from cell/WiFi
        timeout:            _cfg().watchTimeout,
        maximumAge:         _cfg().watchMaxAge,
      }
    );

    // After delay, upgrade to high accuracy
    _phaseTimer = setTimeout(_startGpsPhase2, _cfg().highAccuracyDelay);
  }

  function _startGpsPhase2() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }

    _gpsPhase = 2;
    _log("GPS phase 2 — high accuracy");

    _watchId = navigator.geolocation.watchPosition(
      _onPosition,
      _onGpsError,
      {
        enableHighAccuracy: true,            // full GPS precision
        timeout:            _cfg().watchTimeout,
        maximumAge:         _cfg().watchMaxAge,
      }
    );
  }

  function _onPosition(pos) {
    _lastCoords.lat      = pos.coords.latitude;
    _lastCoords.lng      = pos.coords.longitude;
    _lastCoords.accuracy = pos.coords.accuracy;
    _lastCoords.altitude = pos.coords.altitude;
    _lastCoords.speed    = pos.coords.speed;
    _updateOverlay(_lastCoords);
    _transmit();
  }

  function _onGpsError(err) {
    _log("GPS error: " + err.message, "warn");
    _setOverlayMessage("GPS unavailable — " + err.message);
  }

  // ── Compass ───────────────────────────────────────────────────────────────────
  function _startCompass() {
    if (_orientationBound) return;

    // iOS 13+ requires explicit permission request
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then(state => {
          if (state === "granted") _bindOrientation();
          else _log("Compass permission denied", "warn");
        })
        .catch(e => _log("Compass permission error: " + e.message, "warn"));
    } else {
      _bindOrientation();
    }
  }

  function _bindOrientation() {
    window.addEventListener("deviceorientationabsolute", _onOrientation, true);
    window.addEventListener("deviceorientation",         _onOrientation, true);
    _orientationBound = true;
    _log("Compass bound");
  }

  function _onOrientation(e) {
    let rawHeading = null;

    if (e.webkitCompassHeading !== undefined) {
      rawHeading = e.webkitCompassHeading;
    } else if (e.alpha !== null) {
      rawHeading = (360 - e.alpha) % 360;
    }

    if (rawHeading === null) return;

    // ── Low-pass filter (handles 355°→5° wrap-around) ────────────────────────
    if (_smoothedHeading === null) {
      _smoothedHeading = rawHeading;
    } else {
      let delta = rawHeading - _smoothedHeading;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      _smoothedHeading = (_smoothedHeading + _cfg().lowPassAlpha * delta + 360) % 360;
    }

    const rounded = Math.round(_smoothedHeading);

    // ── Deadband — only update if change exceeds threshold ───────────────────
    if (_displayedHeading === null ||
        Math.abs(rounded - _displayedHeading) >= _cfg().deadbandDegrees) {
      _displayedHeading   = rounded;
      _lastCoords.heading = rounded;
      _updateOverlay(_lastCoords);
      _transmit();
    }
  }

  // ── Data channel ──────────────────────────────────────────────────────────────

  function attachDataChannel(channel) {
    _dataChannel = channel;
    _log("Data channel attached");

    channel.onopen  = () => {
      _log("Location data channel open ✓", "success");
      // Start interval transmissions once channel is open
      if (_intervalHandle) clearInterval(_intervalHandle);
      _intervalHandle = setInterval(_transmit, _cfg().updateInterval);
    };
    channel.onclose = () => {
      _log("Location data channel closed", "warn");
      if (_intervalHandle) { clearInterval(_intervalHandle); _intervalHandle = null; }
    };
    channel.onerror = (e) => _log("Data channel error: " + e.message, "error");
  }

  function onDataChannel(event) {
    const channel = event.channel;
    _log("Location data channel received");

    channel.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "location") _updateOverlay(msg.coords);
      } catch {
        _log("Invalid data channel message", "warn");
      }
    };

    channel.onopen  = () => _log("Location data channel open (viewer) ✓", "success");
    channel.onclose = () => _log("Location data channel closed (viewer)", "warn");
  }

  function _transmit() {
    if (!_dataChannel || _dataChannel.readyState !== "open") return;
    _dataChannel.send(JSON.stringify({
      type:      "location",
      timestamp: Date.now(),
      coords:    { ..._lastCoords },
    }));
  }

  // ── Stop ──────────────────────────────────────────────────────────────────────
  function stopCapture() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
    if (_intervalHandle) { clearInterval(_intervalHandle); _intervalHandle = null; }
    if (_phaseTimer)     { clearTimeout(_phaseTimer);      _phaseTimer = null; }
    _smoothedHeading  = null;
    _displayedHeading = null;
    _gpsPhase         = 0;
    _log("Location capture stopped");
  }

  // ── Overlay ───────────────────────────────────────────────────────────────────
  function _injectOverlay() {
    const panel = document.querySelector(".video-panel");
    if (!panel) return;

    const overlay = document.createElement("div");
    overlay.id = "location-overlay";
    overlay.style.cssText = `
      display: none;
      position: absolute;
      bottom: 36px;
      left: 10px;
      z-index: 5;
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(245,158,11,0.4);
      border-radius: var(--radius, 4px);
      padding: 8px 12px;
      font-family: var(--mono, 'Share Tech Mono', monospace);
      font-size: 11px;
      line-height: 1.8;
      color: var(--text, #d4dde6);
      pointer-events: none;
      min-width: 200px;
    `;
    overlay.innerHTML = `
      <div style="color:var(--accent, #f59e0b);font-size:9px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px">
        📍 Location
      </div>
      <div id="loc-lat">LAT  Acquiring…</div>
      <div id="loc-lng">LNG  —</div>
      <div id="loc-heading">HDG  —</div>
      <div id="loc-accuracy" style="color:var(--text-muted, #5a6a78);font-size:10px">ACC  —</div>
      <!-- Future M3+ placeholders (hidden until implemented) -->
      <div id="loc-altitude"    style="display:none">ALT  —</div>
      <div id="loc-speed"       style="display:none">SPD  —</div>
      <div id="loc-anchor"      style="display:none">ANC  —</div>
      <div id="loc-bim"         style="display:none">BIM  —</div>
    `;
    panel.appendChild(overlay);
  }

  function _injectToggleButton() {
    const controls = document.querySelector(".controls");
    if (!controls) return;

    const btn = document.createElement("button");
    btn.id          = "location-toggle-btn";
    btn.className   = "btn";
    btn.textContent = "📍 Location";
    btn.addEventListener("click", toggleOverlay);
    controls.appendChild(btn);   // visible immediately — no GPS wait
  }

  function toggleOverlay() {
    const overlay = document.getElementById("location-overlay");
    if (!overlay) return;
    _overlayVisible = !_overlayVisible;
    overlay.style.display = _overlayVisible ? "block" : "none";
    const btn = document.getElementById("location-toggle-btn");
    if (btn) {
      btn.style.color       = _overlayVisible ? "var(--green)" : "";
      btn.style.borderColor = _overlayVisible ? "var(--green)" : "";
    }
  }

  function _setOverlayMessage(msg) {
    _set("loc-lat", msg);
    _set("loc-lng",      "");
    _set("loc-heading",  "");
    _set("loc-accuracy", "");
  }

  function _updateOverlay(coords) {
    if (!coords) return;

    if (coords.lat !== null) {
      _set("loc-lat",      "LAT  " + coords.lat.toFixed(6));
      _set("loc-lng",      "LNG  " + coords.lng.toFixed(6));
    }
    if (coords.heading !== null) {
      _set("loc-heading",  "HDG  " + coords.heading + "° " + _compassPoint(coords.heading));
    }
    if (coords.accuracy !== null) {
      _set("loc-accuracy", "ACC  ±" + Math.round(coords.accuracy) + "m");
    }

    // Dispatch event for future modules (M3+)
    window.dispatchEvent(new CustomEvent("location-update", { detail: coords }));
  }

  function _compassPoint(deg) {
    const points = ["N","NE","E","SE","S","SW","W","NW","N"];
    return points[Math.round(deg / 45) % 8];
  }

  function _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _log(msg, type) {
    if (window.debugLog) window.debugLog("Location: " + msg, type || "info");
    else console.log("[Location]", msg);
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    init,
    stopCapture,
    attachDataChannel,
    onDataChannel,
    toggleOverlay,
    getLastCoords: () => ({ ..._lastCoords }),
  };

})();
