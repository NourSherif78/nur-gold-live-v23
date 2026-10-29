@echo off
chcp 65001 >nul
title Nur Jewellery - Live Dashboard
echo ===================================================
echo   Nur Jewellery Live Dashboard is starting...
echo ===================================================
if not exist node_modules (
    echo Installing dependencies (first run only)...
    npm install
)
timeout /t 1 /nobreak >nul
start "" "http://localhost:3000"
node server.js
if %errorlevel% neq 0 (
    echo.
    echo Server stopped or error occurred.
    pause
)