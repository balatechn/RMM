const express = require("express");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

const AGENT_DIR = path.join(__dirname, "../../agent");

// Middleware: accept token from query string for direct downloads
function authFromQuery(req, res, next) {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

// GET /api/agent/download — download agent as ZIP
router.get("/download", authFromQuery, authenticateToken, (req, res) => {
  if (!fs.existsSync(AGENT_DIR)) {
    return res.status(404).json({ error: "Agent files not found" });
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", "attachment; filename=rmm-agent.zip");

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.on("error", (err) => res.status(500).json({ error: err.message }));
  archive.pipe(res);
  archive.directory(AGENT_DIR, "rmm-agent");
  archive.finalize();
});

// GET /api/agent/files — list agent files
router.get("/files", authenticateToken, (req, res) => {
  if (!fs.existsSync(AGENT_DIR)) {
    return res.json({ files: [] });
  }
  const files = fs.readdirSync(AGENT_DIR).map((f) => ({
    name: f,
    size: fs.statSync(path.join(AGENT_DIR, f)).size,
  }));
  res.json({ files });
});

module.exports = router;
