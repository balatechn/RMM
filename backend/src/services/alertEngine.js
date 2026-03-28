const { query } = require("../config/database");
const { getIO } = require("./websocket");
const { sendAlertEmail } = require("./emailService");
const logger = require("../utils/logger");

const THRESHOLDS = {
  cpu: parseFloat(process.env.ALERT_CPU_THRESHOLD) || 85,
  ram: parseFloat(process.env.ALERT_RAM_THRESHOLD) || 90,
  disk_free: parseFloat(process.env.ALERT_DISK_THRESHOLD) || 10,
  offline_minutes: parseInt(process.env.ALERT_OFFLINE_MINUTES, 10) || 2,
};

// Debounce: don't re-alert same type for same device within 5 minutes
const alertCooldown = new Map();
const COOLDOWN_MS = 5 * 60 * 1000;

function cooldownKey(deviceId, type) {
  return `${deviceId}:${type}`;
}

function isOnCooldown(deviceId, type) {
  const key = cooldownKey(deviceId, type);
  const last = alertCooldown.get(key);
  if (last && Date.now() - last < COOLDOWN_MS) return true;
  return false;
}

function setCooldown(deviceId, type) {
  alertCooldown.set(cooldownKey(deviceId, type), Date.now());
}

async function createAlert(deviceId, deviceName, type, severity, message) {
  if (isOnCooldown(deviceId, type)) return;

  try {
    const result = await query(
      "INSERT INTO alerts (device_id, type, severity, message) VALUES ($1, $2, $3, $4) RETURNING *",
      [deviceId, type, severity, message]
    );

    setCooldown(deviceId, type);

    const alert = { ...result.rows[0], device_name: deviceName };

    // Push via WebSocket
    const io = getIO();
    if (io) {
      io.emit("alert:new", alert);
    }

    // Send email
    sendAlertEmail(alert).catch((err) =>
      logger.error("Failed to send alert email", { error: err.message })
    );

    logger.warn("Alert created", { deviceId, type, severity, message });
  } catch (err) {
    logger.error("Failed to create alert", { error: err.message });
  }
}

async function evaluateMetric(deviceId, deviceName, metric) {
  const { cpu_usage, ram_usage, disk_usage } = metric;

  if (cpu_usage > THRESHOLDS.cpu) {
    const severity = cpu_usage > 95 ? "critical" : "warning";
    await createAlert(deviceId, deviceName, "high_cpu", severity, `CPU usage at ${cpu_usage.toFixed(1)}% on ${deviceName}`);
  }

  if (ram_usage > THRESHOLDS.ram) {
    const severity = ram_usage > 95 ? "critical" : "warning";
    await createAlert(deviceId, deviceName, "high_ram", severity, `RAM usage at ${ram_usage.toFixed(1)}% on ${deviceName}`);
  }

  if (disk_usage > (100 - THRESHOLDS.disk_free)) {
    const freePercent = (100 - disk_usage).toFixed(1);
    const severity = disk_usage > 95 ? "critical" : "warning";
    await createAlert(deviceId, deviceName, "low_disk", severity, `Only ${freePercent}% disk free on ${deviceName}`);
  }
}

// Periodic check for offline devices
function startAlertEngine() {
  const intervalMs = 60 * 1000; // every 60 seconds

  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - THRESHOLDS.offline_minutes * 60 * 1000).toISOString();
      const result = await query(
        `SELECT id, name FROM devices WHERE status = 'online' AND last_seen < $1`,
        [cutoff]
      );

      for (const device of result.rows) {
        await query("UPDATE devices SET status = 'offline', updated_at = NOW() WHERE id = $1", [device.id]);

        await createAlert(device.id, device.name, "device_offline", "critical", `Device ${device.name} went offline`);

        const io = getIO();
        if (io) {
          io.emit("device:status", { deviceId: device.id, status: "offline" });
        }
      }
    } catch (err) {
      logger.error("Offline check error", { error: err.message });
    }
  }, intervalMs);
}

module.exports = { evaluateMetric, startAlertEngine };
