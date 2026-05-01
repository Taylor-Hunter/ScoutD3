$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$venvDir = Join-Path $backendDir '.venv'
$activateScript = Join-Path $venvDir 'Scripts\Activate.ps1'

if (-not (Test-Path $activateScript)) {
    Write-Host 'Virtual environment not found.' -ForegroundColor Red
    Write-Host "Run 'scripts\run-local.cmd' first to install dependencies." -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host 'Frontend node_modules not found.' -ForegroundColor Red
    Write-Host "Run 'scripts\run-local.cmd' first to install dependencies." -ForegroundColor Yellow
    exit 1
}

$backendCommand = "Set-Location '$backendDir'; & '$activateScript'; uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev"

Write-Host 'Starting backend in a new terminal window...'
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand | Out-Null

Write-Host 'Starting frontend in a new terminal window...'
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand | Out-Null

Write-Host ''
Write-Host 'ScoutD3 is starting (fast mode - skipped install and migrations).' -ForegroundColor Green
Write-Host 'Frontend: http://127.0.0.1:5173'
Write-Host 'Backend:  http://127.0.0.1:8000/api/v1'
Write-Host 'Docs:     http://127.0.0.1:8000/docs'
