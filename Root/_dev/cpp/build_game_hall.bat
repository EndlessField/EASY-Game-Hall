@echo off
rem ============================================================
rem  Game Hall (single-WebView2 launcher) build script
rem  Lives in Z:\Root\_dev\cpp\ ; output goes up two levels to Z:\Root\
rem  Output: Z:\Root\_build_hall.exe -> renamed to "<hall>.exe" by rename_hall.js
rem  Sources: GameHall.cpp + HallPage.hpp (page template) + wv2sdk
rem
rem  Default = 32-bit (x86): runs natively on 32-bit Windows and under WOW64 on
rem  64-bit Windows, so one binary covers both. The WebView2 loader is linked
rem  statically (WebView2LoaderStatic.lib) and the CRT is static (/MT) ->
rem  no WebView2Loader.dll, no VC++ runtime to ship.
rem  Pass "x64" only if you explicitly want a 64-bit build:
rem      build_game_hall.bat x64
rem ============================================================
setlocal
set ARCH=%1
if "%ARCH%"=="" set ARCH=x86
if /i "%ARCH%"=="x86" goto archok
if /i "%ARCH%"=="x64" goto archok
echo usage: build_game_hall.bat [x86^|x64]   (default x86)
exit /b 1
:archok
call "C:\Users\Admin\New\VC\Auxiliary\Build\vcvarsall.bat" %ARCH% >nul
if errorlevel 1 (echo BUILD FAILED: VC environment for %ARCH% not found & exit /b 1)
cd /d "%~dp0"
cl /nologo /utf-8 /EHsc /std:c++17 /DUNICODE /D_UNICODE /O2 /MT ^
   /I"wv2sdk\build\native\include" ^
   GameHall.cpp "wv2sdk\build\native\%ARCH%\WebView2LoaderStatic.lib" ^
   /link user32.lib shell32.lib ole32.lib gdi32.lib shlwapi.lib version.lib advapi32.lib ^
   /SUBSYSTEM:WINDOWS /OUT:"%~dp0..\..\_build_hall.exe"
if errorlevel 1 (echo BUILD FAILED & exit /b 1)
del /q GameHall.obj >nul 2>nul
echo BUILD OK (%ARCH%) - renaming + refreshing the generated hall page (_runtime\hall.html)
node "%~dp0rename_hall.js" %ARCH%
