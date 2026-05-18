/**
 * viewer.js — Remote stream viewer (Raw WebRTC API)
 * No PeerJS. No dummy stream. Uses SignalingClient + RTCPeerConnection directly.
 *
 * Flow:
 * 1. User taps Connect → SignalingClient connects and registers as "viewer"
 * 2. Server sends "sender-ready" or sender sends offer immediately
 * 3. Receive SDP offer → createAnswer() → send via SignalingClient
 * 4. Exchange ICE candidates
 * 5. ontrack fires → display video — no muted track issue
 */

let pc         = null;  // RTCPeerConnection
let connected  = false;

document.addEventListener("DOMContentLoaded", () => {
  initNetworkModules("viewer");
  // Does not auto-connect — user presses ▶ Connect
});

// ── Signaling ─────────────────────────────────────────────────────────────────
function initSignaling() {
  SignalingClient.configure({
    url:       CONFIG.SIGNALING_URL,
    sessionId: CONFIG.SESSION_ID,
    role:      "viewer",

    onRegistered: () => {
      log("Viewer registered on signaling server ✓");
      if (window.debugSetPeer) debugSetPeer(CONFIG.SESSION_ID);
      setStatus("status", "Connected — waiting for camera…", "connected");
    },

    onSenderReady: () => {
      log("Sender is online");
      setStatus("status", "Camera online — waiting for stream offer…", "connected");
    },

    onOffer: async (sdp) => {
      log("Received SDP offer — creating answer");
      setStatus("status", "Offer received — connecting…", "connecting");
      await handleOffer(sdp);
    },

    onIceCandidate: async (candidate) => {
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        log("addIceCandidate failed: " + e.message, "warn");
      }
    },

    onSenderLeft: () => {
      log("Sender disconnected");
      setStatus("status", "Camera disconnected. Waiting for reconnect…", "error");
      showLiveBadge(false);
      const video = document.getElementById("remoteVideo");
      video.srcObject = null;
      video.classList.remove("active");
      document.getElementById("placeholder").style.display = "";
      if (window.debugSetStream) debugSetStream("—");
      connected = false;
      if (pc) { pc.close(); pc = null; }
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

  // Declare intent to receive video and audio — NO dummy stream needed
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  // Receive remote stream — this fires with real unmuted tracks
  pc.ontrack = ({ track, streams }) => {
    log("Track received: " + track.kind + " muted=" + track.muted + " readyState=" + track.readyState, "ice");

    if (track.kind === "video") {
      const video = document.getElementById("remoteVideo");
      video.srcObject = streams[0] || new MediaStream([track]);
      video.classList.add("active");
      document.getElementById("placeholder").style.display = "none";
      document.getElementById("connectBtn").style.display = "none";
      document.getElementById("disconnectBtn").style.display = "inline-block";
      setStatus("status", "🟢 Live stream connected", "streaming");
      if (window.debugSetStream) debugSetStream("receiving ✓");
      showLiveBadge(true);
      updateConnectedAt();
      ModuleA.onStreamReceived();

      video.play().then(() => {
        log("Video playing ✓ readyState=" + video.readyState + " w=" + video.videoWidth + " h=" + video.videoHeight, "success");
        const btn = document.getElementById("play-btn");
        if (btn) btn.style.display = "none";
      }).catch(err => {
        log("Autoplay blocked — retrying muted: " + err.message, "warn");
        video.muted = true;
        video.play().catch(() => {
          const btn = document.getElementById("play-btn");
          if (btn) btn.style.display = "block";
        });
      });
    }
  };

  pc.onconnectionstatechange = () => {
    log("Connection state: " + pc.connectionState);
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      setStatus("status", "Connection lost. Reconnecting…", "error");
      showLiveBadge(false);
      connected = false;
    }
  };

  return pc;
}

async function handleOffer(sdp) {
  createPeerConnection();

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    SignalingClient.sendAnswer(answer);
    log("SDP answer sent ✓");

    // Send ICE candidates to sender
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) SignalingClient.sendIceCandidate(candidate.toJSON());
    };

  } catch (e) {
    log("handleOffer failed: " + e.message, "error");
    setStatus("status", "Failed to process offer. Check console.", "error");
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────
function startViewer() {
  document.getElementById("connectBtn").style.display = "none";
  document.getElementById("disconnectBtn").style.display = "inline-block";
  setStatus("status", "Connecting to signaling server…", "connecting");
  initSignaling();
}

function stopViewer() {
  SignalingClient.disconnect();
  if (pc) { pc.close(); pc = null; }
  ModuleA.disconnect();
  connected = false;

  const video = document.getElementById("remoteVideo");
  video.srcObject = null;
  video.classList.remove("active");
  document.getElementById("placeholder").style.display = "";
  document.getElementById("connectBtn").style.display = "inline-block";
  document.getElementById("disconnectBtn").style.display = "none";

  showLiveBadge(false);
  setStatus("status", "Disconnected.", "info");
  log("Viewer stopped");
}

function showLiveBadge(visible) {
  const badge = document.getElementById("liveBadge");
  if (badge) badge.classList.toggle("visible", visible);
  const stateEl = document.getElementById("infoState");
  if (stateEl) stateEl.textContent = visible ? "Live" : "Offline";
}

function updateConnectedAt() {
  const el = document.getElementById("infoConnectedAt");
  if (el && el.textContent === "—") el.textContent = new Date().toLocaleTimeString();
}
