const bcrypt = require("bcryptjs");
const { query } = require("./database");
const logger = require("../utils/logger");

async function seed() {
  try {
    // Check if admin already exists
    const existing = await query("SELECT id FROM users WHERE username = $1", ["admin"]);
    if (existing.rows.length > 0) {
      logger.info("Admin user already exists, skipping seed");
      return;
    }

    const hash = await bcrypt.hash("admin123", 12);
    await query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)",
      ["admin", "admin@rmm.local", hash, "admin"]
    );
    logger.info("Default admin user created (username: admin, password: admin123) — CHANGE THIS IMMEDIATELY");
  } catch (err) {
    logger.error("Seed error", { error: err.message });
  }
}

// Run directly
if (require.main === module) {
  require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
  const { initDb } = require("./database");
  (async () => {
    await initDb();
    await seed();
    process.exit(0);
  })();
}

module.exports = { seed };
