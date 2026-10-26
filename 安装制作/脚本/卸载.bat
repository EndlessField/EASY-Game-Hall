@echo off
setlocal
title Game Hall - Uninstall
cd /d "%~dp0"
echo.
echo  ============================================================
echo    Game Hall - Uninstall
echo  ============================================================
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo  [uninstaller exit code: %RC%]
echo.
pause
exit /b %RC%
