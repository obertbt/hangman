# Windowsのタスクスケジューラから呼び出すための起動スクリプト。
# 設置手順は docs/deploy-windows-minipc.md を参照してください。
#
# このスクリプトの場所（deploy/）を基準にリポジトリ直下へ移動するため、
# タスクスケジューラの「開始（作業フォルダ）」欄が空でも正しく動きます。

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -Path $repoRoot

$python = Join-Path $repoRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    Write-Error "仮想環境が見つかりません: $python`n先に python -m venv .venv と pip install -r requirements.txt を実行してください。"
    exit 1
}

if (-not (Test-Path (Join-Path $repoRoot ".env"))) {
    Write-Error ".env が見つかりません: $repoRoot\.env"
    exit 1
}

& $python -m app.main
exit $LASTEXITCODE
