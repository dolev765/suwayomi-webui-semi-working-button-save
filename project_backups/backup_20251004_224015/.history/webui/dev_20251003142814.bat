@echo off
echo ========================================
echo   Suwayomi Development Server Launcher
echo ========================================
echo.

echo Checking for gradlew.bat...
if not exist "Suwayomi-Server\gradlew.bat" (
    echo ERROR: gradlew.bat not found in Suwayomi-Server directory
    echo Current directory: %CD%
    echo Please run this script from the webui root directory
    pause
    exit /b 1
)
echo gradlew.bat found

echo Checking for yarn...
yarn --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: yarn is not available
    echo Please install Node.js and yarn first
    pause
    exit /b 1
)
echo yarn found

echo Starting development servers...
echo.

echo Starting Gradle server...
start "Gradle Server" cmd /k "cd /d Suwayomi-Server && echo Starting Gradle server... && gradlew.bat :server:run --stacktrace"

timeout /t 2 /nobreak >nul

echo Starting Web client...
start "Web Client" cmd /k "cd /d %~dp0 && echo Starting Web client... && yarn dev"

echo.
echo ========================================
echo   Servers are starting...
echo ========================================
echo.
echo Gradle server will be available at:
echo   http://localhost:4567
echo.
echo Web client will be available at:
echo   http://localhost:3000 (or 3001, 3002, etc.)
echo.
echo Check the opened command windows for any errors.
echo Close those windows to stop the servers.
echo.
pause