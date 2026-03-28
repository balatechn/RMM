const express = require("express");
const crypto = require("crypto");
const { query } = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");

const router = express.Router();
router.use(apiLimiter);

// GET /api/devices — list all devices
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, location, department, search } = req.query;
    let sql = "SELECT id, name, hostname, ip_address, os_info, location, department, status, last_seen, created_at FROM devices WHERE 1=1";
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    if (location) {
      params.push(`%${location}%`);
      sql += ` AND location ILIKE $${params.length}`;
    }
    if (department) {
      params.push(`%${department}%`);
      sql += ` AND department ILIKE $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR hostname ILIKE $${params.length})`;
    }

    sql += " ORDER BY name ASC";
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

// GET /api/devices/:id — single device
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, name, hostname, ip_address, os_info, location, department, status, last_seen, created_at FROM devices WHERE id = $1",
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Device not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch device" });
  }
});

// POST /api/devices/register — register a new device (admin only)
router.post("/register", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { name, hostname, location, department } = req.body;
    if (!name) return res.status(400).json({ error: "Device name is required" });

    const apiKey = `rmm_${crypto.randomBytes(32).toString("hex")}`;

    const result = await query(
      `INSERT INTO devices (name, hostname, location, department, api_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, hostname, api_key, location, department, status, created_at`,
      [name, hostname || "", location || "", department || "", apiKey]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to register device" });
  }
});

// PUT /api/devices/:id — update device details
router.put("/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { name, location, department } = req.body;
    const result = await query(
      `UPDATE devices SET name = COALESCE($1, name), location = COALESCE($2, location),
       department = COALESCE($3, department), updated_at = NOW()
       WHERE id = $4 RETURNING id, name, hostname, location, department, status`,
      [name, location, department, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Device not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to update device" });
  }
});

// DELETE /api/devices/:id
router.delete("/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const result = await query("DELETE FROM devices WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Device not found" });
    res.json({ message: "Device deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete device" });
  }
});

// POST /api/devices/:id/regenerate-key — regenerate API key
router.post("/:id/regenerate-key", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const apiKey = `rmm_${crypto.randomBytes(32).toString("hex")}`;
    const result = await query(
      "UPDATE devices SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id, api_key",
      [apiKey, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Device not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to regenerate key" });
  }
});

module.exports = router;
