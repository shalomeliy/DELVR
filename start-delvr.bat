@echo off
cd /d "%~dp0"
if not exist .env.local (
  echo First run set-google-key.bat
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing, first time only...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo.
echo Delvr is starting at http://localhost:5173 - close this window to stop it.
call npm run dev -- --port 5173 --strictPort --open
pause
