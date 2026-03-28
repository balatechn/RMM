const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  logger.error("Unexpected database pool error", { error: err.message });
});

async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn("Slow query detected", { text, duration, rows: result.rowCount });
  }
  return result;
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        hostname VARCHAR(255),
        ip_address VARCHAR(45),
        os_info TEXT,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        location VARCHAR(255) DEFAULT '',
        department VARCHAR(255) DEFAULT '',
        status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
        last_seen TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id BIGSERIAL PRIMARY KEY,
        device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        cpu_usage REAL,
        ram_usage REAL,
        ram_total BIGINT,
        ram_used BIGINT,
        disk_usage REAL,
        disk_total BIGINT,
        disk_used BIGINT,
        uptime BIGINT,
        process_count INT,
        top_processes JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id BIGSERIAL PRIMARY KEY,
        device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'critical')),
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
        acknowledged_by UUID REFERENCES users(id),
        acknowledged_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes for performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_metrics_device_id ON metrics(device_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_metrics_created_at ON metrics(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_metrics_device_time ON metrics(device_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_device_id ON alerts(device_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_devices_api_key ON devices(api_key)`);

    await client.query("COMMIT");
    logger.info("Database tables and indexes created successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, initDb };
