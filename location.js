/**
 * location.js — GPS + Compass + VPS Metadata Module
 * Construction Camera System — M2 (+ Phase 1 Track 1 / Track 4 patch)
 *
 * Captures GPS coordinates, compass heading, device pitch/roll, and (Track 4)
 * VPS 6-DoF pose from the sender device. Transmits to viewer via WebRTC data
 * channel alongside the video stream. Displays as a toggleable overlay on the
 * video panel on both sender and viewer.
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
 * createVPSProvider() and checkVPSSupport() are exposed on window by the Vite
 * bundle's src/main.js (see src/vps-config.js). Phase 1 resolves to a
 * WebXRProvider with no Multiset API key required; swapping to MultisetProvider
 * in Phase 2 is a two-line change inside vps-config.js, not in this file.
 *
 * Current (M2 + Track 1 + Track 4):
 *   - GPS coordinates (lat/lng)
 *   - Compass heading (degrees + cardinal point)
 *   - Accuracy (metres)
 *   - Pitch / roll (degrees, from DeviceOrientationEvent beta/gamma)
 *   - VPS pose (position + confidence, from the active VPSProvider — Phase 1: WebXR)
 *
 * Placeholder slots for future milestones:
 *   - altitude        (M3 — AR marker anchoring; already captured, not yet displayed)
 *   - speed           (M4 — site movement tracking; already captured, not yet displayed)
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
 *     pitch:       -3.2,   // Track 1
 *     roll:        1.1,    // Track 1
 *     altitude:    null,   // M3
 *     speed:       null,   // M4
 *     siteAnchorId: null,  // M5
 *     bimElementId: null,  // M6
 *   },
 *   vpsPose: {             // Track 4 — null until the VPS provider localises
 *     position:   { x: 0.12, y: 1.6, z: -0.4 },
 *     confidence: 0.92,
 *   }
 * }
 */

const LocationModule = (function () {

  // ── Read all tuneable values from CONFIG.GPS ──────────────────────────────────
  // No magic numbers in this file — all values come from config.js
  function _cfg() { return CONFIG.GPS; }

  // Track 4: VPS pose considered "confident" at/above this threshold (✓ vs ~ in overlay)
  const _VPS_CONFIDENCE_OK = 0.8;
  // Track 4: VPS poll rate — WebXR frame callbacks run faster than this is useful
  // for an overlay/data-channel update, so we poll at a fixed ~30Hz instead.
  const _VPS_POLL_MS = 33;

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

  // Track 4: VPS provider lifecycle state
  let _vpsProvider = null;   // VPSProvider instance (Phase 1: WebXRProvider)
  let _vpsPollId   = null;   // setInterval handle for the getPose() loop
  let _lastVPSPose = null;   // most recent VPSPose — own pose (sender) or received pose (viewer)
  let _vpsReady    = false;  // true once the provider's init() resolves

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

    // ── Track 1: pitch / roll ─────────────────────────────────────────────────
    // beta  = front-back tilt (pitch), gamma = left-right tilt (roll).
    // No smoothing applied here — these ride along with the heading-gated
    // update below so overlay/transmit cadence doesn't change.
    if (e.beta  !== null && e.beta  !== undefined) _lastCoords.pitch = e.beta;
    if (e.gamma !== null && e.gamma !== undefined) _lastCoords.roll  = e.gamma;

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
        if (msg.type === "location") {
          // ── Latency measurement ───────────────────────────────────────────
          if (msg.timestamp) {
            const latency = Date.now() - msg.timestamp;
            window._diagLatency = latency; // exposed for diagnostics.js

            // Log every 10 messages to avoid spam
            if (!window._latencyLogCount) window._latencyLogCount = 0;
            if (++window._latencyLogCount % 10 === 0) {
              _log("Stream latency: " + latency + "ms", "ice");
            }

            // Update latency in debug status bar if element exists
            const el = document.getElementById("ds-latency");
            if (el) {
              el.textContent = latency + "ms";
              el.style.color = latency < 100 ? "var(--green)"
                             : latency < 300 ? "var(--yellow)"
                             : "var(--red)";
            }
          }
          _updateOverlay(msg.coords);

          // Track 4: viewer has no VPSProvider of its own — just display
          // whatever pose the sender included in this message.
          if ("vpsPose" in msg) {
            _lastVPSPose = msg.vpsPose;
            _updateVPSOverlay();
          }
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
    _dataChannel.send(JSON.stringify({
      type:      "location",
      timestamp: Date.now(),
      coords:    { ..._lastCoords },
      vpsPose:   _lastVPSPose,   // Track 4 — null until the VPS provider localises
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
    _stopVPSLoop();
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
      <div id="loc-pitch" style="color:var(--text-muted, #5a6a78);font-size:10px">PIT  —</div>
      <div id="loc-roll"  style="color:var(--text-muted, #5a6a78);font-size:10px">ROL  —</div>
      <div id="loc-vps"   style="color:var(--text-muted, #5a6a78);font-size:10px">VPS  —</div>
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

    // ── Track 1: pitch / roll ─────────────────────────────────────────────────
    if (coords.pitch !== null && coords.pitch !== undefined) {
      _set("loc-pitch", "PIT  " + coords.pitch.toFixed(1) + "°");
    }
    if (coords.roll !== null && coords.roll !== undefined) {
      _set("loc-roll",  "ROL  " + coords.roll.toFixed(1) + "°");
    }

    // Dispatch event for future modules (M3+)
    window.dispatchEvent(new CustomEvent("location-update", { detail: coords }));
  }

  // ── Track 4: VPS overlay row ─────────────────────────────────────────────────
  // Separate from _updateOverlay() because vpsPose isn't part of `coords` —
  // it travels as its own top-level field in the data channel message.
  function _updateVPSOverlay() {
    if (!_lastVPSPose) {
      _set("loc-vps", "VPS  " + (_vpsReady ? "Localising…" : "—"));
      return;
    }
    const confident = _lastVPSPose.confidence >= _VPS_CONFIDENCE_OK;
    _set("loc-vps",
      "VPS  " + (confident ? "✓" : "~") +
      " (" + Math.round(_lastVPSPose.confidence * 100) + "%)"
    );
  }

  function _compassPoint(deg) {
    const points = ["N","NE","E","SE","S","SW","W","NW","N"];
    return points[Math.round(deg / 45) % 8];
  }

  // ── Track 4: VPS provider lifecycle ──────────────────────────────────────────

  /**
   * Initialise the VPS provider (Phase 1: WebXRProvider, no Multiset key needed).
   * Not called automatically from init() — WebXR session requests must happen
   * from inside (or shortly after) a user gesture, and this module doesn't own
   * the "start camera" button. Call `LocationModule.startVPS()` from the same
   * handler that acquires the local media stream (e.g. right after
   * `localVideo.srcObject = stream` in webrtc.js).
   */
  async function _initVPS() {
    if (typeof window.checkVPSSupport !== "function" || typeof window.createVPSProvider !== "function") {
      _log("VPS provider not available on window — is the Vite bundle loaded?", "warn");
      _set("loc-vps", "VPS  N/A");
      return;
    }

    const cap = await window.checkVPSSupport();
    if (!cap.supported) {
      _log("VPS not supported: " + cap.reason, "warn");
      _set("loc-vps", "VPS  N/A");
      return;
    }

    try {
      _vpsProvider = window.createVPSProvider();
      await _vpsProvider.init();
      _vpsReady = true;
      _startVPSLoop();
      _log("VPS provider initialised", "success");
    } catch (err) {
      _log("VPS init failed: " + err.message, "error");
      _set("loc-vps", "VPS  Error");
    }
  }

  /**
   * Poll the VPS provider at ~30Hz and cache the pose, refresh the overlay,
   * and let it ride along on the next _transmit() tick (driven separately by
   * the data-channel update interval, same as GPS/compass).
   */
  function _startVPSLoop() {
    if (_vpsPollId !== null) return; // already running
    _vpsPollId = setInterval(async () => {
      if (!_vpsProvider) return;
      try {
        _lastVPSPose = await _vpsProvider.getPose();
        _updateVPSOverlay();
      } catch (err) {
        _log("VPS getPose() error: " + err.message, "warn");
      }
    }, _VPS_POLL_MS);
  }

  /** Stop polling and tear down the VPS session. */
  function _stopVPSLoop() {
    if (_vpsPollId !== null) {
      clearInterval(_vpsPollId);
      _vpsPollId = null;
    }
    if (_vpsProvider) {
      _vpsProvider.destroy();
      _vpsProvider = null;
    }
    _vpsReady    = false;
    _lastVPSPose = null;
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
    getLastCoords:  () => ({ ..._lastCoords }),
    // Track 4 — call from the camera-start handler, after the local stream
    // is acquired and inside the originating user gesture (WebXR requirement).
    startVPS:       _initVPS,
    getLastVPSPose: () => (_lastVPSPose ? { ..._lastVPSPose } : null),
  };

})();
