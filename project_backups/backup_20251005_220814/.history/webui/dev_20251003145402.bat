@echo off
echo ========================================
echo   Suwayomi Development Server Launcher
echo ========================================
echo.

if not exist "Suwayomi-Server\gradlew.bat" (
    echo ERROR: gradlew.bat not found
    pause
    exit /b 1
)

echo Starting Gradle server...
start "Gradle Server" cmd /k "cd Suwayomi-Server && gradlew.bat :server:run --stacktrace"

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Starting Web client...
start "Web Client" cmd /k "yarn dev"

echo.
echo ========================================
echo   Servers started!
echo ========================================
echo.
echo Gradle server: http://localhost:4567
echo Web client: http://localhost:3000 (or next available port)
echo.
echo Check the opened windows for status.
echo Close those windows to stop the servers.
echo.
pause
