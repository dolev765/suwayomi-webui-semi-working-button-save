# Script to add all files and push to GitHub
Write-Host "Adding all files to git..." -ForegroundColor Cyan
git add -A

Write-Host "Checking status..." -ForegroundColor Cyan
git status --short

Write-Host "`nCommitting changes..." -ForegroundColor Cyan
git commit -m "Add missing files: dev.bat, launchers, and other untracked files"

Write-Host "`nPushing to GitHub..." -ForegroundColor Cyan
git push

Write-Host "`nDone!" -ForegroundColor Green

