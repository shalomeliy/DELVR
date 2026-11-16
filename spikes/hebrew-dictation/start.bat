@echo off
cd /d "%~dp0"
start "" /b node serve.mjs
timeout /t 2 >nul
start "" chrome "http://localhost:8765"
echo.
echo PassIT test page is running. Close this window when you finish.
pause >nul
