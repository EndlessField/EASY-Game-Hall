@echo off
setlocal
title Game Hall v0.1 Installer
cd /d "%~dp0"
echo.
echo  ============================================================
echo    Game Hall v0.1 - Installer
echo  ============================================================
echo.
echo  Chinese messages will appear below.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo  [installer exit code: %RC%]
echo.
pause
exit /b %RC%
