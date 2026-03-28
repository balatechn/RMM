const express = require("express");
const { query } = require("../config/database");
const { authenticateToken, authenticateAgent } = require("../middleware/auth");
const { metricsLimiter, apiLimiter } = require("../middleware/rateLimiter");
const { getIO } = require("../services/websocket");
const { evaluateMetric } = require("../services/alertEngine");
const logger = require("../utils/logger");

const router = express.Router();

// POST /api/metrics — ingest metrics from agent
router.post("/", metricsLimiter, authenticateAgent, async (req, res) => {
  try {
    const { cpu_usage, ram_usage, ram_total, ram_used, disk_usage, disk_total, disk_used, uptime, process_count, top_processes } = req.body;

    if (cpu_usage == null || ram_usage == null || disk_usage == null) {
      return res.status(400).json({ error: "cpu_usage, ram_usage, and disk_usage are required" });
    }

    const deviceId = req.device.id;

    // Insert metric
    const result = await query(
      `INSERT INTO metrics (device_id, cpu_usage, ram_usage, ram_total, ram_used, disk_usage, disk_total, disk_used, uptime, process_count, top_processes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [deviceId, cpu_usage, ram_usage, ram_total, ram_used, disk_usage, disk_total, disk_used, uptime, process_count, JSON.stringify(top_processes || [])]
    );

    // Update device status and IP
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    await query(
      "UPDATE devices SET status = 'online', last_seen = NOW(), ip_address = $1, os_info = COALESCE($2, os_info), updated_at = NOW() WHERE id = $3",
      [ip, req.body.os_info || null, deviceId]
    );

    // Emit real-time update via WebSocket
    const io = getIO();
    if (io) {
      io.to(`device:${deviceId}`).emit("metric", { deviceId, ...result.rows[0] });
      io.emit("device:status", { deviceId, status: "online", last_seen: new Date() });
    }

    // Evaluate alerts asynchronously
    evaluateMetric(deviceId, req.device.name, { cpu_usage, ram_usage, disk_usage }).catch((err) =>
      logger.error("Alert evaluation error", { error: err.message })
    );

    res.status(201).json({ received: true });
  } catch (err) {
    logger.error("Metrics ingestion error", { error: err.message });
    res.status(500).json({ error: "Failed to store metrics" });
  }
});

// GET /api/metrics/:deviceId — get metrics for a device
router.get("/:deviceId", apiLimiter, authenticateToken, async (req, res) => {
  try {
    const { limit = 100, from, to } = req.query;
    let sql = "SELECT * FROM metrics WHERE device_id = $1";
    const params = [req.params.deviceId];

    if (from) {
      params.push(from);
      sql += ` AND created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND created_at <= $${params.length}`;
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
    params.push(safeLimit);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

// GET /api/metrics/:deviceId/latest — get latest metric
router.get("/:deviceId/latest", apiLimiter, authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM metrics WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.params.deviceId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "No metrics found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch latest metric" });
  }
});

module.exports = router;
