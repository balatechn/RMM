const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const { authenticateToken, requireRole, JWT_SECRET } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

// POST /api/auth/login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const result = await query("SELECT * FROM users WHERE username = $1", [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/register (admin only)
router.post("/register", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email and password required" });
    }

    const validRole = role === "admin" || role === "viewer" ? role : "viewer";
    const hash = await bcrypt.hash(password, 12);

    const result = await query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
      [username, email, hash, validRole]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Username or email already exists" });
    }
    res.status(500).json({ error: "Registration failed" });
  }
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT id, username, email, role, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// GET /api/auth/users — list all users (admin only)
router.get("/users", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const result = await query(
      "SELECT id, username, email, role, created_at, updated_at FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PUT /api/auth/users/:id — update user (admin only)
router.put("/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role } = req.body;

    const existing = await query("SELECT id FROM users WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const validRole = role === "admin" || role === "viewer" ? role : undefined;
    const updates = [];
    const values = [];
    let idx = 1;

    if (username) { updates.push(`username = $${idx++}`); values.push(username); }
    if (email) { updates.push(`email = $${idx++}`); values.push(email); }
    if (validRole) { updates.push(`role = $${idx++}`); values.push(validRole); }

    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, username, email, role, created_at, updated_at`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Username or email already exists" });
    res.status(500).json({ error: "Failed to update user" });
  }
});

// PUT /api/auth/users/:id/password — reset password (admin only)
router.put("/users/:id/password", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await query("SELECT id FROM users WHERE id = $1", [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const hash = await bcrypt.hash(password, 12);
    await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, id]);
    res.json({ message: "Password reset successfully" });
  } catch {
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// PUT /api/auth/change-password — change own password
router.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Current password and new password (min 6 chars) required" });
    }

    const result = await query("SELECT password_hash FROM users WHERE id = $1", [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const hash = await bcrypt.hash(newPassword, 12);
    await query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.user.id]);
    res.json({ message: "Password changed successfully" });
  } catch {
    res.status(500).json({ error: "Failed to change password" });
  }
});

// DELETE /api/auth/users/:id — delete user (admin only)
router.delete("/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) return res.status(400).json({ error: "Cannot delete your own account" });

    const result = await query("DELETE FROM users WHERE id = $1 RETURNING id, username", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

    res.json({ message: `User ${result.rows[0].username} deleted` });
  } catch {
    res.status(500).json({ error: "Failed to delete user" });
  }
});

module.exports = router;
