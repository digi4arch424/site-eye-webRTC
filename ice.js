/**
 * ice.js — ICE Server Configuration Module
 * Construction Camera System
 *
 * Provides the full ICE stack for WebRTC peer connections.
 * Loaded before sender.js and viewer.js via <script> tag.
 *
 * Strategy (tried automatically by WebRTC in order):
 * 1. Direct P2P         — no server, fastest, works on same network
 * 2. STUN               — discovers public IP, works ~60% of internet connections
 * 3. TURN UDP           — relays video, works on most networks
 * 4. TURN TCP           — bypasses UDP-blocking firewalls
 * 5. TURN TLS port 443  — bypasses corporate firewalls
 * 6. TURNS TLS TCP      — last resort, most restrictive networks
 *
 * Provider: Open Relay Project (Metered free tier)
 * - No API key required
 * - 20 GB/month free TURN usage
 * - https://openrelay.metered.ca
 *
 * To upgrade to Metered paid (API key):
 * Replace ICE_CONFIG.iceServers with:
 * const res = await fetch("https://yourapp.metered.live/api/v1/turn/credentials?apiKey=YOUR_KEY");
 * ICE_CONFIG.iceServers = await res.json();
 *
 * Future modules (M5 Multiset) may override ICE_CONFIG.iceServers
 * with their own credentials before creating RTCPeerConnection.
 */

const ICE_CONFIG = {
  iceServers: [
    // ── STUN ────────────────────────────────────────────────────────────────
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },

    // ── TURN UDP (port 80) ───────────────────────────────────────────────────
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },

    // ── TURN TCP (port 80) — bypasses UDP-blocking firewalls ─────────────────
    {
      urls: "turn:openrelay.metered.ca:80?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },

    // ── TURN TLS (port 443) — bypasses corporate firewalls ───────────────────
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },

    // ── TURNS TLS TCP (port 443) — most restrictive networks ─────────────────
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],

  // ICE transport policy:
  // "all"   — try P2P first, fall back to TURN (default, recommended)
  // "relay" — force TURN only (use for debugging NAT issues)
  iceTransportPolicy: "all",
};
