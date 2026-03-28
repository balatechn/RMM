"""
RMM Agent for Windows
System monitoring + remote support agent.
Connects via Socket.IO for real-time remote CMD, task manager, device manager.
Runs as a background scheduled task with Windows Defender exclusion.
"""

import os
import sys
import time
import json
import socket
import platform
import logging
import subprocess
import threading
import configparser
import winreg
import ctypes
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    import socketio
    HAS_SOCKETIO = True
except ImportError:
    HAS_SOCKETIO = False

# ---------- Paths ----------
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

# Active command processes (for kill support)
active_commands = {}


# ============================================================
# CONFIGURATION & SETUP
# ============================================================

def load_config():
    if not CONFIG_FILE.exists():
        logger.info("No config.ini found — starting setup wizard...")
        run_setup_wizard()

    config = configparser.ConfigParser()
    config.read(CONFIG_FILE)

    required = [("server", "url"), ("server", "api_key")]
    for section, key in required:
        if not config.has_option(section, key) or not config.get(section, key):
            logger.info("Invalid config, restarting setup...")
            CONFIG_FILE.unlink(missing_ok=True)
            run_setup_wizard()
            config.read(CONFIG_FILE)

    return config


def run_setup_wizard():
    print("\n" + "=" * 50)
    print("  RMM Agent — First-Time Setup")
    print("=" * 50)

    while True:
        server_url = input("\nEnter RMM server URL (e.g. http://your-server:4000): ").strip().rstrip("/")
        if not server_url:
            print("  Server URL is required.")
            continue
        if not server_url.startswith("http"):
            server_url = "http://" + server_url
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

    interval_input = input("\nMetrics interval in seconds (default 15): ").strip()
    interval = 15
    if interval_input.isdigit() and 5 <= int(interval_input) <= 300:
        interval = int(interval_input)

    config = configparser.ConfigParser()
    config["server"] = {"url": server_url, "api_key": api_key}
    config["agent"] = {"interval": str(interval)}

    with open(CONFIG_FILE, "w") as f:
        config.write(f)

    print(f"\n  Config saved to: {CONFIG_FILE}")
    print("  Setup complete!\n")
    print("=" * 50)

    # Offer to install as background service
    if is_admin():
        choice = input("\nInstall as background service? (Y/n): ").strip().lower()
        if choice != "n":
            add_defender_exclusion()
            install_service()
            print("\n  Agent installed and running in background!")
            print("  You can close this window.")
            input("\nPress Enter to exit...")
            sys.exit(0)
    else:
        print("\n  TIP: Run as Administrator and use 'rmm-agent install'")
        print("  to install as a background service with auto-start.")


# ============================================================
# METRICS COLLECTION
# ============================================================

def get_cpu_usage():
    if HAS_PSUTIL:
        return psutil.cpu_percent(interval=1)
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"],
            capture_output=True, text=True, timeout=10
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def get_ram_usage():
    if HAS_PSUTIL:
        mem = psutil.virtual_memory()
        return {"ram_usage": mem.percent, "ram_total": mem.total, "ram_used": mem.used}
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "$os = Get-CimInstance Win32_OperatingSystem; "
             "@{total=$os.TotalVisibleMemorySize*1024; free=$os.FreePhysicalMemory*1024} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        total, free = int(data["total"]), int(data["free"])
        used = total - free
        return {"ram_usage": round((used / total) * 100, 1) if total else 0, "ram_total": total, "ram_used": used}
    except Exception:
        return {"ram_usage": 0, "ram_total": 0, "ram_used": 0}


def get_disk_usage():
    if HAS_PSUTIL:
        disk = psutil.disk_usage("C:\\")
        return {"disk_usage": disk.percent, "disk_total": disk.total, "disk_used": disk.used}
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "$d = Get-PSDrive C; @{total=($d.Used+$d.Free); used=$d.Used} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        total, used = int(data["total"]), int(data["used"])
        return {"disk_usage": round((used / total) * 100, 1) if total else 0, "disk_total": total, "disk_used": used}
    except Exception:
        return {"disk_usage": 0, "disk_total": 0, "disk_used": 0}


def get_uptime():
    if HAS_PSUTIL:
        return int(time.time() - psutil.boot_time())
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds"],
            capture_output=True, text=True, timeout=10
        )
        return int(float(result.stdout.strip()))
    except Exception:
        return 0


def get_top_processes(count=10):
    if HAS_PSUTIL:
        procs = []
        for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
            try:
                info = proc.info
                procs.append({
                    "name": info["name"], "pid": info["pid"],
                    "cpu": info["cpu_percent"] or 0,
                    "memory": round((info["memory_info"].rss / (1024 * 1024)), 1) if info["memory_info"] else 0,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x["cpu"], reverse=True)
        return procs[:count]
    try:
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
        return [{"name": p.get("Name", ""), "pid": p.get("Id", 0), "cpu": p.get("CPU", 0), "memory": p.get("MemMB", 0)} for p in raw]
    except Exception:
        return []


def get_process_count():
    if HAS_PSUTIL:
        return len(psutil.pids())
    try:
        result = subprocess.run(["powershell", "-Command", "(Get-Process).Count"], capture_output=True, text=True, timeout=10)
        return int(result.stdout.strip())
    except Exception:
        return 0


def collect_metrics():
    cpu = get_cpu_usage()
    ram = get_ram_usage()
    disk = get_disk_usage()
    uptime = get_uptime()
    process_count = get_process_count()
    top_processes = get_top_processes()
    os_info = f"{platform.system()} {platform.release()} ({platform.version()})"

    return {
        "cpu_usage": round(cpu, 1), "ram_usage": ram["ram_usage"],
        "ram_total": ram["ram_total"], "ram_used": ram["ram_used"],
        "disk_usage": disk["disk_usage"], "disk_total": disk["disk_total"],
        "disk_used": disk["disk_used"], "uptime": uptime,
        "process_count": process_count, "top_processes": top_processes, "os_info": os_info,
    }


def send_metrics(server_url, api_key, metrics):
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


# ============================================================
# REMOTE SUPPORT HANDLERS
# ============================================================

def handle_cmd_exec(sio, data):
    """Execute a shell command and stream output back"""
    command = data.get("command", "")
    cmd_id = data.get("cmdId", "")

    if not command:
        sio.emit("cmd:done", {"cmdId": cmd_id, "exitCode": -1})
        return

    logger.info(f"Executing command: {command}")

    def run():
        try:
            proc = subprocess.Popen(
                command, shell=True,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE, text=True,
                cwd="C:\\", bufsize=1
            )
            active_commands[cmd_id] = proc

            for line in iter(proc.stdout.readline, ""):
                if cmd_id not in active_commands:
                    break
                sio.emit("cmd:output", {"cmdId": cmd_id, "data": line})

            proc.wait(timeout=300)
            exit_code = proc.returncode
        except subprocess.TimeoutExpired:
            proc.kill()
            exit_code = -1
        except Exception as e:
            sio.emit("cmd:output", {"cmdId": cmd_id, "data": f"Error: {e}\n"})
            exit_code = -1
        finally:
            active_commands.pop(cmd_id, None)
            sio.emit("cmd:done", {"cmdId": cmd_id, "exitCode": exit_code})

    threading.Thread(target=run, daemon=True).start()


def handle_cmd_kill(data):
    """Kill a running command"""
    cmd_id = data.get("cmdId", "")
    proc = active_commands.pop(cmd_id, None)
    if proc:
        try:
            proc.kill()
        except Exception:
            pass


def handle_get_processes(sio):
    """Get full process list for task manager"""
    def run():
        processes = []
        if HAS_PSUTIL:
            for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "username", "status", "create_time"]):
                try:
                    info = proc.info
                    processes.append({
                        "pid": info["pid"],
                        "name": info["name"],
                        "cpu": round(info["cpu_percent"] or 0, 1),
                        "memory": round((info["memory_info"].rss / (1024 * 1024)), 1) if info["memory_info"] else 0,
                        "memoryBytes": info["memory_info"].rss if info["memory_info"] else 0,
                        "user": (info.get("username") or "").split("\\")[-1],
                        "status": info.get("status", ""),
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        else:
            try:
                result = subprocess.run(
                    ["powershell", "-Command",
                     "Get-Process | Select-Object Id, Name, "
                     "@{N='CPU';E={[math]::Round($_.CPU,1)}}, "
                     "@{N='MemMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, "
                     "@{N='MemBytes';E={$_.WorkingSet64}} | ConvertTo-Json -Compress"],
                    capture_output=True, text=True, timeout=20
                )
                raw = json.loads(result.stdout)
                if isinstance(raw, dict):
                    raw = [raw]
                for p in raw:
                    processes.append({
                        "pid": p.get("Id", 0), "name": p.get("Name", ""),
                        "cpu": p.get("CPU", 0), "memory": p.get("MemMB", 0),
                        "memoryBytes": p.get("MemBytes", 0), "user": "", "status": "running",
                    })
            except Exception:
                pass

        processes.sort(key=lambda x: x["cpu"], reverse=True)
        sio.emit("processes:result", {"processes": processes})

    threading.Thread(target=run, daemon=True).start()


def handle_kill_process(sio, data):
    """Kill a process by PID"""
    pid = data.get("pid")
    if not pid:
        return
    try:
        if HAS_PSUTIL:
            proc = psutil.Process(pid)
            proc.kill()
        else:
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, timeout=10)
        logger.info(f"Killed process {pid}")
    except Exception as e:
        logger.error(f"Failed to kill process {pid}: {e}")


def handle_get_sysinfo(sio):
    """Get system information for device manager"""
    def run():
        info = {
            "hostname": socket.gethostname(),
            "os": f"{platform.system()} {platform.release()}",
            "os_version": platform.version(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
        }

        if HAS_PSUTIL:
            info["cpu_count_physical"] = psutil.cpu_count(logical=False)
            info["cpu_count_logical"] = psutil.cpu_count(logical=True)
            info["cpu_freq"] = round(psutil.cpu_freq().current, 0) if psutil.cpu_freq() else 0
            mem = psutil.virtual_memory()
            info["ram_total_gb"] = round(mem.total / (1024**3), 1)
            info["ram_available_gb"] = round(mem.available / (1024**3), 1)
            boot = psutil.boot_time()
            info["boot_time"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(boot))

            # Disk partitions
            disks = []
            for part in psutil.disk_partitions():
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disks.append({
                        "device": part.device, "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total_gb": round(usage.total / (1024**3), 1),
                        "used_gb": round(usage.used / (1024**3), 1),
                        "free_gb": round(usage.free / (1024**3), 1),
                        "percent": usage.percent,
                    })
                except Exception:
                    pass
            info["disks"] = disks

            # Network interfaces
            nets = []
            addrs = psutil.net_if_addrs()
            stats = psutil.net_if_stats()
            for iface, addr_list in addrs.items():
                ipv4 = ""
                mac = ""
                for addr in addr_list:
                    if addr.family.name == "AF_INET":
                        ipv4 = addr.address
                    if addr.family.name == "AF_LINK":
                        mac = addr.address
                is_up = stats.get(iface, None)
                nets.append({
                    "name": iface, "ip": ipv4, "mac": mac,
                    "is_up": is_up.isup if is_up else False,
                    "speed": is_up.speed if is_up else 0,
                })
            info["network"] = nets

        sio.emit("sysinfo:result", info)

    threading.Thread(target=run, daemon=True).start()


def handle_get_services(sio):
    """Get Windows services"""
    def run():
        services = []
        try:
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30
            )
            raw = json.loads(result.stdout)
            if isinstance(raw, dict):
                raw = [raw]
            for s in raw:
                status_val = s.get("Status", 0)
                start_val = s.get("StartType", 0)
                status_map = {4: "Running", 1: "Stopped", 2: "Paused", 7: "StartPending", 3: "StopPending"}
                start_map = {2: "Automatic", 3: "Manual", 4: "Disabled"}
                services.append({
                    "name": s.get("Name", ""),
                    "displayName": s.get("DisplayName", ""),
                    "status": status_map.get(status_val, str(status_val)),
                    "startType": start_map.get(start_val, str(start_val)),
                })
        except Exception as e:
            logger.error(f"Failed to get services: {e}")

        sio.emit("services:result", {"services": services})

    threading.Thread(target=run, daemon=True).start()


def handle_service_action(sio, data):
    """Start/stop/restart a service"""
    name = data.get("serviceName", "")
    action = data.get("action", "")
    if not name or action not in ("start", "stop", "restart"):
        return
    try:
        if action == "restart":
            subprocess.run(["powershell", "-Command", f"Restart-Service '{name}' -Force"], capture_output=True, timeout=30)
        elif action == "start":
            subprocess.run(["powershell", "-Command", f"Start-Service '{name}'"], capture_output=True, timeout=30)
        elif action == "stop":
            subprocess.run(["powershell", "-Command", f"Stop-Service '{name}' -Force"], capture_output=True, timeout=30)
        logger.info(f"Service {name}: {action}")
    except Exception as e:
        logger.error(f"Service action failed: {e}")


def handle_get_software(sio):
    """Get installed software list"""
    def run():
        software = []
        reg_paths = [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ]
        for reg_path in reg_paths:
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
                for i in range(winreg.QueryInfoKey(key)[0]):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        subkey = winreg.OpenKey(key, subkey_name)
                        name = ""
                        version = ""
                        publisher = ""
                        install_date = ""
                        try:
                            name = winreg.QueryValueEx(subkey, "DisplayName")[0]
                        except FileNotFoundError:
                            continue
                        try:
                            version = winreg.QueryValueEx(subkey, "DisplayVersion")[0]
                        except FileNotFoundError:
                            pass
                        try:
                            publisher = winreg.QueryValueEx(subkey, "Publisher")[0]
                        except FileNotFoundError:
                            pass
                        try:
                            install_date = winreg.QueryValueEx(subkey, "InstallDate")[0]
                        except FileNotFoundError:
                            pass
                        if name:
                            software.append({
                                "name": name, "version": version or "",
                                "publisher": publisher or "", "installDate": install_date or "",
                            })
                        winreg.CloseKey(subkey)
                    except Exception:
                        pass
                winreg.CloseKey(key)
            except Exception:
                pass

        # Deduplicate by name
        seen = set()
        unique = []
        for s in software:
            if s["name"] not in seen:
                seen.add(s["name"])
                unique.append(s)
        unique.sort(key=lambda x: x["name"].lower())

        sio.emit("software:result", {"software": unique})

    threading.Thread(target=run, daemon=True).start()


def handle_get_users(sio):
    """Get local Windows user accounts"""
    def run():
        users = []
        try:
            result = subprocess.run(
                ["powershell", "-Command",
                 "Get-LocalUser | Select-Object Name, Enabled, "
                 "@{N='LastLogon';E={$_.LastLogon.ToString('yyyy-MM-dd HH:mm:ss')}}, "
                 "@{N='PasswordLastSet';E={$_.PasswordLastSet.ToString('yyyy-MM-dd HH:mm:ss')}}, "
                 "Description, SID, "
                 "@{N='IsAdmin';E={(Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue | Where-Object {$_.Name -like \"*\\$($_.Name)\"}).Count -gt 0}} "
                 "| ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=30
            )
            raw = json.loads(result.stdout)
            if isinstance(raw, dict):
                raw = [raw]
            for u in raw:
                sid = str(u.get("SID", ""))
                # Extract just the SID string if it's an object
                if isinstance(sid, dict):
                    sid = sid.get("Value", "")
                users.append({
                    "name": u.get("Name", ""),
                    "enabled": bool(u.get("Enabled", False)),
                    "lastLogon": u.get("LastLogon", "") or "",
                    "passwordLastSet": u.get("PasswordLastSet", "") or "",
                    "description": u.get("Description", "") or "",
                    "isAdmin": bool(u.get("IsAdmin", False)),
                    "sid": sid,
                })
        except Exception as e:
            logger.error(f"Failed to get users: {e}")

        sio.emit("users:result", {"users": users})

    threading.Thread(target=run, daemon=True).start()


def handle_user_lock(sio, data):
    """Disable (lock) a local user account"""
    username = data.get("username", "")
    if not username:
        return
    def run():
        try:
            result = subprocess.run(
                ["powershell", "-Command", f"Disable-LocalUser -Name '{username}'"],
                capture_output=True, text=True, timeout=15
            )
            success = result.returncode == 0
            logger.info(f"User '{username}' locked: {success}")
            sio.emit("user:action:result", {"username": username, "action": "lock", "success": success, "error": result.stderr.strip() if not success else ""})
        except Exception as e:
            sio.emit("user:action:result", {"username": username, "action": "lock", "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()


def handle_user_unlock(sio, data):
    """Enable (unlock) a local user account"""
    username = data.get("username", "")
    if not username:
        return
    def run():
        try:
            result = subprocess.run(
                ["powershell", "-Command", f"Enable-LocalUser -Name '{username}'"],
                capture_output=True, text=True, timeout=15
            )
            success = result.returncode == 0
            logger.info(f"User '{username}' unlocked: {success}")
            sio.emit("user:action:result", {"username": username, "action": "unlock", "success": success, "error": result.stderr.strip() if not success else ""})
        except Exception as e:
            sio.emit("user:action:result", {"username": username, "action": "unlock", "success": False, "error": str(e)})

    threading.Thread(target=run, daemon=True).start()


# ============================================================
# FILE MANAGER HANDLERS
# ============================================================

def handle_files_list(sio, data):
    """List drives or directory contents"""
    path = data.get("path", "")

    def run():
        try:
            items = []
            if not path:
                # List drives
                if HAS_PSUTIL:
                    for part in psutil.disk_partitions():
                        try:
                            usage = psutil.disk_usage(part.mountpoint)
                            items.append({
                                "name": part.device.rstrip("\\"),
                                "path": part.device,
                                "type": "drive",
                                "size": usage.total,
                                "modified": "",
                                "fstype": part.fstype,
                                "usedSpace": usage.used,
                                "freeSpace": usage.free,
                            })
                        except Exception:
                            items.append({
                                "name": part.device.rstrip("\\"),
                                "path": part.device,
                                "type": "drive",
                                "size": 0,
                                "modified": "",
                            })
                else:
                    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                        drive = f"{letter}:\\"
                        if os.path.exists(drive):
                            try:
                                total, used, free = 0, 0, 0
                                result = subprocess.run(
                                    ["powershell", "-Command",
                                     f"$d = Get-PSDrive {letter} -ErrorAction SilentlyContinue; "
                                     f"if($d){{ @{{total=($d.Used+$d.Free);used=$d.Used;free=$d.Free}} | ConvertTo-Json }}"],
                                    capture_output=True, text=True, timeout=10
                                )
                                if result.stdout.strip():
                                    d = json.loads(result.stdout)
                                    total, used, free = int(d.get("total", 0)), int(d.get("used", 0)), int(d.get("free", 0))
                                items.append({
                                    "name": f"{letter}:",
                                    "path": drive,
                                    "type": "drive",
                                    "size": total,
                                    "modified": "",
                                    "usedSpace": used,
                                    "freeSpace": free,
                                })
                            except Exception:
                                items.append({"name": f"{letter}:", "path": drive, "type": "drive", "size": 0, "modified": ""})

                sio.emit("files:result", {"path": "", "items": items, "error": None})
                return

            # Normalize path
            target = os.path.normpath(path)
            if not os.path.exists(target):
                sio.emit("files:result", {"path": path, "items": [], "error": "Path does not exist"})
                return
            if not os.path.isdir(target):
                sio.emit("files:result", {"path": path, "items": [], "error": "Not a directory"})
                return

            for entry in os.scandir(target):
                try:
                    stat = entry.stat()
                    items.append({
                        "name": entry.name,
                        "path": entry.path,
                        "type": "folder" if entry.is_dir() else "file",
                        "size": stat.st_size if entry.is_file() else 0,
                        "modified": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(stat.st_mtime)),
                    })
                except PermissionError:
                    items.append({
                        "name": entry.name,
                        "path": entry.path,
                        "type": "folder" if entry.is_dir(follow_symlinks=False) else "file",
                        "size": 0,
                        "modified": "",
                        "restricted": True,
                    })
                except Exception:
                    pass

            # Sort: folders first, then files, both alphabetical
            items.sort(key=lambda x: (0 if x["type"] == "folder" else 1, x["name"].lower()))
            sio.emit("files:result", {"path": target, "items": items, "error": None})

        except PermissionError:
            sio.emit("files:result", {"path": path, "items": [], "error": "Access denied"})
        except Exception as e:
            sio.emit("files:result", {"path": path, "items": [], "error": str(e)})

    threading.Thread(target=run, daemon=True).start()


# ============================================================
# WINDOWS SERVICE (Scheduled Task) & WHITELIST
# ============================================================

SERVICE_NAME = "RMMAgent"
SERVICE_DESC = "RMM Remote Monitoring & Management Agent"


def is_admin():
    """Check if running with admin privileges"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin() != 0
    except Exception:
        return False


def get_exe_path():
    """Get the path to the running EXE"""
    if getattr(sys, 'frozen', False):
        return str(Path(sys.executable).resolve())
    return str(Path(__file__).resolve())


def add_defender_exclusion():
    """Add Windows Defender exclusion for the agent EXE and its directory"""
    exe = get_exe_path()
    exe_dir = str(Path(exe).parent)
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"Add-MpPreference -ExclusionPath '{exe}' -ErrorAction SilentlyContinue; "
             f"Add-MpPreference -ExclusionPath '{exe_dir}' -ErrorAction SilentlyContinue; "
             f"Add-MpPreference -ExclusionProcess '{Path(exe).name}' -ErrorAction SilentlyContinue"],
            capture_output=True, timeout=30
        )
        logger.info(f"Windows Defender exclusion added for {exe}")
        return True
    except Exception as e:
        logger.warning(f"Failed to add Defender exclusion: {e}")
        return False


def remove_defender_exclusion():
    """Remove Windows Defender exclusion"""
    exe = get_exe_path()
    exe_dir = str(Path(exe).parent)
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"Remove-MpPreference -ExclusionPath '{exe}' -ErrorAction SilentlyContinue; "
             f"Remove-MpPreference -ExclusionPath '{exe_dir}' -ErrorAction SilentlyContinue; "
             f"Remove-MpPreference -ExclusionProcess '{Path(exe).name}' -ErrorAction SilentlyContinue"],
            capture_output=True, timeout=30
        )
        logger.info("Windows Defender exclusion removed")
    except Exception:
        pass


def install_service():
    """Install agent as a Windows Scheduled Task that runs at startup"""
    if not is_admin():
        print("  ERROR: Administrator privileges required.")
        print("  Right-click the EXE and select 'Run as administrator'.")
        return False

    exe = get_exe_path()
    print(f"\n  Installing RMM Agent service...")
    print(f"  EXE: {exe}")

    # Add Defender exclusion first
    add_defender_exclusion()

    # Remove existing task if present
    subprocess.run(
        ["schtasks", "/Delete", "/TN", SERVICE_NAME, "/F"],
        capture_output=True, timeout=15
    )

    # Create scheduled task: runs at system startup, runs whether user is logged on or not
    result = subprocess.run(
        ["schtasks", "/Create",
         "/TN", SERVICE_NAME,
         "/TR", f'"{exe}" --run',
         "/SC", "ONSTART",
         "/RU", "SYSTEM",
         "/RL", "HIGHEST",
         "/F",
         "/DELAY", "0000:30"],
        capture_output=True, text=True, timeout=30
    )

    if result.returncode == 0:
        print("  Scheduled task created successfully!")
        print(f"  Task Name: {SERVICE_NAME}")
        print("  Trigger: On system startup (as SYSTEM)")

        # Also start it now
        start_service()
        return True
    else:
        print(f"  Failed to create scheduled task: {result.stderr.strip()}")
        return False


def uninstall_service():
    """Remove the scheduled task and Defender exclusions"""
    if not is_admin():
        print("  ERROR: Administrator privileges required.")
        return False

    print(f"\n  Uninstalling RMM Agent service...")

    # Stop the task first
    stop_service()

    # Delete the task
    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", SERVICE_NAME, "/F"],
        capture_output=True, text=True, timeout=15
    )

    if result.returncode == 0:
        print("  Scheduled task removed.")
    else:
        print(f"  Note: {result.stderr.strip()}")

    remove_defender_exclusion()
    print("  Defender exclusions removed.")
    print("  Uninstall complete.")
    return True


def start_service():
    """Start the scheduled task"""
    result = subprocess.run(
        ["schtasks", "/Run", "/TN", SERVICE_NAME],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode == 0:
        print("  Agent started in background.")
    else:
        print(f"  Failed to start: {result.stderr.strip()}")


def stop_service():
    """Stop the running agent"""
    # Kill any running instances
    exe_name = Path(get_exe_path()).name
    subprocess.run(
        ["taskkill", "/F", "/IM", exe_name],
        capture_output=True, timeout=15
    )
    # End the scheduled task
    subprocess.run(
        ["schtasks", "/End", "/TN", SERVICE_NAME],
        capture_output=True, timeout=15
    )
    print("  Agent stopped.")


def service_status():
    """Check if the agent task is running"""
    result = subprocess.run(
        ["schtasks", "/Query", "/TN", SERVICE_NAME, "/FO", "CSV", "/NH"],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode != 0:
        print("  Status: NOT INSTALLED")
        return

    line = result.stdout.strip()
    if "Running" in line:
        print("  Status: RUNNING")
    elif "Ready" in line:
        print("  Status: INSTALLED (not running)")
    else:
        print(f"  Status: {line}")

    # Check if process is actually running
    exe_name = Path(get_exe_path()).name
    check = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {exe_name}", "/NH"],
        capture_output=True, text=True, timeout=10
    )
    if exe_name.lower() in check.stdout.lower():
        print("  Process: ACTIVE")
    else:
        print("  Process: NOT RUNNING")


def handle_cli():
    """Handle command-line arguments for service management"""
    if len(sys.argv) < 2:
        return False

    cmd = sys.argv[1].lower().lstrip("-")

    if cmd == "install":
        # Run setup wizard first if no config
        if not CONFIG_FILE.exists():
            run_setup_wizard()
        install_service()
        input("\nPress Enter to exit...")
        sys.exit(0)

    elif cmd == "uninstall":
        uninstall_service()
        input("\nPress Enter to exit...")
        sys.exit(0)

    elif cmd == "start":
        start_service()
        sys.exit(0)

    elif cmd == "stop":
        stop_service()
        sys.exit(0)

    elif cmd == "status":
        service_status()
        input("\nPress Enter to exit...")
        sys.exit(0)

    elif cmd == "run":
        # Silent background run mode (called by scheduled task)
        return True

    elif cmd == "help":
        print("\n  RMM Agent Commands:")
        print("  -------------------")
        print("  rmm-agent install    - Setup, whitelist & install as background service")
        print("  rmm-agent uninstall  - Remove service & Defender exclusions")
        print("  rmm-agent start      - Start the background service")
        print("  rmm-agent stop       - Stop the running agent")
        print("  rmm-agent status     - Check service status")
        print("  rmm-agent run        - Run in foreground (used by service)")
        print("  rmm-agent            - Interactive setup + run")
        print()
        sys.exit(0)

    return False


# ============================================================
# MAIN
# ============================================================

def main():
    config = load_config()

    server_url = config.get("server", "url")
    api_key = config.get("server", "api_key")
    interval = config.getint("agent", "interval", fallback=15)

    logger.info("=" * 50)
    logger.info("RMM Agent Starting")
    logger.info(f"Server: {server_url}")
    logger.info(f"Interval: {interval}s")
    logger.info(f"Hostname: {socket.gethostname()}")
    logger.info(f"psutil: {HAS_PSUTIL}, socketio: {HAS_SOCKETIO}")
    logger.info("=" * 50)

    # --- Socket.IO connection for remote support ---
    sio = None
    if HAS_SOCKETIO:
        sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=5, logger=False)

        @sio.event
        def connect():
            logger.info("Socket.IO connected to server")

        @sio.event
        def disconnect():
            logger.warning("Socket.IO disconnected from server")

        @sio.on("cmd:exec")
        def on_cmd_exec(data):
            handle_cmd_exec(sio, data)

        @sio.on("cmd:kill")
        def on_cmd_kill(data):
            handle_cmd_kill(data)

        @sio.on("processes:get")
        def on_processes_get(*args):
            handle_get_processes(sio)

        @sio.on("process:kill")
        def on_process_kill(data):
            handle_kill_process(sio, data)

        @sio.on("sysinfo:get")
        def on_sysinfo_get(*args):
            handle_get_sysinfo(sio)

        @sio.on("services:get")
        def on_services_get(*args):
            handle_get_services(sio)

        @sio.on("service:action")
        def on_service_action(data):
            handle_service_action(sio, data)

        @sio.on("software:get")
        def on_software_get(*args):
            handle_get_software(sio)

        @sio.on("users:get")
        def on_users_get(*args):
            handle_get_users(sio)

        @sio.on("user:lock")
        def on_user_lock(data):
            handle_user_lock(sio, data)

        @sio.on("user:unlock")
        def on_user_unlock(data):
            handle_user_unlock(sio, data)

        @sio.on("files:list")
        def on_files_list(data):
            handle_files_list(sio, data)

        # Connect in background thread
        def connect_sio():
            while True:
                try:
                    sio.connect(server_url, auth={"apiKey": api_key}, transports=["websocket", "polling"])
                    break
                except Exception as e:
                    logger.error(f"Socket.IO connection failed: {e}, retrying in 10s...")
                    time.sleep(10)

        threading.Thread(target=connect_sio, daemon=True).start()
    else:
        logger.warning("python-socketio not installed — remote support disabled")
        logger.warning("Install: pip install python-socketio[client] websocket-client")

    # --- Metrics collection loop ---
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
            if sio and sio.connected:
                sio.disconnect()
            break
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            consecutive_failures += 1

        time.sleep(interval)


if __name__ == "__main__":
    # Handle CLI commands (install, uninstall, start, stop, status)
    handle_cli()
    # If no CLI command or --run mode, start the agent
    main()
