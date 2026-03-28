const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../middleware/auth");
const logger = require("../utils/logger");

let io = null;

function initWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware for WebSocket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`WebSocket client connected: ${socket.user.username}`);

    // Join device-specific rooms for targeted updates
    socket.on("subscribe:device", (deviceId) => {
      socket.join(`device:${deviceId}`);
    });

    socket.on("unsubscribe:device", (deviceId) => {
      socket.leave(`device:${deviceId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`WebSocket client disconnected: ${socket.user.username}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initWebSocket, getIO };
