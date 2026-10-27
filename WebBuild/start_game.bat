@echo off
rem Starts the local web server for the WebGL build and opens the game in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Starting the game server. Keep this window open while you play; close it to stop the server.
node server.js --open
pause
