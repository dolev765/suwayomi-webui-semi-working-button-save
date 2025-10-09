[CmdletBinding()]
param(
    [switch]$SkipServer,
    [switch]$SkipClient
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root 'Suwayomi-Server'
$gradleScript = Join-Path $serverDir 'gradlew.bat'

if (-not (Test-Path $gradleScript)) {
    throw "Unable to locate gradlew.bat at $gradleScript"
}

if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
    throw 'yarn is not available on PATH. Please install dependencies first.'
}

$processes = @()

try {
    if (-not $SkipServer) {
        Write-Host "Starting Gradle server..." -ForegroundColor Cyan
        $processes += Start-Process -FilePath $gradleScript -ArgumentList @(':server:run', '--stacktrace') -WorkingDirectory $serverDir -NoNewWindow -PassThru
    }

    if (-not $SkipClient) {
        Write-Host "Starting web client..." -ForegroundColor Cyan
        $processes += Start-Process -FilePath 'powershell' -ArgumentList "-NoProfile", "-Command", "Set-Location '$root'; yarn dev" -NoNewWindow -PassThru
    }

    if ($processes.Count -eq 0) {
        Write-Warning 'Both tasks were skipped. Nothing to do.'
        return
    }

    Write-Host 'Both processes are running. Press Ctrl+C to stop.' -ForegroundColor Green

    Wait-Process -Id ($processes | ForEach-Object { $_.Id })
}
finally {
    foreach ($proc in $processes) {
        if ($proc -and -not $proc.HasExited) {
            try {
                $null = $proc.CloseMainWindow()
                Start-Sleep -Milliseconds 500
            } catch {}
        }
    }

    foreach ($proc in $processes) {
        if ($proc -and -not $proc.HasExited) {
            try {
                $proc.Kill()
            } catch {}
        }
    }
}