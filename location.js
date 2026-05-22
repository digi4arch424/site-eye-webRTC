/**
 * location.js — GPS + Compass Metadata Module
 * Construction Camera System — M2
 *
 * Captures GPS coordinates and compass heading from the sender device.
 * Transmits to viewer via WebRTC data channel alongside the video stream.
 * Displays as an overlay on the video panel on both sender and viewer.
 *
 * Current (M2):
 *   - GPS coordinates (lat/lng)
 *   - Compass heading (degrees)
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
 *     lat:      -25.2744,
 *     lng:      133.7751,
 *     accuracy: 5.2,        // metres
 *     heading:  247.3,      // degrees from north (0-360)
 *     // ── Future placeholders ──
 *     altitude:    null,    // M3
 *     speed:       null,    // M4
 *     pitch:       null,    // M5
 *     roll:        null,    // M5
 *     siteAnchorId: null,   // M5
 *     bimElementId: null,   // M6
 *   }
 * }
 */

const LocationModule = (function () {

  const UPDATE_INTERVAL = 2000; // ms between GPS updates

  let _dataChannel      = null;
  let _watchId          = null;
  let _orientationBound = false;
  let _heading          = null;
  let _overlayVisible   = false;
  let _role             = null;  // "sender" | "viewer"
  let _intervalHandle   = null;

  // Last known position
  let _lastCoords = {
    lat:         null,
    lng:         null,
    accuracy:    null,
    heading:     null,
    // Future placeholders
    altitude:    null,
    speed:       null,
    pitch:       null,
    roll:        null,
    siteAnchorId: null,
    bimElementId: null,
  };

  // ── Init ──────────────────────────────────────────────────────────────────────
  function init(role) {
    _role = role;
    _injectOverlay();
    _injectToggleButton();
    _log("Location module initialised — role: " + role);
  }

  // ── Sender: start capturing GPS + compass ─────────────────────────────────────
  function startCapture() {
    if (_role !== "sender") return;

    // GPS
    if (!navigator.geolocation) {
      _log("Geolocation not supported on this device", "warn");
      _updateOverlay({ error: "GPS not supported" });
      return;
    }

    _watchId = navigator.geolocation.watchPosition(
      (pos) => {
        _lastCoords.lat      = pos.coords.latitude;
        _lastCoords.lng      = pos.coords.longitude;
        _lastCoords.accuracy = pos.coords.accuracy;
        _lastCoords.altitude = pos.coords.altitude;
        _lastCoords.speed    = pos.coords.speed;
        _updateOverlay(_lastCoords);
        _transmit();
      },
      (err) => {
        _log("GPS error: " + err.message, "warn");
        _updateOverlay({ error: "GPS unavailable" });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );

    // Compass (DeviceOrientationEvent)
    _startCompass();

    // Send location updates on interval even if GPS hasn't changed
    _intervalHandle = setInterval(_transmit, UPDATE_INTERVAL);

    _log("Location capture started");
  }

  function stopCapture() {
    if (_watchId !== null) {
      navigator.geolocation.clearWatch(_watchId);
      _watchId = null;
    }
    if (_intervalHandle) {
      clearInterval(_intervalHandle);
      _intervalHandle = null;
    }
    _log("Location capture stopped");
  }

  // ── Compass ───────────────────────────────────────────────────────────────────
  function _startCompass() {
    if (_orientationBound) return;

    // iOS 13+ requires permission
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
    // webkitCompassHeading is iOS, alpha is Android (needs conversion)
    if (e.webkitCompassHeading !== undefined) {
      _heading = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha !== null) {
      _heading = (360 - e.alpha) % 360;
    } else if (e.alpha !== null) {
      _heading = (360 - e.alpha) % 360;
    }
    _lastCoords.heading = _heading !== null ? Math.round(_heading) : null;
    _updateOverlay(_lastCoords);
  }

  // ── Data channel ──────────────────────────────────────────────────────────────

  /**
   * Attach a WebRTC data channel for transmitting location to viewer.
   * Called from sender.js after RTCPeerConnection is created.
   * @param {RTCDataChannel} channel
   */
  function attachDataChannel(channel) {
    _dataChannel = channel;
    _log("Data channel attached");

    channel.onopen  = () => _log("Location data channel open ✓", "success");
    channel.onclose = () => _log("Location data channel closed", "warn");
    channel.onerror = (e) => _log("Data channel error: " + e.message, "error");
  }

  /**
   * Receive location data from sender (viewer side).
   * Called from viewer.js when RTCPeerConnection fires ondatachannel.
   * @param {RTCDataChannelEvent} event
   */
  function onDataChannel(event) {
    const channel = event.channel;
    _log("Location data channel received");

    channel.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === "location") {
          _updateOverlay(msg.coords);
        }
      } catch {
        _log("Invalid data channel message", "warn");
      }
    };

    channel.onopen  = () => _log("Location data channel open (viewer) ✓", "success");
    channel.onclose = () => _log("Location data channel closed (viewer)", "warn");
  }

  function _transmit() {
    if (!_dataChannel || _dataChannel.readyState !== "open") return;
    const msg = {
      type:      "location",
      timestamp: Date.now(),
      coords:    { ..._lastCoords },
    };
    _dataChannel.send(JSON.stringify(msg));
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
      border-radius: 3px;
      padding: 8px 12px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      line-height: 1.8;
      color: #d4dde6;
      pointer-events: none;
      min-width: 200px;
    `;
    overlay.innerHTML = `
      <div style="color:#f59e0b;font-size:9px;letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px">
        📍 Location
      </div>
      <div id="loc-lat">LAT  —</div>
      <div id="loc-lng">LNG  —</div>
      <div id="loc-heading">HDG  —</div>
      <div id="loc-accuracy" style="color:#5a6a78;font-size:10px">ACC  —</div>
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
    btn.id        = "location-toggle-btn";
    btn.className = "btn";
    btn.textContent = "📍 Location";
    btn.style.display = "none"; // shown after GPS starts
    btn.addEventListener("click", toggleOverlay);
    controls.appendChild(btn);
  }

  function toggleOverlay() {
    const overlay = document.getElementById("location-overlay");
    if (!overlay) return;
    _overlayVisible = !_overlayVisible;
    overlay.style.display = _overlayVisible ? "block" : "none";
    const btn = document.getElementById("location-toggle-btn");
    if (btn) {
      btn.style.color        = _overlayVisible ? "var(--green)" : "";
      btn.style.borderColor  = _overlayVisible ? "var(--green)" : "";
    }
  }

  function showToggleButton() {
    const btn = document.getElementById("location-toggle-btn");
    if (btn) btn.style.display = "inline-block";
  }

  function _updateOverlay(coords) {
    if (!coords) return;

    if (coords.error) {
      _set("loc-lat",      "LAT  " + coords.error);
      _set("loc-lng",      "");
      _set("loc-heading",  "");
      _set("loc-accuracy", "");
      showToggleButton();
      return;
    }

    if (coords.lat !== null) {
      _set("loc-lat",      "LAT  " + coords.lat.toFixed(6));
      _set("loc-lng",      "LNG  " + coords.lng.toFixed(6));
      showToggleButton();
    }

    if (coords.heading !== null) {
      _set("loc-heading",  "HDG  " + coords.heading + "° " + _compassPoint(coords.heading));
    }

    if (coords.accuracy !== null) {
      _set("loc-accuracy", "ACC  ±" + Math.round(coords.accuracy) + "m");
    }

    // Dispatch event so other modules can consume location data (M3+)
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
    startCapture,
    stopCapture,
    attachDataChannel,
    onDataChannel,
    toggleOverlay,
    getLastCoords: () => ({ ..._lastCoords }),
  };

})();
