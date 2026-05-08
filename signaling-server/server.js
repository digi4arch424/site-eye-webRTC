/**
 * Construction Camera Signaling Server
 * Minimal WebSocket relay for WebRTC peer connection setup.
 * Supports one sender + one viewer per camera session (MVP).
 */

const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// Active sessions: cameraId -> { sender, viewer }
const sessions = new Map();

function getOrCreateSession(cameraId) {
  if (!sessions.has(cameraId)) {
    sessions.set(cameraId, { sender: null, viewer: null });
  }
  return sessions.get(cameraId);
}

function send(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function log(msg, data = "") {
  console.log(`[${new Date().toISOString()}] ${msg}`, data);
}

wss.on("connection", (ws) => {
  let role = null;
  let cameraId = null;

  log("New connection");

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      log("Invalid JSON received");
      return;
    }

    const {
      type,
      payload,
      cameraId: msgCameraId = "site-cam-001",
      siteId = "site-alpha",
      timestamp = Date.now(),
    } = msg;

    // Handle registration
    if (type === "register") {
      role = msg.role; // "sender" or "viewer"
      cameraId = msgCameraId;
      const session = getOrCreateSession(cameraId);

      if (role === "sender") {
        // Disconnect old sender if present
        if (session.sender && session.sender !== ws) {
          session.sender.close();
        }
        session.sender = ws;
        log(`Sender registered for camera: ${cameraId}`);

        // Notify viewer a new sender is available
        if (session.viewer) {
          send(session.viewer, {
            type: "sender-ready",
            cameraId,
            siteId,
            timestamp: Date.now(),
          });
        }
      } else if (role === "viewer") {
        if (session.viewer && session.viewer !== ws) {
          session.viewer.close();
        }
        session.viewer = ws;
        log(`Viewer registered for camera: ${cameraId}`);

        // Notify sender that a viewer is waiting
        if (session.sender) {
          send(session.sender, {
            type: "viewer-ready",
            cameraId,
            siteId,
            timestamp: Date.now(),
          });
        }
      }
      return;
    }

    if (!cameraId) {
      log("Message received before registration, ignoring");
      return;
    }

    const session = getOrCreateSession(cameraId);

    // Relay messages between sender and viewer
    if (type === "offer") {
      log(`Relaying offer from sender -> viewer [${cameraId}]`);
      send(session.viewer, { type, payload, cameraId, siteId, timestamp });
    } else if (type === "answer") {
      log(`Relaying answer from viewer -> sender [${cameraId}]`);
      send(session.sender, { type, payload, cameraId, siteId, timestamp });
    } else if (type === "ice-candidate") {
      // Relay to the other party
      if (role === "sender") {
        send(session.viewer, { type, payload, cameraId, siteId, timestamp });
      } else if (role === "viewer") {
        send(session.sender, { type, payload, cameraId, siteId, timestamp });
      }
    } else {
      log(`Unknown message type: ${type}`);
    }
  });

  ws.on("close", () => {
    if (!cameraId) return;
    const session = sessions.get(cameraId);
    if (!session) return;

    if (role === "sender" && session.sender === ws) {
      session.sender = null;
      log(`Sender disconnected [${cameraId}]`);
      send(session.viewer, {
        type: "sender-disconnected",
        cameraId,
        timestamp: Date.now(),
      });
    } else if (role === "viewer" && session.viewer === ws) {
      session.viewer = null;
      log(`Viewer disconnected [${cameraId}]`);
    }

    // Clean up empty sessions
    if (!session.sender && !session.viewer) {
      sessions.delete(cameraId);
      log(`Session removed [${cameraId}]`);
    }
  });

  ws.on("error", (err) => {
    log("WebSocket error:", err.message);
  });
});

log(`Signaling server running on ws://0.0.0.0:${PORT}`);
