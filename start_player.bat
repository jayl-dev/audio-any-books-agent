@echo off
title Audio Any Books Player Server
cd /d "%~dp0"
echo Starting local audiobook player server...
node server.js
pause
