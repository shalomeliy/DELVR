@echo off
cd /d "%~dp0"
echo.
echo Paste your Google key (starts with AIza) and press Enter.
echo It is saved only in this folder, in the file .env.local
echo.
set /p KEY=Key: 
if "%KEY%"=="" (echo No key entered. & pause & exit /b 1)
> .env.local echo VITE_GOOGLE_MAPS_KEY=%KEY%
>> .env.local echo GOOGLE_ROUTES_KEY=%KEY%
echo.
echo Saved. Now double-click start-delvr.bat
pause
