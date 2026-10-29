@echo off
title Nur Jewellery - Gold Live (Local)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed. Download it from https://nodejs.org then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [..] First run: installing packages, please wait...
  call npm install --omit=dev
  if errorlevel 1 (
    echo [X] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

echo.
echo  ==========================================
echo    Nur Jewellery - Gold Live is starting
echo    This PC : http://localhost:3000
echo    Close this window to stop the site.
echo  ==========================================
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=1" %%b in ("%%a") do echo    Phone (same Wi-Fi): http://%%b:3000
echo.

start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
node server.js
pause
