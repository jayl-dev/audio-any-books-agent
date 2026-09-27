@echo off
title Audio Any Books Player Server
cd /d "%~dp0"

rem Drag a folder onto this file to serve it, or type/paste a folder path when asked.
set "PLAYER_DIR=%~1"
if "%PLAYER_DIR%"=="" (
  echo Folder with your *_player.html files
  set /p "PLAYER_DIR=(drag it here or paste its path, then press Enter; just Enter = this project folder): "
)
rem Remove any quotes pasted or dragged in with the path
if defined PLAYER_DIR set "PLAYER_DIR=%PLAYER_DIR:"=%"

echo Starting local audiobook player server...
if defined PLAYER_DIR (
  node server.js "%PLAYER_DIR%"
) else (
  node server.js
)
pause
