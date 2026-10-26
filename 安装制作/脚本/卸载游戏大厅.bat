@echo off
setlocal
title Game Hall - Uninstall
cd /d "%~dp0"

rem Case 1: installed layout (this file sits in the install root, _installer\uninstall.ps1 exists).
rem The batch must exit before the folder can be deleted, so copy the uninstaller to TEMP
rem and start it in a separate PowerShell window with an explicit -InstallDir.
if exist "%~dp0_installer\uninstall.ps1" goto :installed

rem Case 2: package layout (this file sits in the package root, uninstall.ps1 next to it).
if exist "%~dp0uninstall.ps1" goto :package

echo.
echo  [ERROR] uninstall.ps1 was not found.
echo  Run this file from the Game Hall install folder or from the package root.
echo.
pause
exit /b 1

:installed
set "TMPUN=%TEMP%\GameHall_uninstall_%RANDOM%%RANDOM%.ps1"
copy /Y "%~dp0_installer\uninstall.ps1" "%TMPUN%" >nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Could not copy the uninstaller to TEMP.
  echo.
  pause
  exit /b 1
)
echo.
echo  Starting the uninstaller in a new window...
echo  This window will close so the install folder can be removed.
echo.
rem Leave the install folder as the current directory; otherwise Windows keeps it "in use".
cd /d "%TEMP%"
start "" /D "%TEMP%" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TMPUN%" -InstallDir "%~dp0." %*
exit /b 0

:package
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo  [uninstaller exit code: %RC%]
echo.
pause
exit /b %RC%
