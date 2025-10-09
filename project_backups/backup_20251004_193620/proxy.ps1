param(
    [int]$Port = 5003,
    [string]$BaseUrl = "you gotta fill this in later"
)

# Clear screen and show what we're doing
Clear-Host
Write-Host "🚀 CORS PROXY SETUP" -ForegroundColor Green
Write-Host "Port: $Port | Base: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# Setup workspace
$WorkspaceDir = "$env:USERPROFILE\cors-proxy-$Port"
if (!(Test-Path $WorkspaceDir)) { New-Item -ItemType Directory -Path $WorkspaceDir -Force | Out-Null }
Set-Location $WorkspaceDir
Write-Host "✅ Workspace: $WorkspaceDir" -ForegroundColor Green

# Kill existing process on port
try {
    $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $processes) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Write-Host "✅ Killed process on port $Port" -ForegroundColor Green
    }
} catch { }

# Check Node.js
try {
    $nodeVersion = & node --version 2>$null
    if (!$nodeVersion) { throw }
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit
}

# Initialize npm if needed
if (!(Test-Path "package.json")) {
    Write-Host "⚡ Initializing npm..." -ForegroundColor Yellow
    & npm init -y | Out-Null
}

# Install dependency
Write-Host "⚡ Installing cors-anywhere..." -ForegroundColor Yellow
& npm install cors-anywhere@0.4.4 --save --silent 2>$null

# Create proxy server
Write-Host "⚡ Creating server..." -ForegroundColor Yellow
@"
const cors_proxy = require('cors-anywhere');
const server = cors_proxy.createServer({
  originWhitelist: [],
  requireHeader: [],
  removeHeaders: []
});

console.log('\n🎉 CORS PROXY RUNNING!');
console.log('========================================');
console.log('✅ Status: ACTIVE');
console.log('🌐 URL: http://localhost:$Port');
console.log('🎯 Target: $BaseUrl');
console.log('📋 Use: http://localhost:$Port/$BaseUrl/batch/images/translate');
console.log('🛑 Stop: Ctrl+C');
console.log('========================================\n');

server.on('request', (req, res) => {
  console.log('📡 [' + new Date().toLocaleTimeString() + '] ' + req.method + ' ' + req.url);
});

server.listen($Port, '0.0.0.0');
"@ | Out-File -FilePath "proxy.js" -Encoding UTF8

# Set environment and start
$env:TARGET_BASE = $BaseUrl
Write-Host "🎬 STARTING SERVER..." -ForegroundColor Green
Write-Host ""
& node proxy.js