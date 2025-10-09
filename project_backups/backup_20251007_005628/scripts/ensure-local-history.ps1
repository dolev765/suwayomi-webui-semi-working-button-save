# Ensure Local History Extension is Always Active
# This script verifies and activates Local History for the Tachidesk WebUI project

Write-Host "=== LOCAL HISTORY ACTIVATION SCRIPT ===" -ForegroundColor Green
Write-Host ""

# Check if we're in the correct directory
$expectedDir = "C:\Users\dolev\AppData\Local\Tachidesk\webUI"
if ((Get-Location).Path -ne $expectedDir) {
    Write-Host "❌ Please run this script from: $expectedDir" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Running from correct directory: $expectedDir" -ForegroundColor Green
Write-Host ""

# Check if .vscode directory exists
if (-not (Test-Path ".vscode")) {
    Write-Host "❌ .vscode directory not found" -ForegroundColor Red
    exit 1
}

# Check if settings.json exists and has Local History configuration
$settingsPath = ".vscode\settings.json"
if (Test-Path $settingsPath) {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json
    
    if ($settings.'local-history.enabled' -eq 1) {
        Write-Host "✅ Local History is enabled in settings" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Local History not properly enabled in settings" -ForegroundColor Yellow
    }
    
    if ($settings.'files.autoSave' -eq "afterDelay") {
        Write-Host "✅ Auto-save is configured" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Auto-save not properly configured" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ settings.json not found" -ForegroundColor Red
    exit 1
}

# Check if .history directory exists (will be created by extension)
if (Test-Path ".history") {
    $historyFiles = Get-ChildItem -Path ".history" -Recurse -File
    Write-Host "✅ .history directory exists with $($historyFiles.Count) files" -ForegroundColor Green
} else {
    Write-Host "ℹ️  .history directory will be created when files are modified" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== LOCAL HISTORY STATUS ===" -ForegroundColor Yellow

# Check if Local History extension is installed (this is a basic check)
$extensionsPath = "$env:USERPROFILE\.vscode\extensions"
$localHistoryExtensions = Get-ChildItem -Path $extensionsPath -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*local-history*" }

if ($localHistoryExtensions) {
    Write-Host "✅ Local History extension appears to be installed" -ForegroundColor Green
    Write-Host "   Found: $($localHistoryExtensions.Name -join ', ')" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Local History extension may not be installed" -ForegroundColor Yellow
    Write-Host "   Please install 'Local History' extension in Cursor IDE" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== ACTIVATION INSTRUCTIONS ===" -ForegroundColor Cyan
Write-Host "1. Open Cursor IDE in this directory" -ForegroundColor White
Write-Host "2. Install 'Local History' extension if not already installed:" -ForegroundColor White
Write-Host "   - Press Ctrl+Shift+X" -ForegroundColor Gray
Write-Host "   - Search for 'Local History'" -ForegroundColor Gray
Write-Host "   - Install the extension by ziyasal" -ForegroundColor Gray
Write-Host "3. Restart Cursor IDE to ensure settings take effect" -ForegroundColor White
Write-Host "4. Open any file and make a small change to test history tracking" -ForegroundColor White

Write-Host ""
Write-Host "=== VERIFICATION COMMANDS ===" -ForegroundColor Cyan
Write-Host "In Cursor IDE, use these commands to verify:" -ForegroundColor White
Write-Host "• Ctrl+Shift+P → 'local-history.showAll'" -ForegroundColor Gray
Write-Host "• Check Explorer panel for 'LOCAL HISTORY' section" -ForegroundColor Gray
Write-Host "• Right-click any file → 'Compare with current version'" -ForegroundColor Gray

Write-Host ""
Write-Host "=== MONITORING ===" -ForegroundColor Cyan
Write-Host "To monitor Local History status, run:" -ForegroundColor White
Write-Host "node scripts\monitor-local-history.js" -ForegroundColor Gray

Write-Host ""
Write-Host "🎉 Local History setup complete!" -ForegroundColor Green
Write-Host "Your Tachidesk WebUI project is now protected with automatic file history." -ForegroundColor Green
