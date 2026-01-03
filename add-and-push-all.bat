@echo off
echo Adding all files to git...
git add -A

echo.
echo Checking status...
git status --short

echo.
echo Committing changes...
git commit -m "Add missing files: dev.bat, launchers, and other untracked files"

echo.
echo Pushing to GitHub...
git push

echo.
echo Done!
pause

