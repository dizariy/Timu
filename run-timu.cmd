@echo off
cd /d "%~dp0"
echo timu - local app
echo Open http://127.0.0.1:4173/ in your browser.
echo Keep this window open while using timu. Press Ctrl+C to stop.
if exist "%ProgramFiles%\nodejs\node.exe" (
  "%ProgramFiles%\nodejs\node.exe" server.mjs
) else (
  node server.mjs
)
if errorlevel 1 pause
