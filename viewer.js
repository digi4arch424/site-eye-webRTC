/**
 * viewer.js — Remote stream viewer (PeerJS)
 * Networking managed entirely by Module A/B/C.
 *
 * Flow:
 * 1. Page loads → ModuleA.init("viewer") → connect to PeerJS
 * 2. Call sender → ModuleA.onCallEstablished(pc)
 * 3. Module A monitors ICE → B tries local, C tries relay if needed
 * 4. Stream received → display video
 */

let peer        = null;
let activeCall  = null;
let backoff     = null;
let retryTimer  = null;
let dummyStream = null;

document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  initNetworkModules("viewer");
  // Does not auto-connect — user presses ▶ Connect
});

// Silent dummy stream — required by PeerJS 1.5.x
function getDummyStream() {
  if (dummyStream) return dummyStream;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    canvas.getContext("2d").fillRect(0, 0, 1, 1);
    dummyStream = canvas.captureStream(1);
    log("Dummy stream created via canvas");
  } catch (e) {
    log("Canvas stream failed, trying AudioContext: " + e.message, "warn");
    try {
      const actx = new AudioContext();
      dummyStream = actx.createMediaStreamDestination().stream;
      log("Dummy stream created via AudioContext");
    } catch (e2) {
      log("Both dummy stream methods failed: " + e2.message, "error");
    }
  }
  return dummyStream;
}

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to signaling server…", "connecting");

  peer = new Peer({
    ...CONFIG.PEER_SERVER,
    config: ModuleA.getIceConfig(),
  });

  peer.on("open", (id) => {
    backoff.reset();
    log("Viewer peer open, ID: " + id);
    if (window.debugSetPeer) debugSetPeer(id.slice(0, 8) + "…");
    setStatus("status", "Connected — calling camera…", "connecting");
    callSender();
  });

  peer.on("disconnected", () => {
    log("Peer disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error: " + err.type + " " + err.message);
    if (err.type === "peer-unavailable") {
      setStatus("status", "Camera not online yet. Retrying…", "connecting");
      clearTimeout(retryTimer);
      retryTimer = setTimeout(callSender, 3000);
    } else if (err.type === "network" || err.type === "server-error") {
      scheduleReconnect();
    } else {
      setStatus("status", `Error: ${err.type}`, "error");
    }
  });
}

function callSender() {
  if (!peer || peer.destroyed) return;
  if (activeCall) { activeCall.close(); activeCall = null; }

  log("Calling sender: " + CONFIG.SENDER_PEER_ID);

  const dummy = getDummyStream();
  log("Dummy stream tracks: " + (dummy ? dummy.getTracks().length : "null"));

  const call = peer.call(CONFIG.SENDER_PEER_ID, dummy);

  if (!call) {
    log("Call returned null — retrying", "error");
    retryTimer = setTimeout(callSender, 3000);
    return;
  }

  log("Call object created — waiting for stream…");
  activeCall = call;
  window._activeCall = call;
  window._peer = peer;

  // Explicitly set video transceiver to receive-only
  // Fixes muted: true on incoming video track
  try {
    const pc = call.peerConnection;
    const transceivers = pc.getTransceivers();
    transceivers.forEach(t => {
      if (t.receiver && t.receiver.track && t.receiver.track.kind === "video") {
        t.direction = "recvonly";
        log("Set video transceiver to recvonly", "ice");
      }
    });
  } catch (e) {
    log("Transceiver setup: " + e.message, "warn");
  }

  // Hand off to Module A — begins B→C state machine
  ModuleA.onCallEstablished(call.peerConnection);

  setStatus("status", "Calling camera — waiting for stream…", "connecting");

  call.on("stream", (remoteStream) => {
    log("Remote stream received ✓");

    // Attempt to unmute incoming tracks
    remoteStream.getTracks().forEach(track => {
      log("Track: " + track.kind + " muted=" + track.muted + " readyState=" + track.readyState, "ice");
      track.onunmute = () => {
        log("Track unmuted: " + track.kind, "success");
        const video = document.getElementById("remoteVideo");
        if (video) video.play().catch(() => {});
      };
    });
    const video = document.getElementById("remoteVideo");
    video.srcObject = remoteStream;
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
      log("Video playing ✓");
      const btn = document.getElementById("play-btn");
      if (btn) btn.style.display = "none";
    }).catch((err) => {
      log("Autoplay blocked — retrying muted: " + err.message, "warn");
      video.muted = true;
      video.play().then(() => {
        log("Video playing muted ✓");
      }).catch(() => {
        const btn = document.getElementById("play-btn");
        if (btn) btn.style.display = "block";
      });
    });
  });

  call.on("close", () => {
    log("Sender disconnected");
    ModuleA.disconnect();
    setStatus("status", "Camera disconnected. Reconnecting…", "error");
    showLiveBadge(false);
    const video = document.getElementById("remoteVideo");
    video.srcObject = null;
    video.classList.remove("active");
    document.getElementById("placeholder").style.display = "";
    activeCall = null;
    retryTimer = setTimeout(callSender, 3000);
  });

  call.on("error", (err) => {
    log("Call error: " + err);
    retryTimer = setTimeout(callSender, 3000);
  });
}

function stopViewer() {
  clearTimeout(retryTimer);
  if (activeCall) { activeCall.close(); activeCall = null; }
  if (peer && !peer.destroyed) { peer.destroy(); peer = null; }
  ModuleA.disconnect();

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

function startViewer() {
  document.getElementById("connectBtn").style.display = "none";
  document.getElementById("disconnectBtn").style.display = "inline-block";
  initPeer();
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  const delay = backoff.next();
  retryTimer = setTimeout(() => {
    if (peer && !peer.destroyed) peer.reconnect();
    else initPeer();
  }, delay);
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
