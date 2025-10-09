@echo off
echo Starting development servers...

start "Gradle Server" cmd /k "cd Suwayomi-Server && gradlew.bat :server:run --stacktrace"
start "Web Client" cmd /k "yarn dev"

echo Both servers started! Check the opened windows.
echo Gradle server: http://localhost:4567
echo Web client: http://localhost:3000 (or 3001, 3002, etc.)
pause
