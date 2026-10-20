@echo off
cd /d "%~dp0"
if not exist .env.local (
  echo First run set-google-key.bat
  pause
  exit /b 1
)
for /f "tokens=1,* delims==" %%a in (.env.local) do set "%%a=%%b"
echo.
echo Uploading Delvr to Vercel. The first time it opens the browser to log in,
echo then asks a few questions: press Enter on each one (the defaults are fine).
echo.
call npx --yes vercel@latest deploy --prod --build-env VITE_GOOGLE_MAPS_KEY=%VITE_GOOGLE_MAPS_KEY% --env GOOGLE_ROUTES_KEY=%GOOGLE_ROUTES_KEY%
echo.
echo Done. The address next to "Production" (ends with .vercel.app) is your app.
pause
