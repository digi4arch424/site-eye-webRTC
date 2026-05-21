/**
 * settings.js — Settings Panel Logic
 * Construction Camera System
 *
 * Handles settings panel interactions for both sender and viewer pages.
 * Removes all inline <script> logic from HTML files.
 *
 * Depends on: config.js, utils.js
 * Loaded last — after all other scripts.
 */

document.addEventListener("DOMContentLoaded", () => {

  const isSender = document.title.includes("Sender");
  const isViewer = document.title.includes("Viewer");

  // ── Populate settings inputs from CONFIG ────────────────────────────────────
  if (isSender) {
    _setVal("peerIdInput",  CONFIG.SESSION_ID);
    _setVal("siteIdInput",  CONFIG.SITE_ID);
    setInfoValue("siteIdDisplay",  CONFIG.SITE_ID);
    setInfoValue("peerIdDisplay",  "—");
  }

  if (isViewer) {
    _setVal("senderPeerIdInput", CONFIG.SESSION_ID);
    _setVal("siteIdInput",       CONFIG.SITE_ID);
    setInfoValue("infoCameraId",    CONFIG.CAMERA_ID);
    setInfoValue("infoSiteId",      CONFIG.SITE_ID);
    setInfoValue("videoSiteLabel",  CONFIG.SITE_ID.toUpperCase());
  }

  // ── Settings toggle button ───────────────────────────────────────────────────
  const settingsHeader = document.getElementById("settingsHeader");
  if (settingsHeader) {
    settingsHeader.addEventListener("click", () => {
      toggleSettingsPanel("settingsPanel", "settingsToggle");
    });
  }

  // ── Apply settings button ────────────────────────────────────────────────────
  const applyBtn = document.getElementById("applySettingsBtn");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const sessionId = _getVal("peerIdInput") || _getVal("senderPeerIdInput");
      const siteId    = _getVal("siteIdInput");

      if (sessionId) CONFIG.SESSION_ID = sessionId;

      if (siteId) {
        CONFIG.SITE_ID = siteId;
        if (isSender) setInfoValue("siteIdDisplay", siteId);
        if (isViewer) {
          setInfoValue("infoSiteId",     siteId);
          setInfoValue("videoSiteLabel", siteId.toUpperCase());
        }
      }

      // Close settings panel
      toggleSettingsPanel("settingsPanel", "settingsToggle");

      // Reconnect with new config
      if (isSender && typeof SignalingClient !== "undefined") {
        SignalingClient.disconnect();
        if (typeof initSignaling === "function") initSignaling();
      }
      if (isViewer && typeof stopViewer === "function") {
        stopViewer();
      }

      log("Settings applied — Session: " + CONFIG.SESSION_ID + " Site: " + CONFIG.SITE_ID);
    });
  }

  // ── Fullscreen button (viewer only) ──────────────────────────────────────────
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      const panel = document.querySelector(".video-panel");
      if (!panel) return;
      if (!document.fullscreenElement) {
        panel.requestFullscreen().catch(e => log("Fullscreen error: " + e.message, "warn"));
      } else {
        document.exitFullscreen();
      }
    });
  }

  // ── Manual play button (viewer only) ────────────────────────────────────────
  const playBtn = document.getElementById("play-btn");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const video = document.getElementById("remoteVideo");
      if (!video) return;
      video.play()
        .then(() => { playBtn.style.display = "none"; })
        .catch(e => log("Manual play failed: " + e.message, "error"));
    });
  }

});

// ── Helpers ───────────────────────────────────────────────────────────────────
function _getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function _setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}
