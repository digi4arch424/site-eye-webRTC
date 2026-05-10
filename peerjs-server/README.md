# Construction Cam — PeerJS Signaling Server

Dedicated PeerJS server. Deploy to Render.com free tier.

## Deploy to Render.com (Free)

1. Go to https://render.com and sign up with GitHub
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `peerjs-server`
5. Set these values:
   - **Name**: `construction-cam-peer`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
6. Click **Create Web Service**
7. Wait ~2 minutes — Render gives you a URL like:
   `https://construction-cam-peer.onrender.com`

## Update app.js

Once deployed, update `app.js` with your Render URL:

```js
PEER_SERVER: {
  host: "construction-cam-peer.onrender.com",
  port: 443,
  path: "/construction-cam",
  secure: true,
}
```

## Notes

- Free tier sleeps after 15 minutes of inactivity
- First connection after sleep takes ~30 seconds to wake
- Upgrade to Render Starter ($7/month) for always-on
- Logs available in Render dashboard
