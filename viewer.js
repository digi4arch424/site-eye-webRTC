/**
 * viewer.js — Remote stream viewer logic
 * Receives WebRTC stream from sender via signaling server.
 */

let peerConnection = null;
let ws = null;
let wsReconnectTimer = null;
let backoff = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  backoff = createBackoff();
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
  log("Connecting:", CONFIG.SIGNALING_SERVER_URL);

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
    setStatus("status", "Connected — waiting for camera feed…", "connected");

    const regMsg = buildMessage("register");
    regMsg.role = "viewer";
    ws.send(JSON.stringify(regMsg));
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    log("Signal received:", msg.type);

    switch (msg.type) {
      case "sender-ready":
        log("Sender is online");
        setStatus("status", "Camera online — waiting for stream offer…", "connected");
        break;

      case "offer":
        await handleOffer(msg.payload);
        break;

      case "ice-candidate":
        await handleRemoteIce(msg.payload);
        break;

      case "sender-disconnected":
        log("Sender disconnected");
        setStatus("status", "Camera disconnected. Waiting for reconnect…", "error");
        const video = document.getElementById("remoteVideo");
        video.srcObject = null;
        video.classList.remove("active");
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        break;
    }
  };

  ws.onclose = () => {
    log("Signaling disconnected");
    setStatus("status", "Disconnected. Reconnecting…", "error");
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
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(buildMessage(type, payload)));
}

// ─── WebRTC ───────────────────────────────────────────────────────────────────
function createPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
  }

  peerConnection = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
  log("PeerConnection created");

  // Receive remote stream
  peerConnection.ontrack = ({ streams }) => {
    log("Remote track received");
    const video = document.getElementById("remoteVideo");
    video.srcObject = streams[0];
    video.classList.add("active");
    setStatus("status", "🟢 Live stream connected", "streaming");
  };

  peerConnection.onicecandidate = ({ candidate }) => {
    if (candidate) {
      log("Sending ICE candidate");
      sendSignal("ice-candidate", candidate.toJSON());
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    log("PeerConnection state:", state);

    const stateMap = {
      connecting: ["Establishing connection…", "connecting"],
      connected: ["🟢 Stream connected", "streaming"],
      disconnected: ["Stream disconnected", "error"],
      failed: ["Connection failed", "error"],
      closed: ["Connection closed", "info"],
    };

    const [text, css] = stateMap[state] || ["Unknown state", "info"];
    setStatus("status", text, css);
  };

  peerConnection.oniceconnectionstatechange = () => {
    log("ICE state:", peerConnection.iceConnectionState);
  };

  return peerConnection;
}

async function handleOffer(offer) {
  log("Received SDP offer — creating answer");
  setStatus("status", "Received offer — connecting…", "connecting");

  createPeerConnection();

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    log("Sending SDP answer");
    sendSignal("answer", answer);
  } catch (err) {
    log("Failed to handle offer:", err);
    setStatus("status", "Failed to process stream offer. Check console.", "error");
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
