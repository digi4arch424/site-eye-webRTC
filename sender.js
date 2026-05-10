/**
 * sender.js — Camera sender (PeerJS)
 *
 * Correct flow:
 * 1. Page loads → register on PeerJS immediately with fixed ID
 * 2. Viewer calls → store the call in pendingCall (do NOT answer yet)
 * 3. User taps Start Stream → getUserMedia() resolves → localStream ready
 * 4. Answer pendingCall with localStream attached — stream exists at answer time
 *
 * Key rule: call.answer(stream) must be called with stream already in hand.
 */

let localStream = null;
let peer        = null;
let pendingCall = null;   // viewer's call held until camera is ready
let backoff     = null;
let retryTimer  = null;

// ─── Init — register on PeerJS immediately ────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  document.getElementById("startBtn").addEventListener("click", startStream);
  initPeer();
});

function initPeer() {
  if (peer && !peer.destroyed) peer.destroy();
  setStatus("status", "Connecting to PeerJS…", "connecting");

  peer = new Peer(CONFIG.SENDER_PEER_ID, { debug: 1 });

  peer.on("open", (id) => {
    backoff.reset();
    log("Sender registered, ID:", id);
    document.getElementById("peerIdDisplay").textContent = id;
    setStatus("status", "Ready — press ▶ Start Stream, then open viewer on desktop.", "connected");
  });

  // Viewer calls — hold it until camera is ready
  peer.on("call", (call) => {
    log("Viewer is calling…");

    // Close any previous pending call
    if (pendingCall) {
      pendingCall.close();
      pendingCall = null;
    }

    if (localStream) {
      // Camera already running — answer immediately
      log("Stream exists — answering now");
      answerCall(call);
    } else {
      // Camera not started — hold the call
      log("Stream not ready — holding call until camera starts");
      pendingCall = call;

      // Handle viewer hanging up before camera starts
      call.on("close", () => {
        log("Viewer hung up while waiting");
        if (pendingCall === call) pendingCall = null;
        setStatus("status", "Viewer disconnected. Press ▶ Start Stream then reopen viewer.", "error");
      });

      setStatus("status", "Viewer connected — press ▶ Start Stream to send video.", "connected");
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
      // Another sender session is still alive — wait and retry
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

// ─── Answer call with stream attached ────────────────────────────────────────
function answerCall(call) {
  call.answer(localStream);  // stream is guaranteed to exist here
  log("Call answered with live stream");

  call.on("close", () => {
    log("Viewer disconnected");
    setStatus("status", "🟡 Streaming — viewer disconnected. Waiting for reconnect…", "streaming");
  });

  call.on("error", (err) => log("Call error:", err));
  setStatus("status", "🟢 Streaming live to viewer", "streaming");
}

// ─── Camera — start only when user taps button ────────────────────────────────
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

  // Show preview
  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");
  document.getElementById("placeholder").style.display = "none";
  btn.textContent = "Streaming…";
  log("Camera ready");

  // Answer any call that arrived before camera was ready
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
