/**
 * viewer.js — Remote stream viewer (PeerJS)
 *
 * Flow:
 * 1. Page loads → connect to PeerJS with random ID
 * 2. Call sender's fixed ID
 * 3. If sender not ready yet → retry every 3s until sender answers
 * 4. On stream event → display video
 */

let peer       = null;
let activeCall = null;
let backoff    = null;
let retryTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  initPeer();
});

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to PeerJS…", "connecting");

  peer = new Peer({ debug: 1 }); // random viewer ID

  peer.on("open", (id) => {
    backoff.reset();
    log("Viewer peer open, ID:", id);
    setStatus("status", "Connected — calling camera…", "connecting");
    callSender();
  });

  peer.on("disconnected", () => {
    log("Peer disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
    if (err.type === "peer-unavailable") {
      // Sender not registered yet — keep retrying
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

  // Viewer has no local stream — pass null (media-only receive)
  const call = peer.call(CONFIG.SENDER_PEER_ID, null);

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
    log("Call closed — sender disconnected");
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
