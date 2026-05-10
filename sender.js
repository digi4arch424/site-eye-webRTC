/**
 * sender.js — Camera sender (PeerJS)
 * Uses ICE_CONFIG from ice.js
 *
 * Flow:
 * 1. Page loads → register on PeerJS with fixed ID + ICE_CONFIG
 * 2. Viewer calls → store in pendingCall (do NOT answer yet)
 * 3. User taps Start Stream → getUserMedia() resolves → localStream ready
 * 4. call.answer(localStream) — stream guaranteed to exist at answer time
 */

let localStream = null;
let peer        = null;
let pendingCall = null;
let backoff     = null;
let retryTimer  = null;

document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  document.getElementById("startBtn").addEventListener("click", startStream);
  initPeer();
});

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to PeerJS…", "connecting");

  peer = new Peer(CONFIG.SENDER_PEER_ID, {
    ...CONFIG.PEER_SERVER,
    config: ICE_CONFIG,
  });

  peer.on("open", (id) => {
    backoff.reset();
    log("Sender registered, ID:", id);
    document.getElementById("peerIdDisplay").textContent = id;
    if (window.debugSetPeer) debugSetPeer(id.slice(0, 8) + "…");
    setStatus("status", "Ready — press ▶ Start Stream, then open viewer on desktop.", "connected");
  });

  peer.on("call", (call) => {
    log("Viewer is calling…");
    if (pendingCall) { pendingCall.close(); pendingCall = null; }

    if (localStream) {
      log("Stream exists — answering immediately");
      answerCall(call);
    } else {
      log("Stream not ready — holding call");
      pendingCall = call;
      call.on("close", () => {
        if (pendingCall === call) pendingCall = null;
        setStatus("status", "Viewer disconnected. Start stream then reopen viewer.", "error");
      });
      setStatus("status", "Viewer connected — press ▶ Start Stream to send video.", "connected");
    }
  });

  peer.on("disconnected", () => {
    log("Disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
    if (err.type === "unavailable-id") {
      log("ID in use — retrying in 3s");
      setStatus("status", "ID conflict — retrying…", "connecting");
      retryTimer = setTimeout(initPeer, 3000);
    } else if (err.type === "network" || err.type === "server-error") {
      scheduleReconnect();
    } else {
      setStatus("status", `Error: ${err.type}`, "error");
    }
  });
}

function answerCall(call) {
  call.answer(localStream);
  log("Call answered with live stream");
  if (window.debugSetStream) debugSetStream("live ✓");
  if (window.debugSetConn) debugSetConn("streaming");
  setStatus("status", "🟢 Streaming live to viewer", "streaming");

  call.on("close", () => {
    log("Viewer disconnected");
    if (window.debugSetConn) debugSetConn("closed");
    setStatus("status", "🟡 Camera active — viewer disconnected. Waiting…", "streaming");
  });
  call.on("error", (err) => log("Call error:", err));
}

async function startStream() {
  const btn = document.getElementById("startBtn");
  btn.disabled = true;
  setStatus("status", "Requesting camera…", "connecting");

  try {
    localStream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA_CONSTRAINTS);
  } catch (err) {
    btn.disabled = false;
    log("Camera error:", err);
    const msg = err.name === "NotAllowedError"
      ? "Camera permission denied. Allow access and retry."
      : err.name === "NotFoundError"
      ? "No camera found on this device."
      : `Camera error: ${err.message}`;
    setStatus("status", msg, "error");
    return;
  }

  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");
  document.getElementById("placeholder").style.display = "none";
  btn.textContent = "Streaming…";
  log("Camera ready");

  if (pendingCall) {
    log("Answering held call now that stream is ready");
    answerCall(pendingCall);
    pendingCall = null;
  } else {
    setStatus("status", "🟡 Camera ready — open viewer on desktop.", "streaming");
  }
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  const delay = backoff.next();
  retryTimer = setTimeout(() => {
    if (peer && !peer.destroyed) peer.reconnect();
    else initPeer();
  }, delay);
}
