/**
 * sender.js — Camera sender logic (PeerJS)
 * Captures rear camera and streams to viewer via PeerJS free cloud signaling.
 *
 * Key rule: camera must be ready BEFORE answering the call.
 * Incoming calls are queued until getUserMedia() resolves.
 */

let localStream  = null;
let peer         = null;
let pendingCall  = null;  // holds incoming call if camera not ready yet
let backoff      = null;
let retryTimer   = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  document.getElementById("startBtn").addEventListener("click", startStream);
  initPeer();
});

// ─── PeerJS Setup ─────────────────────────────────────────────────────────────
function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();

  setStatus("status", "Connecting to PeerJS server…", "connecting");
  log("Initialising peer:", CONFIG.SENDER_PEER_ID);

  peer = new Peer(CONFIG.SENDER_PEER_ID, { debug: 1 });

  peer.on("open", (id) => {
    backoff.reset();
    log("Peer open, ID:", id);
    document.getElementById("peerIdDisplay").textContent = id;
    setStatus("status", "Connected — press ▶ Start Stream, then open viewer on desktop.", "connected");
  });

  peer.on("call", (call) => {
    log("Incoming call from viewer");

    if (localStream) {
      // Camera already running — answer immediately
      log("Camera ready — answering call now");
      answerCall(call);
    } else {
      // Camera not started yet — queue the call
      log("Camera not ready — queuing call until stream starts");
      pendingCall = call;
      setStatus("status", "Viewer connected — press ▶ Start Stream to begin.", "connected");
    }
  });

  peer.on("disconnected", () => {
    log("Peer disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
    if (err.type === "unavailable-id") {
      CONFIG.SENDER_PEER_ID = CONFIG.SENDER_PEER_ID + "-" + Math.random().toString(36).slice(2, 6);
      log("ID conflict — retrying with:", CONFIG.SENDER_PEER_ID);
      setTimeout(initPeer, 1000);
    } else if (err.type === "network" || err.type === "server-error") {
      scheduleReconnect();
    } else {
      setStatus("status", `Error: ${err.type}`, "error");
    }
  });
}

function answerCall(call) {
  call.answer(localStream);  // attach stream at answer time — the only correct moment

  call.on("close", () => {
    log("Viewer disconnected");
    setStatus("status", "🟡 Streaming — viewer disconnected. Waiting for reconnect…", "streaming");
  });

  call.on("error", (err) => log("Call error:", err));
  setStatus("status", "🟢 Streaming to viewer", "streaming");
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  const delay = backoff.next();
  log(`Reconnecting in ${delay}ms`);
  retryTimer = setTimeout(() => {
    if (peer && !peer.destroyed) peer.reconnect();
    else initPeer();
  }, delay);
}

// ─── Camera ───────────────────────────────────────────────────────────────────
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

  // Show local preview
  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");
  document.getElementById("placeholder").style.display = "none";

  btn.textContent = "Streaming…";
  log("Local stream started");

  // If viewer already called before camera was ready — answer now
  if (pendingCall) {
    log("Answering queued call with live stream");
    answerCall(pendingCall);
    pendingCall = null;
  } else {
    setStatus("status", "🟡 Camera ready — waiting for viewer to connect…", "streaming");
  }
}
