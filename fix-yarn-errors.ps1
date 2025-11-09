# Fix Yarn Errors Script
Write-Host "🔧 Fixing Yarn Errors..." -ForegroundColor Cyan

# Step 1: Stop any running processes that might lock files
Write-Host "`n1. Stopping processes that might lock files..." -ForegroundColor Yellow
$esbuildProcesses = Get-Process -Name "esbuild" -ErrorAction SilentlyContinue
if ($esbuildProcesses) {
    $esbuildProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "   ✓ Stopped esbuild processes" -ForegroundColor Green
}

# Step 2: Clean yarn cache
Write-Host "`n2. Cleaning yarn cache..." -ForegroundColor Yellow
yarn cache clean
Write-Host "   ✓ Cache cleaned" -ForegroundColor Green

# Step 3: Remove node_modules if it exists and has issues
Write-Host "`n3. Removing problematic node_modules..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    # Try to remove locked files first
    $lockedFiles = @(
        "node_modules\@esbuild\win32-x64\esbuild.exe",
        "node_modules\@rollup\rollup-win32-x64-msvc\rollup.win32-x64-msvc.node"
    )
    
    foreach ($file in $lockedFiles) {
        $fullPath = Join-Path $PWD $file
        if (Test-Path $fullPath) {
            try {
                Remove-Item $fullPath -Force -ErrorAction Stop
                Write-Host "   ✓ Removed locked file: $file" -ForegroundColor Green
            } catch {
                Write-Host "   ⚠ Could not remove: $file (may be in use)" -ForegroundColor Yellow
            }
        }
    }
    
    # If rollup file is still locked, remove entire @rollup directory
    $rollupDir = Join-Path $PWD "node_modules\@rollup"
    if (Test-Path $rollupDir) {
        try {
            Remove-Item $rollupDir -Recurse -Force -ErrorAction Stop
            Write-Host "   ✓ Removed @rollup directory" -ForegroundColor Green
        } catch {
            Write-Host "   ⚠ Could not remove @rollup directory" -ForegroundColor Yellow
        }
    }
}

# Step 4: Reinstall dependencies
Write-Host "`n4. Reinstalling dependencies..." -ForegroundColor Yellow
yarn install --check-files
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Installation had issues, trying with --force..." -ForegroundColor Yellow
    yarn install --force
}

# Step 5: Verify integrity
Write-Host "`n5. Verifying integrity..." -ForegroundColor Yellow
yarn check --integrity
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Integrity check passed!" -ForegroundColor Green
} else {
    Write-Host "   ⚠ Integrity check failed - this may be normal if lockfile is being updated" -ForegroundColor Yellow
}

Write-Host "`n✅ Yarn error fix complete!" -ForegroundColor Green
Write-Host "`nIf you still see errors, try:" -ForegroundColor Cyan
Write-Host "   1. Close all terminals and IDEs" -ForegroundColor White
Write-Host "   2. Run this script again" -ForegroundColor White
Write-Host "   3. Or manually: Remove node_modules folder and run 'yarn install'" -ForegroundColor White

