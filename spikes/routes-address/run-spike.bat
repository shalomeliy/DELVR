@echo off
cd /d "%~dp0"
echo.
echo Delvr spike: addresses straight into the route request.
echo It sends about 26 geocoding requests and 1 route request with your key (well inside the free tier).
echo.
node run.mjs
if exist result.md start "" notepad result.md
pause
