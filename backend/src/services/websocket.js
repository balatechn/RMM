const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const { query } = require("../config/database");
const logger = require("../utils/logger");

let io = null;

// Track connected agents: { deviceId: socketId }
const connectedAgents = new Map();

function initWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 5e6,
  });

  // --- Dashboard namespace (default /) ---
  // Auth middleware for dashboard users
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const apiKey = socket.handshake.auth?.apiKey;

    // Agent connection
    if (apiKey) {
      socket._isAgent = true;
      socket._apiKey = apiKey;
      return next();
    }

    // Dashboard user connection
    if (!token) return next(new Error("Authentication required"));
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    // ===== AGENT CONNECTION =====
    if (socket._isAgent) {
      try {
        const result = await query("SELECT id, name, hostname FROM devices WHERE api_key = $1", [socket._apiKey]);
        if (result.rows.length === 0) {
          logger.warn("Agent connection rejected: invalid API key");
          return socket.disconnect(true);
        }
        const device = result.rows[0];
        socket.deviceId = device.id;
        socket.deviceName = device.name;
        connectedAgents.set(device.id, socket.id);
        socket.join(`agent:${device.id}`);

        // Mark device online
        await query("UPDATE devices SET status = 'online', last_seen = NOW() WHERE id = $1", [device.id]);
        io.emit("device:status", { deviceId: device.id, status: "online", last_seen: new Date() });
        io.emit("agent:connected", { deviceId: device.id });

        logger.info(`Agent connected: ${device.name} (${device.id})`);

        // Agent sends command results back
        socket.on("cmd:output", (data) => {
          io.to(`device:${device.id}`).emit("cmd:output", { deviceId: device.id, ...data });
        });

        socket.on("cmd:done", (data) => {
          io.to(`device:${device.id}`).emit("cmd:done", { deviceId: device.id, ...data });
        });

        socket.on("processes:result", (data) => {
          io.to(`device:${device.id}`).emit("processes:result", { deviceId: device.id, ...data });
        });

        socket.on("sysinfo:result", (data) => {
          io.to(`device:${device.id}`).emit("sysinfo:result", { deviceId: device.id, ...data });
        });

        socket.on("services:result", (data) => {
          io.to(`device:${device.id}`).emit("services:result", { deviceId: device.id, ...data });
        });

        socket.on("software:result", (data) => {
          io.to(`device:${device.id}`).emit("software:result", { deviceId: device.id, ...data });
        });

        socket.on("users:result", (data) => {
          io.to(`device:${device.id}`).emit("users:result", { deviceId: device.id, ...data });
        });

        socket.on("user:action:result", (data) => {
          io.to(`device:${device.id}`).emit("user:action:result", { deviceId: device.id, ...data });
        });

        socket.on("files:result", (data) => {
          io.to(`device:${device.id}`).emit("files:result", { deviceId: device.id, ...data });
        });

        socket.on("disconnect", async () => {
          connectedAgents.delete(device.id);
          await query("UPDATE devices SET status = 'offline' WHERE id = $1", [device.id]).catch(() => {});
          io.emit("device:status", { deviceId: device.id, status: "offline" });
          io.emit("agent:disconnected", { deviceId: device.id });
          logger.info(`Agent disconnected: ${device.name}`);
        });
      } catch (err) {
        logger.error("Agent connection error", { error: err.message });
        socket.disconnect(true);
      }
      return;
    }

    // ===== DASHBOARD USER CONNECTION =====
    logger.info(`Dashboard connected: ${socket.user.username}`);

    socket.on("subscribe:device", (deviceId) => {
      socket.join(`device:${deviceId}`);
    });

    socket.on("unsubscribe:device", (deviceId) => {
      socket.leave(`device:${deviceId}`);
    });

    // Relay commands from dashboard to agent
    socket.on("cmd:exec", ({ deviceId, command, cmdId }) => {
      const agentSocketId = connectedAgents.get(deviceId);
      if (!agentSocketId) {
        return socket.emit("cmd:error", { deviceId, cmdId, error: "Agent is offline" });
      }
      io.to(`agent:${deviceId}`).emit("cmd:exec", { command, cmdId });
    });

    socket.on("cmd:kill", ({ deviceId, cmdId }) => {
      io.to(`agent:${deviceId}`).emit("cmd:kill", { cmdId });
    });

    socket.on("processes:get", ({ deviceId }) => {
      const agentSocketId = connectedAgents.get(deviceId);
      if (!agentSocketId) {
        return socket.emit("processes:result", { deviceId, error: "Agent is offline", processes: [] });
      }
      io.to(`agent:${deviceId}`).emit("processes:get");
    });

    socket.on("process:kill", ({ deviceId, pid }) => {
      io.to(`agent:${deviceId}`).emit("process:kill", { pid });
    });

    socket.on("sysinfo:get", ({ deviceId }) => {
      const agentSocketId = connectedAgents.get(deviceId);
      if (!agentSocketId) {
        return socket.emit("sysinfo:result", { deviceId, error: "Agent is offline" });
      }
      io.to(`agent:${deviceId}`).emit("sysinfo:get");
    });

    socket.on("services:get", ({ deviceId }) => {
      io.to(`agent:${deviceId}`).emit("services:get");
    });

    socket.on("software:get", ({ deviceId }) => {
      io.to(`agent:${deviceId}`).emit("software:get");
    });

    socket.on("service:action", ({ deviceId, serviceName, action }) => {
      io.to(`agent:${deviceId}`).emit("service:action", { serviceName, action });
    });

    socket.on("users:get", ({ deviceId }) => {
      io.to(`agent:${deviceId}`).emit("users:get");
    });

    socket.on("user:lock", ({ deviceId, username }) => {
      io.to(`agent:${deviceId}`).emit("user:lock", { username });
    });

    socket.on("user:unlock", ({ deviceId, username }) => {
      io.to(`agent:${deviceId}`).emit("user:unlock", { username });
    });

    socket.on("files:list", ({ deviceId, path }) => {
      io.to(`agent:${deviceId}`).emit("files:list", { path: path || "" });
    });

    // Check if agent is connected
    socket.on("agent:status", ({ deviceId }) => {
      socket.emit("agent:status", { deviceId, connected: connectedAgents.has(deviceId) });
    });

    socket.on("disconnect", () => {
      logger.info(`Dashboard disconnected: ${socket.user.username}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function isAgentConnected(deviceId) {
  return connectedAgents.has(deviceId);
}

module.exports = { initWebSocket, getIO, isAgentConnected };
