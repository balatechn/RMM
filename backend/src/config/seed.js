const bcrypt = require("bcryptjs");
const { query } = require("./database");
const logger = require("../utils/logger");

async function seed() {
  try {
    const hash = await bcrypt.hash("Nzt@2026!!", 12);
    await query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE SET password_hash = $3, role = $4`,
      ["bala", "bala@rmm.local", hash, "admin"]
    );
    logger.info("Admin user upserted (username: bala)");
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
