const jwt = require("jsonwebtoken");
const { query } = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Authenticate JWT token (for dashboard users)
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Authenticate agent API key (for device agents)
async function authenticateAgent(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  try {
    const result = await query("SELECT id, name, hostname FROM devices WHERE api_key = $1", [apiKey]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    req.device = result.rows[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: "Authentication error" });
  }
}

// Role-based access control
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticateToken, authenticateAgent, requireRole, JWT_SECRET };
