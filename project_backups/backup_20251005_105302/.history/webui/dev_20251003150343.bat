@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Suwayomi Development Server Builder
echo ========================================
echo.

REM Check prerequisites
if not exist "Suwayomi-Server\gradlew.bat" (
    echo ERROR: gradlew.bat not found
    echo Make sure you are in the webui directory
    pause
    exit /b 1
)

echo [1/3] Cleaning previous WebUI.zip...
if exist "Suwayomi-Server\server\src\main\resources\WebUI.zip" (
    del /F "Suwayomi-Server\server\src\main\resources\WebUI.zip"
    echo WebUI.zip deleted
) else (
    echo No previous WebUI.zip found
)

echo.
echo [2/3] Building Suwayomi Server JAR (without WebUI)...
echo This may take a few minutes...
echo.
cd Suwayomi-Server
call gradlew.bat server:shadowJar --console=plain

if errorlevel 1 (
    echo.
    echo ========================================
    echo   BUILD FAILED!
    echo ========================================
    cd ..
    pause
    exit /b 1
)

cd ..

echo.
echo ========================================
echo   BUILD SUCCESSFUL!
echo ========================================
echo.
echo Server JAR created at:
echo   Suwayomi-Server\server\build\Suwayomi-Server-vX.Y.Z-rxxx.jar
echo.
echo [3/3] Starting Web client...
start "Suwayomi Web Client" cmd /k "yarn dev"

echo.
echo Web client will be available at:
echo   http://localhost:3000 (or next available port)
echo.
echo To run the server, use:
echo   java -jar Suwayomi-Server\server\build\Suwayomi-Server-*.jar
echo.
pause
