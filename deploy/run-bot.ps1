# Launcher for the Windows Task Scheduler.
# Setup instructions: docs/deploy-windows-minipc.md
#
# IMPORTANT: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1
# files using the system ANSI codepage unless they carry a UTF-8 BOM, so
# non-ASCII characters here turn into parse errors on Japanese Windows.
#
# Resolves the repo root from this script's own location, so the task's
# "Start in" field can be left empty.
#
# Task Scheduler runs with no console, so a failure before Python starts
# would otherwise leave no trace at all. Everything is recorded in
# logs\launcher.log (the bot's own log goes to LOG_FILE from .env).

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $repoRoot

$logDir = Join-Path $repoRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$launcherLog = Join-Path $logDir "launcher.log"

function Write-LauncherLog {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $launcherLog -Value $line -Encoding UTF8
    Write-Host $line
}

# The bot logs Japanese text and emoji. The default Windows codepage
# cannot represent emoji, which crashes the write, so pin everything to
# UTF-8 on both sides of the pipe.
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
    # Some hosts refuse this; only console display suffers, logging is fine.
}

$python = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-LauncherLog "[ERROR] venv not found: $python"
    Write-LauncherLog "[ERROR] Run first: python -m venv .venv"
    Write-LauncherLog "[ERROR] Then: .venv\Scripts\activate ; pip install -r requirements.txt"
    exit 1
}

if (-not (Test-Path (Join-Path $repoRoot ".env"))) {
    Write-LauncherLog "[ERROR] .env not found: $repoRoot\.env"
    exit 1
}

# Stopping the scheduled task kills this launcher but can orphan the
# python process it started, which then keeps answering Discord. Clear
# any survivor before starting, or the bot ends up running twice.
$lockFile = Join-Path $repoRoot "data\bot.lock"
if (Test-Path $lockFile) {
    $stalePid = (Get-Content -Path $lockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($stalePid -match '^\d+$') {
        $stale = Get-Process -Id ([int]$stalePid) -ErrorAction SilentlyContinue
        if ($stale -and $stale.ProcessName -eq "python") {
            Write-LauncherLog "[WARN] stopping orphaned bot (PID: $stalePid)"
            Stop-Process -Id ([int]$stalePid) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
        }
    }
}

Write-LauncherLog "[INFO] starting bot"

try {
    & $python -m app.main 2>&1 | ForEach-Object {
        Add-Content -Path $launcherLog -Value $_ -Encoding UTF8
        Write-Host $_
    }
    $exitCode = $LASTEXITCODE
} catch {
    Write-LauncherLog "[ERROR] failed to start: $($_.Exception.Message)"
    exit 1
}

Write-LauncherLog "[INFO] bot exited (code: $exitCode)"
exit $exitCode
