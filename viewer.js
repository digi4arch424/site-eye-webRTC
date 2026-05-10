/**
 * viewer.js — Remote stream viewer (PeerJS + full ICE stack)
 *
 * PeerJS 1.5.x requires a local stream when calling.
 * We use a silent AudioContext dummy stream to satisfy the API.
 * Only the sender's remote stream is displayed.
 */

let peer        = null;
let activeCall  = null;
let backoff     = null;
let retryTimer  = null;
let dummyStream = null;

document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  initPeer();
});

// Silent dummy stream — required by PeerJS 1.5.x to initiate a call
function getDummyStream() {
  if (dummyStream) return dummyStream;
  try {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    dummyStream = dest.stream;
  } catch (e) {
    // Fallback: canvas silent video stream
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    dummyStream = canvas.captureStream(1);
  }
  return dummyStream;
}

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to PeerJS…", "connecting");

  peer = new Peer({
    debug: 1,
    config: { iceServers: CONFIG.ICE_SERVERS },
  });

  peer.on("open", (id) => {
    backoff.reset();
    log("Viewer peer open, ID:", id);
    setStatus("status", "Connected — calling camera…", "connecting");
    callSender();
  });

  peer.on("disconnected", () => {
    log("Disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
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

  log("Calling sender:", CONFIG.SENDER_PEER_ID);

  const call = peer.call(CONFIG.SENDER_PEER_ID, getDummyStream());

  if (!call) {
    log("Call returned null — retrying");
    retryTimer = setTimeout(callSender, 3000);
    return;
  }

  activeCall = call;
  setStatus("status", "Calling camera — waiting for stream…", "connecting");

  call.on("stream", (remoteStream) => {
    log("Remote stream received ✓");
    const video = document.getElementById("remoteVideo");
    video.srcObject = remoteStream;
    video.classList.add("active");
    document.getElementById("placeholder").style.display = "none";
    setStatus("status", "🟢 Live stream connected", "streaming");
    showLiveBadge(true);
    updateConnectedAt();
  });

  call.on("close", () => {
    log("Sender disconnected");
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
    log("Call error:", err);
    retryTimer = setTimeout(callSender, 3000);
  });
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
