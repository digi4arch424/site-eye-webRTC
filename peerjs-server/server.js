/**
 * peerjs-server/server.js
 * Dedicated PeerJS signaling server for Construction Cam.
 * Deploy to Render.com free tier.
 */

const { PeerServer } = require("peer");

const PORT = process.env.PORT || 9000;
const PATH = process.env.PEER_PATH || "/construction-cam";

const peerServer = PeerServer({
  port: PORT,
  path: PATH,
  allow_discovery: false,
  proxied: true,              // required behind Render's reverse proxy
  alive_timeout: 60000,
  cleanup_out_msgs: 1000,
});

peerServer.on("connection", (client) => {
  console.log(`[${new Date().toISOString()}] Peer connected: ${client.getId()}`);
});

peerServer.on("disconnect", (client) => {
  console.log(`[${new Date().toISOString()}] Peer disconnected: ${client.getId()}`);
});

console.log(`PeerJS server running on port ${PORT}, path ${PATH}`);
