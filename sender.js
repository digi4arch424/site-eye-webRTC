/**
 * sender.js — Camera sender logic
 * Captures rear camera, establishes WebRTC peer connection,
 * and streams to the viewer via signaling server.
 */

let localStream = null;
let peerConnection = null;
let ws = null;
let wsReconnectTimer = null;
let backoff = null;
let streaming = false;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
  document.getElementById("startBtn").addEventListener("click", startStream);
  connectSignaling();
});

// ─── WebSocket Signaling ──────────────────────────────────────────────────────
function connectSignaling() {
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    ws.close();
  }

  setStatus("status", "Connecting to signaling server…", "connecting");
  log("Connecting to signaling server:", CONFIG.SIGNALING_SERVER_URL);

  try {
    ws = new WebSocket(CONFIG.SIGNALING_SERVER_URL);
  } catch (e) {
    log("WebSocket creation failed:", e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    log("Signaling server connected");
    backoff.reset();
    setStatus("status", "Connected to signaling server. Press Start Stream.", "connected");

    const regMsg = buildMessage("register");
    regMsg.role = "sender";
    ws.send(JSON.stringify(regMsg));
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    log("Signaling message received:", msg.type);

    switch (msg.type) {
      case "viewer-ready":
        log("Viewer connected — initiating offer");
        if (streaming) await createOffer();
        break;

      case "answer":
        await handleAnswer(msg.payload);
        break;

      case "ice-candidate":
        await handleRemoteIce(msg.payload);
        break;
    }
  };

  ws.onclose = () => {
    log("Signaling server disconnected");
    setStatus("status", "Disconnected from signaling server. Reconnecting…", "error");
    scheduleReconnect();
  };

  ws.onerror = (e) => {
    log("WebSocket error:", e);
  };
}

function scheduleReconnect() {
  clearTimeout(wsReconnectTimer);
  const delay = backoff.next();
  log(`Reconnecting in ${delay}ms…`);
  wsReconnectTimer = setTimeout(connectSignaling, delay);
}

function sendSignal(type, payload = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    log("Cannot send signal — WebSocket not open");
    return;
  }
  ws.send(JSON.stringify(buildMessage(type, payload)));
}

// ─── Camera Access ────────────────────────────────────────────────────────────
async function startStream() {
  const btn = document.getElementById("startBtn");
  btn.disabled = true;
  setStatus("status", "Requesting camera access…", "connecting");

  try {
    localStream = await navigator.mediaDevices.getUserMedia(CONFIG.CAMERA_CONSTRAINTS);
  } catch (err) {
    log("Camera access failed:", err);
    btn.disabled = false;

    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      setStatus("status", "Camera permission denied. Please allow camera access and retry.", "error");
    } else if (err.name === "NotFoundError") {
      setStatus("status", "No camera found on this device.", "error");
    } else {
      setStatus("status", `Camera error: ${err.message}`, "error");
    }
    return;
  }

  // Show local preview
  const video = document.getElementById("localVideo");
  video.srcObject = localStream;
  video.classList.add("active");

  streaming = true;
  btn.textContent = "Streaming…";
  setStatus("status", "Camera active. Waiting for viewer…", "streaming");
  log("Local stream started");

  // If viewer already waiting, create offer immediately
  if (ws && ws.readyState === WebSocket.OPEN) {
    await createOffer();
  }
}

// ─── WebRTC ───────────────────────────────────────────────────────────────────
function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
  log("PeerConnection created");

  // Add local tracks
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // ICE candidate handler
  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      log("Sending ICE candidate");
      sendSignal("ice-candidate", candidate.toJSON());
    }
  };

  // Connection state logging
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    log("PeerConnection state:", state);

    const stateMap = {
      connecting: ["Establishing connection…", "connecting"],
      connected: ["🟢 Stream live — viewer connected", "streaming"],
      disconnected: ["Viewer disconnected", "error"],
      failed: ["Connection failed — retrying…", "error"],
      closed: ["Connection closed", "info"],
    };

    const [text, css] = stateMap[state] || ["Unknown state", "info"];
    setStatus("status", text, css);

    if (state === "failed" || state === "disconnected") {
      setTimeout(createOffer, 2000);
    }
  };

  peerConnection.oniceconnectionstatechange = () => {
    log("ICE state:", peerConnection.iceConnectionState);
  };

  return peerConnection;
}

async function createOffer() {
  if (!localStream) {
    log("No local stream yet — cannot create offer");
    return;
  }

  createPeerConnection();

  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    log("Sending SDP offer");
    sendSignal("offer", offer);
    setStatus("status", "Offer sent — waiting for viewer to answer…", "connecting");
  } catch (err) {
    log("Failed to create offer:", err);
    setStatus("status", "Failed to create offer. Check console.", "error");
  }
}

async function handleAnswer(answer) {
  if (!peerConnection) {
    log("No peer connection — ignoring answer");
    return;
  }
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    log("Remote description set (answer)");
  } catch (err) {
    log("Failed to set remote description:", err);
  }
}

async function handleRemoteIce(candidate) {
  if (!peerConnection) return;
  try {
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    log("Added remote ICE candidate");
  } catch (err) {
    log("Failed to add ICE candidate:", err);
  }
}
