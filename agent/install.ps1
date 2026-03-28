<#
.SYNOPSIS
    Install and configure the RMM Agent as a Windows service.
.DESCRIPTION
    Downloads/copies the agent, installs Python dependencies,
    and registers the agent as a Windows service using NSSM or Task Scheduler.
.PARAMETER ApiUrl
    The RMM backend URL.
.PARAMETER ApiKey
    The device API key from the dashboard.
.PARAMETER InstallPath
    Installation directory (default: C:\RMM-Agent).
#>
param(
    [Parameter(Mandatory=$true)]
    [string]$ApiUrl,

    [Parameter(Mandatory=$true)]
    [string]$ApiKey,

    [string]$InstallPath = "C:\RMM-Agent",

    [int]$Interval = 15
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RMM Agent Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Check for admin rights
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: Run this script as Administrator!" -ForegroundColor Red
    exit 1
}

# 2. Check Python availability
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Install Python 3.10+ from https://www.python.org/downloads/"
    exit 1
}
Write-Host "[OK] Python found: $($python.Source)" -ForegroundColor Green

# 3. Create install directory
if (!(Test-Path $InstallPath)) {
    New-Item -Path $InstallPath -ItemType Directory | Out-Null
}
Write-Host "[OK] Install directory: $InstallPath" -ForegroundColor Green

# 4. Copy agent files
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item "$scriptDir\rmm_agent.py" "$InstallPath\rmm_agent.py" -Force
Copy-Item "$scriptDir\requirements.txt" "$InstallPath\requirements.txt" -Force
Write-Host "[OK] Agent files copied" -ForegroundColor Green

# 5. Install Python dependencies
Write-Host "Installing Python dependencies..."
& python -m pip install -r "$InstallPath\requirements.txt" --quiet
Write-Host "[OK] Dependencies installed" -ForegroundColor Green

# 6. Create config file
$configContent = @"
[server]
url = $ApiUrl
api_key = $ApiKey

[agent]
interval = $Interval
"@

Set-Content -Path "$InstallPath\config.ini" -Value $configContent
Write-Host "[OK] Configuration written" -ForegroundColor Green

# 7. Register as a Scheduled Task (runs on boot, restarts on failure)
$taskName = "RMM-Agent"

# Remove existing task if present
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[OK] Removed existing scheduled task" -ForegroundColor Yellow
}

$pythonPath = (Get-Command python).Source
$action = New-ScheduledTaskAction -Execute $pythonPath -Argument "`"$InstallPath\rmm_agent.py`"" -WorkingDirectory $InstallPath
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "RMM Monitoring Agent" | Out-Null
Write-Host "[OK] Scheduled task registered: $taskName" -ForegroundColor Green

# 8. Start the task immediately
Start-ScheduledTask -TaskName $taskName
Write-Host "[OK] Agent started!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Install Path:   $InstallPath"
Write-Host "Server:         $ApiUrl"
Write-Host "Interval:       ${Interval}s"
Write-Host "Task Name:      $taskName"
Write-Host ""
Write-Host "Manage the agent:" -ForegroundColor Yellow
Write-Host "  Stop:    Stop-ScheduledTask -TaskName '$taskName'"
Write-Host "  Start:   Start-ScheduledTask -TaskName '$taskName'"
Write-Host "  Remove:  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
Write-Host "  Logs:    Get-Content '$InstallPath\rmm_agent.log' -Tail 50"
