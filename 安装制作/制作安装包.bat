@echo off
setlocal
title Game Hall - Build Installer Package
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo  [build exit code: %RC%]
echo.
pause
exit /b %RC%
