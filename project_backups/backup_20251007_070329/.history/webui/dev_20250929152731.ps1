# Simple development script
Write-Host "Starting development servers..." -ForegroundColor Green

# Start Gradle server in background
Start-Process -FilePath ".\Suwayomi-Server\gradlew.bat" -ArgumentList ":server:run", "--stacktrace" -WorkingDirectory ".\Suwayomi-Server" -WindowStyle Minimized

# Start yarn dev in background  
Start-Process -FilePath "powershell" -ArgumentList "-Command", "yarn dev" -WorkingDirectory "." -WindowStyle Minimized

Write-Host "Both servers started! Check the minimized windows." -ForegroundColor Yellow
Write-Host "Gradle server: http://localhost:4567" -ForegroundColor Cyan
Write-Host "Web client: http://localhost:3000 (or 3001, 3002, etc.)" -ForegroundColor Cyan