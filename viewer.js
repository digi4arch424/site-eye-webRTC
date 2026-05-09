/**
 * viewer.js — Remote stream viewer logic (PeerJS)
 * Calls the sender peer and displays the incoming video stream.
 */

let peer       = null;
let activeCall = null;
let backoff    = null;
let retryTimer = null;
let callTimer  = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  initPeer();
});

// ─── PeerJS Setup ─────────────────────────────────────────────────────────────
function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();

  setStatus("status", "Connecting to PeerJS server…", "connecting");
  log("Initialising viewer peer");

  peer = new Peer({ debug: 1 });

  peer.on("open", (id) => {
    backoff.reset();
    log("Viewer peer open, ID:", id);
    setStatus("status", "Connected — calling camera…", "connecting");
    callSender();
  });

  peer.on("disconnected", () => {
    log("Peer disconnected");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
    if (err.type === "peer-unavailable") {
      // Sender not online yet — retry
      setStatus("status", "Camera not online yet. Retrying…", "connecting");
      clearTimeout(callTimer);
      callTimer = setTimeout(callSender, 3000);
    } else if (err.type === "network" || err.type === "server-error") {
      scheduleReconnect();
    } else {
      setStatus("status", `Error: ${err.type}`, "error");
    }
  });
}

function callSender() {
  if (!peer || peer.destroyed) return;
  log("Calling sender:", CONFIG.SENDER_PEER_ID);

  if (activeCall) {
    activeCall.close();
    activeCall = null;
  }

  const call = peer.call(CONFIG.SENDER_PEER_ID, null); // no local stream needed
  if (!call) {
    log("Call failed — retrying");
    callTimer = setTimeout(callSender, 3000);
    return;
  }

  activeCall = call;

  call.on("stream", (remoteStream) => {
    log("Remote stream received");
    const video = document.getElementById("remoteVideo");
    video.srcObject = remoteStream;
    video.classList.add("active");
    document.getElementById("placeholder").style.display = "none";
    setStatus("status", "🟢 Live stream connected", "streaming");
    showLiveBadge(true);
    updateConnectedAt();
  });

  call.on("close", () => {
    log("Call closed — sender disconnected");
    setStatus("status", "Camera disconnected. Reconnecting…", "error");
    showLiveBadge(false);
    const video = document.getElementById("remoteVideo");
    video.srcObject = null;
    video.classList.remove("active");
    document.getElementById("placeholder").style.display = "";
    activeCall = null;
    callTimer = setTimeout(callSender, 3000);
  });

  call.on("error", (err) => {
    log("Call error:", err);
    callTimer = setTimeout(callSender, 3000);
  });

  setStatus("status", "Calling camera — waiting for stream…", "connecting");
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
