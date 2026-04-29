param(
    [switch]$ReinstallDeps
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$venvDir = Join-Path $backendDir '.venv'
$activateScript = Join-Path $venvDir 'Scripts\Activate.ps1'
$backendEnv = Join-Path $backendDir '.env'
$backendEnvExample = Join-Path $backendDir '.env.example'

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

Assert-Command python
Assert-Command npm

if (-not (Test-Path $backendDir)) {
    throw "Backend folder not found: $backendDir"
}
if (-not (Test-Path $frontendDir)) {
    throw "Frontend folder not found: $frontendDir"
}

if (-not (Test-Path $venvDir)) {
    Write-Host 'Creating backend virtual environment...'
    Push-Location $backendDir
    python -m venv .venv
    Pop-Location
}

if (-not (Test-Path $activateScript)) {
    throw "Virtual environment activation script missing: $activateScript"
}

if (-not (Test-Path $backendEnv) -and (Test-Path $backendEnvExample)) {
    Write-Host 'Creating backend .env from .env.example...'
    Copy-Item $backendEnvExample $backendEnv
}

Write-Host 'Preparing backend dependencies...'
Push-Location $backendDir
& $activateScript
if ($ReinstallDeps) {
    pip install --upgrade -r requirements.txt
} elseif (-not (Test-Path (Join-Path $venvDir '.deps_installed'))) {
    pip install -r requirements.txt
    New-Item -Path (Join-Path $venvDir '.deps_installed') -ItemType File -Force | Out-Null
}

Write-Host 'Applying database migrations...'
alembic upgrade head
Pop-Location

if ($ReinstallDeps -or -not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Host 'Preparing frontend dependencies...'
    Push-Location $frontendDir
    npm install
    Pop-Location
}

$backendCommand = "Set-Location '$backendDir'; & '$activateScript'; uvicorn main_simple:app --reload --host 0.0.0.0 --port 8000"
$frontendCommand = "Set-Location '$frontendDir'; npm run dev"

Write-Host 'Starting backend in a new terminal window...'
Start-Process powershell -ArgumentList '-NoExit', '-Command', $backendCommand | Out-Null

Write-Host 'Starting frontend in a new terminal window...'
Start-Process powershell -ArgumentList '-NoExit', '-Command', $frontendCommand | Out-Null

Write-Host ''
Write-Host 'ScoutD3 is starting.'
Write-Host 'Frontend: http://127.0.0.1:5173'
Write-Host 'Backend:  http://127.0.0.1:8000/api/v1'
Write-Host 'Docs:     http://127.0.0.1:8000/docs'
