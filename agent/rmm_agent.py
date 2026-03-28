"""
RMM Agent for Windows
Lightweight system monitoring agent that collects metrics and sends them to the RMM backend.
"""

import os
import sys
import time
import json
import socket
import platform
import logging
import configparser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Optional: psutil for detailed metrics (falls back to WMI/basic if unavailable)
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# ---------- Configuration ----------
# For PyInstaller --onefile, use exe directory; otherwise script directory
if getattr(sys, 'frozen', False):
    APP_DIR = Path(sys.executable).parent
else:
    APP_DIR = Path(__file__).parent

CONFIG_FILE = APP_DIR / "config.ini"
LOG_FILE = APP_DIR / "rmm_agent.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("rmm-agent")


def load_config():
    """Load configuration from config.ini, or run setup wizard if missing"""
    if not CONFIG_FILE.exists():
        logger.info("No config.ini found — starting setup wizard...")
        run_setup_wizard()

    config = configparser.ConfigParser()
    config.read(CONFIG_FILE)

    # Validate required fields
    required = [("server", "url"), ("server", "api_key")]
    for section, key in required:
        if not config.has_option(section, key) or not config.get(section, key):
            logger.error(f"Missing required config: [{section}] {key}")
            logger.info("Deleting invalid config and restarting setup...")
            CONFIG_FILE.unlink(missing_ok=True)
            run_setup_wizard()
            config.read(CONFIG_FILE)

    return config


def run_setup_wizard():
    """Interactive setup: prompt for server URL, auto-register device, save config"""
    print("\n" + "=" * 50)
    print("  RMM Agent — First-Time Setup")
    print("=" * 50)

    # Get server URL
    while True:
        server_url = input("\nEnter RMM server URL (e.g. http://your-server:4000): ").strip().rstrip("/")
        if not server_url:
            print("  Server URL is required.")
            continue
        if not server_url.startswith("http"):
            server_url = "http://" + server_url
        # Test connectivity
        print(f"  Testing connection to {server_url}...")
        try:
            req = Request(f"{server_url}/health", method="GET")
            with urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    print("  Connected successfully!")
                    break
        except Exception as e:
            print(f"  Cannot reach server: {e}")
            print("  Please check the URL and try again.")

    # Auto-register device
    hostname = socket.gethostname()
    os_info = f"{platform.system()} {platform.release()} ({platform.version()})"
    print(f"\n  Registering device: {hostname}")

    reg_data = json.dumps({"hostname": hostname, "os_info": os_info}).encode("utf-8")
    req = Request(f"{server_url}/api/devices/auto-register", data=reg_data, method="POST")
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            api_key = result["api_key"]
            device_id = result["device_id"]
            print(f"  Registered! Device ID: {device_id}")
    except HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        print(f"  Registration failed: {e.code} — {body}")
        input("Press Enter to exit...")
        sys.exit(1)
    except Exception as e:
        print(f"  Registration failed: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

    # Get interval
    interval_input = input("\nMetrics interval in seconds (default 15): ").strip()
    interval = 15
    if interval_input.isdigit() and 5 <= int(interval_input) <= 300:
        interval = int(interval_input)

    # Save config.ini
    config = configparser.ConfigParser()
    config["server"] = {"url": server_url, "api_key": api_key}
    config["agent"] = {"interval": str(interval)}

    with open(CONFIG_FILE, "w") as f:
        config.write(f)

    print(f"\n  Config saved to: {CONFIG_FILE}")
    print("  Setup complete! Starting agent...\n")
    print("=" * 50)


def get_cpu_usage():
    """Get CPU usage percentage"""
    if HAS_PSUTIL:
        return psutil.cpu_percent(interval=1)

    # Fallback: use WMI via PowerShell
    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command",
             "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def get_ram_usage():
    """Get RAM usage details"""
    if HAS_PSUTIL:
        mem = psutil.virtual_memory()
        return {
            "ram_usage": mem.percent,
            "ram_total": mem.total,
            "ram_used": mem.used,
        }

    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command",
             "$os = Get-CimInstance Win32_OperatingSystem; "
             "@{total=$os.TotalVisibleMemorySize*1024; free=$os.FreePhysicalMemory*1024} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        total = int(data["total"])
        free = int(data["free"])
        used = total - free
        return {
            "ram_usage": round((used / total) * 100, 1) if total > 0 else 0,
            "ram_total": total,
            "ram_used": used,
        }
    except Exception:
        return {"ram_usage": 0, "ram_total": 0, "ram_used": 0}


def get_disk_usage():
    """Get disk usage for the primary drive"""
    if HAS_PSUTIL:
        disk = psutil.disk_usage("C:\\")
        return {
            "disk_usage": disk.percent,
            "disk_total": disk.total,
            "disk_used": disk.used,
        }

    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command",
             "$d = Get-PSDrive C; @{total=($d.Used+$d.Free); used=$d.Used} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        total = int(data["total"])
        used = int(data["used"])
        return {
            "disk_usage": round((used / total) * 100, 1) if total > 0 else 0,
            "disk_total": total,
            "disk_used": used,
        }
    except Exception:
        return {"disk_usage": 0, "disk_total": 0, "disk_used": 0}


def get_uptime():
    """Get system uptime in seconds"""
    if HAS_PSUTIL:
        return int(time.time() - psutil.boot_time())

    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command",
             "((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds"],
            capture_output=True, text=True, timeout=10
        )
        return int(float(result.stdout.strip()))
    except Exception:
        return 0


def get_top_processes(count=10):
    """Get top processes by CPU usage"""
    if HAS_PSUTIL:
        procs = []
        for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
            try:
                info = proc.info
                procs.append({
                    "name": info["name"],
                    "pid": info["pid"],
                    "cpu": info["cpu_percent"] or 0,
                    "memory": round((info["memory_info"].rss / (1024 * 1024)), 1) if info["memory_info"] else 0,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        procs.sort(key=lambda x: x["cpu"], reverse=True)
        return procs[:count]

    # Fallback: simpler process list
    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, "
             "@{N='CPU';E={[math]::Round($_.CPU,1)}}, "
             "@{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=15
        )
        raw = json.loads(result.stdout)
        if isinstance(raw, dict):
            raw = [raw]
        return [
            {"name": p.get("Name", ""), "pid": p.get("Id", 0), "cpu": p.get("CPU", 0), "memory": p.get("MemMB", 0)}
            for p in raw
        ]
    except Exception:
        return []


def get_process_count():
    """Get total number of running processes"""
    if HAS_PSUTIL:
        return len(psutil.pids())
    try:
        import subprocess
        result = subprocess.run(
            ["powershell", "-Command", "(Get-Process).Count"],
            capture_output=True, text=True, timeout=10
        )
        return int(result.stdout.strip())
    except Exception:
        return 0


def collect_metrics():
    """Collect all system metrics"""
    logger.debug("Collecting metrics...")

    cpu = get_cpu_usage()
    ram = get_ram_usage()
    disk = get_disk_usage()
    uptime = get_uptime()
    process_count = get_process_count()
    top_processes = get_top_processes()
    os_info = f"{platform.system()} {platform.release()} ({platform.version()})"

    metrics = {
        "cpu_usage": round(cpu, 1),
        "ram_usage": ram["ram_usage"],
        "ram_total": ram["ram_total"],
        "ram_used": ram["ram_used"],
        "disk_usage": disk["disk_usage"],
        "disk_total": disk["disk_total"],
        "disk_used": disk["disk_used"],
        "uptime": uptime,
        "process_count": process_count,
        "top_processes": top_processes,
        "os_info": os_info,
    }

    logger.debug(f"Metrics: CPU={metrics['cpu_usage']}%, RAM={metrics['ram_usage']}%, Disk={metrics['disk_usage']}%")
    return metrics


def send_metrics(server_url, api_key, metrics):
    """Send metrics to the RMM backend"""
    url = f"{server_url.rstrip('/')}/api/metrics"
    data = json.dumps(metrics).encode("utf-8")

    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("X-API-Key", api_key)

    try:
        with urlopen(req, timeout=15) as response:
            if response.status == 201:
                logger.info("Metrics sent successfully")
                return True
            else:
                logger.warning(f"Unexpected response: {response.status}")
                return False
    except HTTPError as e:
        logger.error(f"HTTP error sending metrics: {e.code} - {e.reason}")
        return False
    except URLError as e:
        logger.error(f"Connection error: {e.reason}")
        return False
    except Exception as e:
        logger.error(f"Error sending metrics: {e}")
        return False


def main():
    """Main agent loop"""
    config = load_config()

    server_url = config.get("server", "url")
    api_key = config.get("server", "api_key")
    interval = config.getint("agent", "interval", fallback=15)

    logger.info("=" * 50)
    logger.info("RMM Agent Starting")
    logger.info(f"Server: {server_url}")
    logger.info(f"Interval: {interval}s")
    logger.info(f"Hostname: {socket.gethostname()}")
    logger.info(f"psutil available: {HAS_PSUTIL}")
    logger.info("=" * 50)

    if not HAS_PSUTIL:
        logger.warning("psutil not installed — using PowerShell fallback (slower)")
        logger.warning("Install psutil for better performance: pip install psutil")

    consecutive_failures = 0
    max_failures = 10

    while True:
        try:
            metrics = collect_metrics()
            success = send_metrics(server_url, api_key, metrics)

            if success:
                consecutive_failures = 0
            else:
                consecutive_failures += 1

            if consecutive_failures >= max_failures:
                logger.error(f"Too many consecutive failures ({max_failures}), backing off")
                time.sleep(interval * 5)
                consecutive_failures = 0
        except KeyboardInterrupt:
            logger.info("Agent stopped by user")
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            consecutive_failures += 1

        time.sleep(interval)


if __name__ == "__main__":
    main()
