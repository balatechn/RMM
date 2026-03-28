require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { initDb } = require("./config/database");
const { seed } = require("./config/seed");
const { initWebSocket } = require("./services/websocket");
const { startAlertEngine } = require("./services/alertEngine");
const logger = require("./utils/logger");

const authRoutes = require("./routes/auth");
const deviceRoutes = require("./routes/devices");
const metricRoutes = require("./routes/metrics");
const alertRoutes = require("./routes/alerts");

const app = express();
const server = http.createServer(app);

// --- Security middleware ---
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "1mb" }));

// --- Health check ---
app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/metrics", metricRoutes);
app.use("/api/alerts", alertRoutes);

// --- Global error handler ---
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(err.status || 500).json({ error: "Internal server error" });
});

// --- Bootstrap ---
const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await initDb();
    await seed();
    logger.info("Database initialized");

    initWebSocket(server);
    logger.info("WebSocket server started");

    startAlertEngine();
    logger.info("Alert engine started");

    server.listen(PORT, () => {
      logger.info(`RMM Backend running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
})();
