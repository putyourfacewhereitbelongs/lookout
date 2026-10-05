// server.ts
import express from "express";
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var requestedPort = Number.parseInt(process.env.PORT || "3000", 10);
var PORT = Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 3e3;
app.use(express.json({ limit: "10mb" }));
function getLocalNetworkIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (!iface.internal && iface.family === "IPv4") {
          return iface.address;
        }
      }
    }
  } catch (err) {
    console.error("Error getting local IP", err);
  }
  return "192.168.1.120";
}
var SYNC_TOKEN = process.env.LOOKOUT_SYNC_TOKEN?.trim() || "";
var SYNC_STORAGE_KEY = process.env.LOOKOUT_SYNC_STORAGE_KEY?.trim() || "";
var SYNC_STORAGE_PATH = process.env.LOOKOUT_SYNC_STORAGE_PATH || path.join(process.cwd(), ".lookout", "sync-state.enc");
var syncClients = /* @__PURE__ */ new Set();
function encryptionKey() {
  const secret = SYNC_STORAGE_KEY || SYNC_TOKEN;
  return secret ? createHash("sha256").update(secret).digest() : null;
}
function loadEncryptedSyncState() {
  const key = encryptionKey();
  if (!key || !existsSync(SYNC_STORAGE_PATH)) return null;
  try {
    const [ivText, tagText, encryptedText] = readFileSync(SYNC_STORAGE_PATH, "utf8").split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}
function persistEncryptedSyncState(state) {
  const key = encryptionKey();
  if (!key) return;
  try {
    mkdirSync(path.dirname(SYNC_STORAGE_PATH), { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
    writeFileSync(SYNC_STORAGE_PATH, [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":"), { mode: 384 });
  } catch {
  }
}
var sharedSyncStore = loadEncryptedSyncState();
function broadcastSync(message, except) {
  const encoded = JSON.stringify(message);
  for (const client of syncClients) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(encoded);
  }
}
var COMPREFACE_URL = (process.env.COMPREFACE_URL || "http://localhost:8000").replace(/\/+$/, "");
var COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY?.trim() || "";
var COMPREFACE_API_KEY_REQUIRED = "CompreFace API is not configured. Create a Face Recognition Service in CompreFace and set COMPREFACE_API_KEY.";
function comprefaceUrl(pathname) {
  return `${COMPREFACE_URL}${pathname}`;
}
function comprefaceHeaders() {
  return COMPREFACE_API_KEY ? { "x-api-key": COMPREFACE_API_KEY } : {};
}
app.post("/api/recognition/recognize", async (req, res) => {
  try {
    if (!COMPREFACE_API_KEY) {
      return res.status(503).json({ success: false, error: COMPREFACE_API_KEY_REQUIRED, result: [] });
    }
    const { imageBase64, detectionProfile, detProbThreshold } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "Missing imageBase64" });
    }
    const isDistantScan = detectionProfile === "distant";
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    if (buffer.byteLength > 8 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: "Frame exceeds the 8MB recognition payload limit", result: [] });
    }
    const formData = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    formData.append("file", blob, "frame.jpg");
    const requestedThreshold = typeof detProbThreshold === "number" && Number.isFinite(detProbThreshold) ? Math.min(0.95, Math.max(0.5, detProbThreshold)) : null;
    const detectorThreshold = requestedThreshold ?? (isDistantScan ? 0.93 : 0.82);
    const targetUrl = comprefaceUrl(
      `/api/v1/recognition/recognize?det_prob_threshold=${detectorThreshold}&face_plugins=landmarks&status=false`
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isDistantScan ? 8e3 : 15e3);
    let response;
    try {
      response = await fetch(targetUrl, {
        method: "POST",
        headers: comprefaceHeaders(),
        body: formData,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({ success: false, error: `Recognition provider returned HTTP ${response.status}`, result: [] });
    }
    if (!data || typeof data !== "object") {
      return res.status(502).json({ success: false, error: "Recognition provider returned an invalid response", result: [] });
    }
    if (data.code === 28 || data.message?.includes("No face")) {
      return res.json({ success: true, result: [] });
    }
    if (data.result && Array.isArray(data.result)) {
      return res.json({ success: true, result: data.result });
    }
    res.json({ success: true, result: [] });
  } catch (err) {
    console.error("Recognition proxy error:", err);
    const status = err?.name === "AbortError" ? 504 : 502;
    res.status(status).json({ success: false, error: err.message || "Recognition provider request failed", result: [] });
  }
});
app.get("/api/recognition/subjects", async (_req, res) => {
  try {
    if (!COMPREFACE_API_KEY) {
      return res.status(503).json({ success: false, error: COMPREFACE_API_KEY_REQUIRED, subjects: [] });
    }
    const targetUrl = comprefaceUrl("/api/v1/recognition/subjects");
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: comprefaceHeaders(),
      signal: AbortSignal.timeout(6e3)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `CompreFace returned HTTP ${response.status}. Check COMPREFACE_API_KEY.`,
        subjects: []
      });
    }
    res.json({ success: true, subjects: data?.subjects || [] });
  } catch (err) {
    console.error("Fetch subjects error:", err);
    res.json({ success: false, error: err.message, subjects: [] });
  }
});
app.get("/api/recognition/subject-images", async (_req, res) => {
  try {
    if (!COMPREFACE_API_KEY) {
      return res.status(503).json({ success: false, error: COMPREFACE_API_KEY_REQUIRED, images: {} });
    }
    const response = await fetch(comprefaceUrl("/api/v1/recognition/faces?page=0&size=1000"), {
      headers: comprefaceHeaders(),
      signal: AbortSignal.timeout(6e3)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `CompreFace returned HTTP ${response.status}. Check COMPREFACE_API_KEY.`,
        images: {}
      });
    }
    const images = {};
    for (const face of data?.faces || []) {
      if (face?.subject && face?.image_id && !images[face.subject]) {
        images[face.subject] = `/api/recognition/faces/${encodeURIComponent(face.image_id)}/image`;
      }
    }
    res.json({ success: true, images });
  } catch (err) {
    console.error("Fetch subject images error:", err);
    res.json({ success: false, images: {} });
  }
});
app.get("/api/recognition/faces/:imageId/image", async (req, res) => {
  try {
    if (!COMPREFACE_API_KEY) {
      return res.status(503).json({ success: false, error: COMPREFACE_API_KEY_REQUIRED });
    }
    const response = await fetch(comprefaceUrl(`/api/v1/recognition/faces/${encodeURIComponent(req.params.imageId)}/img`), {
      headers: comprefaceHeaders(),
      signal: AbortSignal.timeout(6e3)
    });
    if (!response.ok) return res.sendStatus(response.status);
    res.type(response.headers.get("content-type") || "image/jpeg");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error("Fetch CompreFace face image error:", err);
    res.sendStatus(502);
  }
});
app.post("/api/recognition/faces", async (req, res) => {
  try {
    if (!COMPREFACE_API_KEY) {
      return res.status(503).json({ success: false, error: COMPREFACE_API_KEY_REQUIRED });
    }
    const { subject, imageBase64 } = req.body;
    if (!subject || !imageBase64) {
      return res.status(400).json({ success: false, error: "Missing subject or imageBase64" });
    }
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const formData = new FormData();
    const blob = new Blob([buffer], { type: "image/jpeg" });
    formData.append("file", blob, "face.jpg");
    const targetUrl = comprefaceUrl(`/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`);
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: comprefaceHeaders(),
      body: formData,
      signal: AbortSignal.timeout(1e4)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: `CompreFace returned HTTP ${response.status}. Check COMPREFACE_API_KEY.`
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error("Enroll face error:", err);
    res.json({ success: false, error: err.message });
  }
});
app.get("/api/recognition/status", async (_req, res) => {
  if (!COMPREFACE_API_KEY) {
    return res.json({
      online: false,
      configured: false,
      endpoint: COMPREFACE_URL,
      error: COMPREFACE_API_KEY_REQUIRED,
      plugins: [],
      subjectCount: 0,
      subjects: []
    });
  }
  try {
    const targetUrl = comprefaceUrl("/api/v1/recognition/subjects");
    const response = await fetch(targetUrl, {
      headers: comprefaceHeaders(),
      signal: AbortSignal.timeout(5e3)
    });
    const data = await response.json();
    res.json({
      online: response.ok,
      configured: true,
      endpoint: COMPREFACE_URL,
      plugins: [],
      subjectCount: data?.subjects?.length || 0,
      subjects: data?.subjects || []
    });
  } catch (err) {
    res.json({
      online: false,
      configured: true,
      endpoint: COMPREFACE_URL,
      error: err.message,
      plugins: [],
      subjectCount: 0,
      subjects: []
    });
  }
});
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "Lookout AI",
    time: (/* @__PURE__ */ new Date()).toISOString()
  });
});
app.get("/api/network/info", (req, res) => {
  const localIp = getLocalNetworkIp();
  const host = req.get("host") || `${localIp}:${PORT}`;
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const appUrl = process.env.APP_URL || `${protocol}://${host}`;
  res.json({
    serverIp: localIp,
    serverPort: PORT,
    castRtspUrl: `rtsp://${localIp}:554/live/lookout_cam01`,
    castHttpMjpegUrl: `${appUrl}/api/stream/cast.mjpg`,
    castWebRtcUrl: `webrtc://${localIp}:8555/stream/feed`,
    onvifServiceUrl: `http://${localIp}:${PORT}/onvif/device_service`,
    appUrl
  });
});
app.get("/api/stream/cast.mjpg", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=--lookoutboundary",
    "Cache-Control": "no-cache",
    "Connection": "close",
    "Pragma": "no-cache"
  });
  let frameCount = 0;
  const interval = setInterval(() => {
    frameCount++;
    const now = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <rect width="640" height="360" fill="#0b1120"/>
      <circle cx="320" cy="180" r="90" fill="none" stroke="#06b6d4" stroke-width="2" stroke-dasharray="4 4" />
      <circle cx="320" cy="180" r="140" fill="none" stroke="#3b82f6" stroke-width="1" opacity="0.4" />
      <line x1="320" y1="20" x2="320" y2="340" stroke="#1e293b" stroke-width="1"/>
      <line x1="20" y1="180" x2="620" y2="180" stroke="#1e293b" stroke-width="1"/>
      <text x="30" y="45" fill="#10b981" font-family="monospace" font-size="16" font-weight="bold">LOOKOUT AI // IP CAST BROADCAST</text>
      <text x="30" y="70" fill="#94a3b8" font-family="monospace" font-size="12">STATUS: RTSP/MJPEG LIVE BROADCAST</text>
      <text x="30" y="90" fill="#94a3b8" font-family="monospace" font-size="12">FPS: 60 (OPTIMIZED) | FRAME #${frameCount}</text>
      <text x="30" y="110" fill="#38bdf8" font-family="monospace" font-size="12">TIME: ${now}</text>
      <rect x="230" y="110" width="180" height="140" fill="#ef4444" fill-opacity="0.15" stroke="#ef4444" stroke-width="2" rx="4"/>
      <text x="240" y="130" fill="#ef4444" font-family="monospace" font-size="12" font-weight="bold">TARGET: MONITORED ZONE</text>
      <text x="460" y="335" fill="#64748b" font-family="monospace" font-size="11">SERVER PORT: ${PORT}</text>
    </svg>`;
    const frame = Buffer.from(svg);
    res.write(`--lookoutboundary\r
`);
    res.write(`Content-Type: image/svg+xml\r
`);
    res.write(`Content-Length: ${frame.length}\r
\r
`);
    res.write(frame);
    res.write(`\r
`);
  }, 100);
  req.on("close", () => {
    clearInterval(interval);
  });
});
app.get("/api/stream/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing url query parameter");
  }
  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          return;
        }
        res.write(value);
        await pump();
      };
      await pump();
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ error: "Proxy fetch failed", details: String(err) });
  }
});
function syncRequestAuthorized(req) {
  if (!SYNC_TOKEN) return true;
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "") || "";
  return bearer === SYNC_TOKEN || req.query.token === SYNC_TOKEN;
}
app.post("/api/sync/push", (req, res) => {
  if (!syncRequestAuthorized(req)) return res.status(401).json({ error: "Sync authentication required" });
  const { deviceId, payload } = req.body;
  if (!payload) {
    return res.status(400).json({ error: "Missing payload" });
  }
  sharedSyncStore = {
    timestamp: Date.now(),
    deviceId: deviceId || "anonymous_station",
    payload
  };
  persistEncryptedSyncState(sharedSyncStore);
  broadcastSync({ type: "state", ...sharedSyncStore });
  res.json({ success: true, timestamp: sharedSyncStore.timestamp });
});
app.get("/api/sync/pull", (req, res) => {
  if (!syncRequestAuthorized(req)) return res.status(401).json({ error: "Sync authentication required" });
  if (!sharedSyncStore) {
    return res.json({ available: false });
  }
  res.json({
    available: true,
    timestamp: sharedSyncStore.timestamp,
    deviceId: sharedSyncStore.deviceId,
    payload: sharedSyncStore.payload
  });
});
var httpServer = createServer(app);
var syncWss = new WebSocketServer({ server: httpServer, path: "/ws" });
syncWss.on("connection", (socket, request) => {
  const token = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`).searchParams.get("token") || "";
  if (SYNC_TOKEN && token !== SYNC_TOKEN) {
    socket.close(1008, "Sync authentication required");
    return;
  }
  syncClients.add(socket);
  if (sharedSyncStore) socket.send(JSON.stringify({ type: "state", ...sharedSyncStore }));
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message?.type !== "state" || typeof message.payload !== "string" || message.payload.length > 8e6) return;
      sharedSyncStore = { timestamp: Date.now(), deviceId: String(message.deviceId || "portal"), payload: message.payload };
      persistEncryptedSyncState(sharedSyncStore);
      broadcastSync({ type: "state", ...sharedSyncStore }, socket);
    } catch {
      socket.close(1003, "Invalid sync message");
    }
  });
  socket.on("close", () => syncClients.delete(socket));
  socket.on("error", () => syncClients.delete(socket));
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true, allowedHosts: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Lookout AI DVR Server running on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
//# sourceMappingURL=server.js.map
