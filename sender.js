/**
 * sender.js — Camera sender logic (PeerJS)
 * Captures rear camera and streams to viewer via PeerJS free cloud signaling.
 */

let localStream = null;
let peer        = null;
let activeCall  = null;
let backoff     = null;
let retryTimer  = null;
let streaming   = false;

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

  peer = new Peer(CONFIG.SENDER_PEER_ID, {
    debug: 1,
  });

  peer.on("open", (id) => {
    backoff.reset();
    log("Peer open, ID:", id);
    setStatus("status", streaming
      ? "Ready — waiting for viewer to connect…"
      : "Connected. Press ▶ Start Stream.", "connected");
    updatePeerIdDisplay(id);
  });

  // Viewer calls us — answer with the local stream
  peer.on("call", (call) => {
    log("Incoming call from viewer");
    if (!localStream) {
      log("No stream yet — viewer called before stream started");
      setStatus("status", "Viewer connected — start the stream to send.", "connected");
      // Store call, answer once stream is ready
      activeCall = call;
      call.answer(); // answer without stream for now; stream added on startStream
      listenToCall(call);
      return;
    }
    activeCall = call;
    call.answer(localStream);
    listenToCall(call);
  });

  peer.on("disconnected", () => {
    log("Peer disconnected — reconnecting…");
    setStatus("status", "Disconnected. Reconnecting…", "error");
    scheduleReconnect();
  });

  peer.on("error", (err) => {
    log("Peer error:", err.type, err.message);
    if (err.type === "unavailable-id") {
      // ID taken — append random suffix
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

function listenToCall(call) {
  call.on("close", () => {
    log("Viewer disconnected");
    setStatus("status", streaming ? "Viewer disconnected. Waiting…" : "Viewer left.", "error");
    activeCall = null;
  });
  call.on("error", (err) => log("Call error:", err));
}

function scheduleReconnect() {
  clearTimeout(retryTimer);
  const delay = backoff.next();
  log(`Reconnecting in ${delay}ms`);
  retryTimer = setTimeout(() => {
    if (peer && !peer.destroyed) {
      peer.reconnect();
    } else {
      initPeer();
    }
  }, delay);
}

function updatePeerIdDisplay(id) {
  const el = document.getElementById("peerIdDisplay");
  if (el) el.textContent = id;
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

  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");
  document.getElementById("placeholder").style.display = "none";

  streaming = true;
  btn.textContent = "Streaming…";
  setStatus("status", "🟢 Streaming — waiting for viewer to connect…", "streaming");
  log("Local stream started");

  // If viewer already called before stream was ready, answer now
  if (activeCall) {
    log("Answering pending call with stream");
    activeCall.peerConnection.getSenders().forEach(s => {
      localStream.getTracks().forEach(t => {
        if (t.kind === s.track?.kind) s.replaceTrack(t);
      });
    });
  }
}
