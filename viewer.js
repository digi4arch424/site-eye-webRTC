/**
 * viewer.js — Remote stream viewer (PeerJS)
 * Uses ICE_CONFIG from ice.js
 *
 * PeerJS 1.5.x requires a local stream when calling — even receive-only.
 * A silent dummy stream satisfies the API without sending any data.
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
// Uses canvas stream (no user gesture needed) as primary method
function getDummyStream() {
  if (dummyStream) return dummyStream;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillRect(0, 0, 1, 1);
    dummyStream = canvas.captureStream(1);
    log("Dummy stream created via canvas");
  } catch (e) {
    log("Canvas stream failed, trying AudioContext: " + e.message, "warn");
    try {
      const actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();
      dummyStream = dest.stream;
      log("Dummy stream created via AudioContext");
    } catch (e2) {
      log("Both dummy stream methods failed: " + e2.message, "error");
    }
  }
  return dummyStream;
}

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to PeerJS…", "connecting");

  peer = new Peer({
    ...CONFIG.PEER_SERVER,
    config: ICE_CONFIG,
  });

  peer.on("open", (id) => {
    backoff.reset();
    log("Viewer peer open, ID:", id);
    if (window.debugSetPeer) debugSetPeer(id.slice(0, 8) + "…");
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
  setStatus("status", "Calling camera — waiting for stream…", "connecting");

  call.on("stream", (remoteStream) => {
    log("Remote stream received ✓");
    const video = document.getElementById("remoteVideo");
    video.srcObject = remoteStream;
    video.classList.add("active");
    document.getElementById("placeholder").style.display = "none";
    setStatus("status", "🟢 Live stream connected", "streaming");
    if (window.debugSetStream) debugSetStream("receiving ✓");
    if (window.debugSetConn) debugSetConn("connected");
    showLiveBadge(true);
    updateConnectedAt();

    // Force play — handle autoplay policy
    video.play().catch((err) => {
      log("Autoplay blocked — retrying with muted: " + err.message, "warn");
      video.muted = true;
      video.play().catch(e => log("Play failed: " + e.message, "error"));
    });
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
