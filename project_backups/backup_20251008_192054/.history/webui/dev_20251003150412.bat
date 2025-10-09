@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Suwayomi Development Server Launcher
echo ========================================
echo.

REM Check prerequisites
if not exist "Suwayomi-Server\gradlew.bat" (
    echo ERROR: gradlew.bat not found
    echo Make sure you are in the webui directory
    pause
    exit /b 1
)

echo [1/2] Starting Gradle server...
start "Suwayomi Gradle Server" cmd /k "cd /d %~dp0Suwayomi-Server && gradlew.bat :server:run --stacktrace"

echo [2/2] Waiting 3 seconds before starting web client...
timeout /t 3 /nobreak >nul

echo Starting Web client...
start "Suwayomi Web Client" cmd /k "cd /d %~dp0 && yarn dev"

echo.
echo ========================================
echo   Both servers are starting!
echo ========================================
echo.
echo Two windows have opened:
echo   - "Suwayomi Gradle Server" (backend)
echo   - "Suwayomi Web Client" (frontend)
echo.
echo Once started:
echo   Gradle server: http://localhost:4567
echo   Web client: http://localhost:3000 (or next available port)
echo.
echo To stop: Close both terminal windows
echo.
echo Press any key to exit this launcher...
pause >nul
