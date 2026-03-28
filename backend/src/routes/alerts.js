const express = require("express");
const { query } = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

const router = express.Router();
router.use(apiLimiter);
router.use(authenticateToken);

// GET /api/alerts — list alerts with filters
router.get("/", async (req, res) => {
  try {
    const { status, severity, device_id, limit = 100, offset = 0 } = req.query;
    let sql = `
      SELECT a.*, d.name as device_name
      FROM alerts a JOIN devices d ON a.device_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND a.status = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      sql += ` AND a.severity = $${params.length}`;
    }
    if (device_id) {
      params.push(device_id);
      sql += ` AND a.device_id = $${params.length}`;
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
    params.push(safeLimit, safeOffset);
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// GET /api/alerts/stats — alert summary counts
router.get("/stats", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status = 'active') as critical_active
      FROM alerts
    `);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch alert stats" });
  }
});

// PUT /api/alerts/:id/acknowledge
router.put("/:id/acknowledge", async (req, res) => {
  try {
    const result = await query(
      `UPDATE alerts SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2 AND status = 'active' RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Alert not found or already handled" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// PUT /api/alerts/:id/resolve
router.put("/:id/resolve", async (req, res) => {
  try {
    const result = await query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND status IN ('active', 'acknowledged') RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Alert not found or already resolved" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

module.exports = router;
