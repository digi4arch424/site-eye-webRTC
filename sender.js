/**
 * sender.js — Camera sender (Raw WebRTC API)
 * Depends on: config.js, utils.js, app.js, module-a.js, signaling.js
 *
 * Flow:
 * 1. DOMContentLoaded → initNetworkModules + initSignaling
 * 2. Viewer connects → server sends "viewer-ready"
 * 3. User taps Start Stream → getUserMedia() → localStream ready
 * 4. createOffer() → SDP offer via SignalingClient
 * 5. Receive SDP answer → setRemoteDescription
 * 6. Exchange ICE candidates → P2P stream established
 */

let localStream = null;
let pc          = null;
let streaming   = false;
let viewerReady = false;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("startBtn").addEventListener("click", startStream);
  document.getElementById("stopBtn").addEventListener("click", stopStream);
  initNetworkModules("sender");
  initSignaling();
});

// ── Signaling ─────────────────────────────────────────────────────────────────
function initSignaling() {
  SignalingClient.configure({
    url:       CONFIG.SIGNALING_URL,
    sessionId: CONFIG.SESSION_ID,
    role:      "sender",

    onRegistered: () => {
      log("Sender registered ✓ session: " + CONFIG.SESSION_ID);
      setInfoValue("peerIdDisplay", CONFIG.SESSION_ID);
      if (window.debugSetPeer) debugSetPeer(CONFIG.SESSION_ID);
      setStatus("status", "Ready — press ▶ Start Stream, then open viewer.", "connected");
    },

    onViewerReady: () => {
      log("Viewer connected");
      viewerReady = true;
      if (streaming) createOffer();
      else setStatus("status", "Viewer connected — press ▶ Start Stream to send video.", "connected");
    },

    onViewerLeft: () => {
      log("Viewer disconnected");
      viewerReady = false;
      setStatus("status", "🟡 Streaming — viewer disconnected. Waiting…", "streaming");
    },

    onAnswer: async (sdp) => {
      log("SDP answer received");
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        log("Remote description set ✓");
      } catch (e) {
        log("setRemoteDescription failed: " + e.message, "error");
      }
    },

    onIceCandidate: async (candidate) => {
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        log("addIceCandidate failed: " + e.message, "warn");
      }
    },

    onDisconnected: () => {
      setStatus("status", "Signaling disconnected. Reconnecting…", "error");
    },

    onError: (msg) => {
      log("Signaling error: " + msg, "error");
    },
  });

  SignalingClient.connect();
}

// ── WebRTC ────────────────────────────────────────────────────────────────────
function createPeerConnection() {
  if (pc) { pc.close(); pc = null; }

  pc = new RTCPeerConnection(ModuleA.getIceConfig());
  ModuleA.onCallEstablished(pc);
  ModuleA.onStreamSent();

  // Add local tracks
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Send ICE candidates to viewer
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) SignalingClient.sendIceCandidate(candidate.toJSON());
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    log("Connection state: " + state);
    if (state === "connected") {
      setStatus("status", "🟢 Streaming live to viewer", "streaming");
      if (window.debugSetStream) debugSetStream("live ✓");
    } else if (state === "failed" || state === "disconnected") {
      setStatus("status", "🟡 Connection lost — waiting for viewer…", "error");
    }
  };
}

async function createOffer() {
  if (!localStream) return;
  createPeerConnection();

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    SignalingClient.sendOffer(offer);
    log("SDP offer sent");
    setStatus("status", "Offer sent — waiting for viewer answer…", "connecting");
  } catch (e) {
    log("createOffer failed: " + e.message, "error");
  }
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startStream() {
  const btn = document.getElementById("startBtn");
  btn.disabled = true;
  setStatus("status", "Requesting camera…", "connecting");

  try {
    localStream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA_CONSTRAINTS);
  } catch (err) {
    btn.disabled = false;
    const msg = err.name === "NotAllowedError"
      ? "Camera permission denied. Allow access and retry."
      : err.name === "NotFoundError"
      ? "No camera found on this device."
      : "Camera error: " + err.message;
    setStatus("status", msg, "error");
    log("Camera error: " + err.name, "error");
    return;
  }

  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");
  document.getElementById("placeholder").style.display = "none";
  btn.textContent = "Streaming…";
  document.getElementById("stopBtn").style.display = "inline-block";
  streaming = true;
  log("Camera ready");

  if (viewerReady) await createOffer();
  else setStatus("status", "🟡 Camera ready — open viewer on desktop.", "streaming");
}

function stopStream() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (pc)          { pc.close(); pc = null; }
  ModuleA.disconnect();
  streaming   = false;
  viewerReady = false;

  const video = document.getElementById("localVideo");
  video.srcObject = null;
  video.classList.remove("active");
  document.getElementById("placeholder").style.display = "";

  const startBtn = document.getElementById("startBtn");
  startBtn.textContent = "▶ Start Stream";
  startBtn.disabled = false;
  document.getElementById("stopBtn").style.display = "none";

  setStatus("status", "Stream stopped — press ▶ Start Stream to restart.", "info");
  log("Stream stopped");
}
