# Windowsのタスクスケジューラから呼び出すための起動スクリプト。
# 設置手順は docs/deploy-windows-minipc.md を参照してください。
#
# このスクリプトの場所（deploy/）を基準にリポジトリ直下へ移動するため、
# タスクスケジューラの「開始（作業フォルダ）」欄が空でも正しく動きます。
#
# タスクスケジューラ実行時は画面が無く、Pythonが起動する前に失敗すると
# 原因が一切残りません。そのため起動処理そのものを logs\launcher.log に
# 記録します（アプリ本体のログは .env の LOG_FILE 側に出力されます）。

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

# 日本語や絵文字を含むログがWindowsの既定エンコーディング(cp932)で
# 落ちないよう、Python側の入出力をUTF-8に固定する。
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$python = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-LauncherLog "[ERROR] 仮想環境が見つかりません: $python"
    Write-LauncherLog "[ERROR] 先に python -m venv .venv と pip install -r requirements.txt を実行してください。"
    exit 1
}

if (-not (Test-Path (Join-Path $repoRoot ".env"))) {
    Write-LauncherLog "[ERROR] .env が見つかりません: $repoRoot\.env"
    exit 1
}

Write-LauncherLog "[INFO] Botを起動します: $python -m app.main"

try {
    # 標準出力・標準エラーの両方をランチャーログにも残す。
    & $python -m app.main 2>&1 | ForEach-Object {
        Add-Content -Path $launcherLog -Value $_ -Encoding UTF8
        Write-Host $_
    }
    $exitCode = $LASTEXITCODE
} catch {
    Write-LauncherLog "[ERROR] 起動に失敗しました: $($_.Exception.Message)"
    exit 1
}

Write-LauncherLog "[INFO] Botが終了しました (終了コード: $exitCode)"
exit $exitCode
