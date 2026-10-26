@echo off
setlocal EnableDelayedExpansion
rem 不切代码页: 本脚本按 GBK 存盘, 切到 UTF-8 会让中文文件名(如使用说明)匹配失败
title 交火 · 安装 / 更新程序

rem ============================================================================
rem  《交火》安装 / 更新程序  (install.bat)
rem  1) 检查本机是否装了 WebView2 运行时(缺了就静默装包内的离线安装器)
rem  2) 询问安装目录, 已存在则按"更新"处理(保留导出存档等外部文件)
rem  3) 版本比对: 安装包比已装版本旧 → 报警并要求二次确认才允许覆盖(降级)
rem  4) 复制游戏本体 + 在桌面创建快捷方式(图标取包内 photo.ico)
rem  运行方式: 解压后双击本文件即可。不需要管理员权限。
rem ============================================================================

set "SRC=%~dp0"
rem 可选命令行参数(便于批处理/自动化调用):
rem   /dir:<安装目录>   跳过"安装到"提问
rem   /yes             版本更旧时直接确认降级覆盖, 不再二次询问
set "ARGDIR=%CF_DIR%"
rem 也支持环境变量 CF_DIR(路径带空格时比命令行更省事)、CF_YES=1
set "ARGYES=0"
if "%CF_YES%"=="1" set "ARGYES=1"
set "ARGCLEAN="
set "_inq=0"
for %%a in (%*) do call :argscan "%%~a"
call :argparse
if defined ARGDIR set "ANS=%ARGDIR%"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
if exist "%SRC%\index.html" goto :srcready
echo [错误] 没有在 "%SRC%" 找到 index.html。
echo        请把压缩包完整解压后再运行本程序; 只把 install.bat 单独拖出来是无效的。
echo.
pause
exit /b 1
:srcready
echo CF:PKG=OK

set "PKGVER="
if exist "%SRC%\VERSION.txt" for /f "usebackq tokens=1" %%v in ("%SRC%\VERSION.txt") do if not defined PKGVER set "PKGVER=%%v"
if not defined PKGVER set "PKGVER=%SRC%"
for %%d in ("%PKGVER%") do set "PKGVER=%%~nxd"
set "PKGVER=%PKGVER:交火_=%"
call :parsever "%PKGVER%"
if not "%PKGVER%"=="未知" goto :verknown
echo [提示] 从目录名里没认出安装包版本号, 将跳过版本比对。
echo CF:PKGVER=UNKNOWN
set "PKGVER=未知"
:verknown

set "DEFDIR=%LOCALAPPDATA%\交火"
set "INSDIR="
echo ============================================================
echo   《交火》安装 / 更新程序        安装包版本: %PKGVER%
echo ============================================================
echo.
echo  [1/4] 检查 WebView2 运行时 ...
call :checkwv
if defined WVFOUND echo CF:WV=FOUND
if defined WVFOUND goto :wvok
echo        未检测到 WebView2 运行时, 尝试安装随包分发的离线安装器 ...
call :installwv
goto :wvdone
:wvok
echo        已安装 WebView2 运行时, 版本 %WVVER%
:wvdone
echo.

echo  [2/4] 选择安装目录
echo        直接回车 = 默认目录: %DEFDIR%
echo        也可以把目录拖到本窗口, 或直接输入完整路径。
set "INSDIR="
if defined ARGDIR goto :direcho
set /p "ANS=        安装到: "
:direcho
if not defined ANS set "ANS=%DEFDIR%"
call :abs "%ANS%"
if defined ABS set "INSDIR=%ABS%"
if not defined INSDIR set "INSDIR=%DEFDIR%"
if "%INSDIR:~-1%"=="\" set "INSDIR=%INSDIR:~0,-1%"
echo        目标目录: %INSDIR%
echo CF:DIR=%INSDIR%
echo.

echo  [3/4] 版本检查
set "STATUS=new"
set "INSTVER="
if not exist "%INSDIR%\index.html" goto :verdone
set "STATUS=update"
if exist "%INSDIR%\VERSION.txt" for /f "usebackq tokens=1" %%v in ("%INSDIR%\VERSION.txt") do if not defined INSTVER set "INSTVER=%%v"
if defined INSTVER set "INSTVER=%INSTVER:交火_=%"
if not defined INSTVER call :readrev "%INSDIR%"
if not defined INSTVER set "INSTVER=未知"
echo        目标目录里已有安装: 当前版本 %INSTVER%
echo CF:STATUS=UPDATE
echo CF:VER=INSTALLED:%INSTVER%
echo CF:VER=PACKAGE:%PKGVER%
goto :vercmp
:verdone
echo        目标目录还没有《交火》, 将全新安装。
echo CF:STATUS=NEW
echo CF:VER=INSTALLED:%INSTVER%
:vercmp
call :cmpver "%INSTVER%"
echo CF:CMP=%CMP%
if not "%STATUS%"=="update" goto :noforce
if not "%CMP%"=="LT" goto :noforce
echo.
echo        !!! 版本警告 !!!
echo        本安装包 %PKGVER%  比已装版本 %INSTVER%  更旧。
echo        继续会覆盖成旧版本, 且不回退。请确认你确实要降级。
echo.
set "FORCE="
set /p "FORCE=        输入 Y 强制覆盖, 其它任意键取消: "
if "%ARGYES%"=="1" goto :forced
if /i "%FORCE%"=="Y" goto :forced
echo        已取消, 没有修改任何文件。
echo CF:DECISION=ABORT
echo.
pause
exit /b 1
:forced
echo        已确认降级覆盖。
echo CF:DECISION=FORCE
:noforce
if "%STATUS%"=="update" if "%CMP%"=="EQ" echo        版本相同, 将按修复安装重新覆盖一遍。
echo.

echo  [4/4] 写入文件
if not exist "%INSDIR%" mkdir "%INSDIR%" 2>nul
if exist "%INSDIR%" goto :dirmade
echo [错误] 无法创建目录 "%INSDIR%" —— 路径无效或没有写入权限。
echo.
pause
exit /b 1
:dirmade
> "%INSDIR%\.write_test.tmp" echo t 2>nul
if exist "%INSDIR%\.write_test.tmp" goto :writable
echo [错误] 目录不可写: "%INSDIR%" —— 请换一个位置(或换一个有权限的账号)。
echo.
pause
exit /b 1
:writable
del "%INSDIR%\.write_test.tmp" >nul 2>&1

echo        复制游戏本体 ...
if not exist "%SRC%\game" goto :nogame
if not exist "%INSDIR%\game" mkdir "%INSDIR%\game" 2>nul
xcopy "%SRC%\game" "%INSDIR%\game\" /E /I /Y /Q >nul
if errorlevel 1 goto copyfail
:nogame
if not exist "%SRC%\fontawesome-free-7.3.1-web" goto :nofa
if not exist "%INSDIR%\fontawesome-free-7.3.1-web" mkdir "%INSDIR%\fontawesome-free-7.3.1-web" 2>nul
xcopy "%SRC%\fontawesome-free-7.3.1-web" "%INSDIR%\fontawesome-free-7.3.1-web\" /E /I /Y /Q >nul
if errorlevel 1 goto copyfail
:nofa
if exist "%SRC%\photo.ico" copy /Y "%SRC%\photo.ico" "%INSDIR%\photo.ico" >nul
if exist "%SRC%\index.html" copy /Y "%SRC%\index.html" "%INSDIR%\index.html" >nul
if exist "%SRC%\AI_README.md" copy /Y "%SRC%\AI_README.md" "%INSDIR%\AI_README.md" >nul
if exist "%SRC%\tests" xcopy "%SRC%\tests" "%INSDIR%\tests\" /E /I /Y /Q >nul
if exist "%SRC%\README.md" copy /Y "%SRC%\README.md" "%INSDIR%\README.md" >nul
if exist "%SRC%\CHANGELOG.md" copy /Y "%SRC%\CHANGELOG.md" "%INSDIR%\CHANGELOG.md" >nul
if exist "%SRC%\LICENSE" copy /Y "%SRC%\LICENSE" "%INSDIR%\LICENSE" >nul
if exist "%SRC%\THIRD_PARTY_NOTICES.md" copy /Y "%SRC%\THIRD_PARTY_NOTICES.md" "%INSDIR%\THIRD_PARTY_NOTICES.md" >nul
if exist "%SRC%\install.bat" copy /Y "%SRC%\install.bat" "%INSDIR%\install.bat" >nul
echo        文档与测试已同步
for %%f in ("%SRC%\*.txt") do if exist "%%~ff" copy /Y "%%~ff" "%INSDIR%\%%~nxf" >nul
set "WVINST=%SRC%\MicrosoftEdgeWebView2RuntimeInstallerX86.exe"
if exist "%WVINST%" copy /Y "%WVINST%" "%INSDIR%\MicrosoftEdgeWebView2RuntimeInstallerX86.exe" >nul
> "%INSDIR%\VERSION.txt" echo %PKGVER%
if not exist "%INSDIR%\index.html" goto copyfail
echo        文件写入完成: %INSDIR%
echo CF:COPY=OK
echo.

echo        创建桌面快捷方式 ...
set "LNKOK=0"
set "VBS=%TEMP%\cf_mklink_%RANDOM%.vbs"
> "%VBS%" echo Set oWS = WScript.CreateObject("WScript.Shell")
>> "%VBS%" echo sLink = oWS.SpecialFolders("Desktop") ^& "\交火.lnk"
>> "%VBS%" echo Set oLink = oWS.CreateShortcut(sLink)
>> "%VBS%" echo oLink.TargetPath = "%INSDIR%\index.html"
>> "%VBS%" echo oLink.WorkingDirectory = "%INSDIR%"
>> "%VBS%" echo oLink.IconLocation = "%INSDIR%\photo.ico,0"
>> "%VBS%" echo oLink.Description = "交火 · 户型图红蓝对抗 %PKGVER%"
>> "%VBS%" echo oLink.Save
cscript //nologo "%VBS%" >nul 2>&1
if not errorlevel 1 set "LNKOK=1"
del "%VBS%" >nul 2>&1
if not "%LNKOK%"=="1" goto :lnkfail
echo        桌面快捷方式已创建: 交火
echo CF:LNK=OK
goto :lnkdone
:lnkfail
echo        [提示] 桌面快捷方式创建失败(可能是脚本宿主被禁用)。
echo CF:LNK=FAIL
echo               你可以手工右键 "%INSDIR%\index.html" → 发送到 → 桌面快捷方式。
:lnkdone
if not exist "%INSDIR%\photo.ico" echo        [提示] 包内没有 photo.ico, 快捷方式用的是默认图标。
echo.

echo ============================================================
echo   完成! 版本 %PKGVER%  →  %INSDIR%
echo   双击桌面「交火」即可开始; 存档仍在浏览器 localStorage 里,
echo   换目录/重装都不会丢; 重要进度请用主页「导出存档」定期备份。
echo ============================================================
echo.
pause
exit /b 0

:copyfail
echo.
echo [错误] 复制文件失败 —— 目标目录可能被占用, 或磁盘空间/权限不足。
echo        已写入的文件不会自动回滚, 修好问题后重新运行本程序即可。
echo.
pause
exit /b 1

rem ======================= 子过程 =======================
rem 单个命令行参数解析(大小写不敏感; /dir: 后允许带引号)
rem 收集命令行片段: 遇到 /dir: 且参数里带引号时, 一直收集到收尾引号为止(支持路径带空格)
:argscan
set "_a=%~1"
if not defined _a exit /b 0
if "%_inq%"=="1" goto :argscan_in
if /i "%_a:~0,5%"=="/dir:" goto :argscan_dir
if /i "%_a%"=="/yes" set "ARGYES=1"
exit /b 0
:argscan_dir
set "ARGCLEAN=%_a%"
if "%_a:~5,1%"=="""" set "_inq=1"
exit /b 0
:argscan_in
set "ARGCLEAN=%ARGCLEAN% %_a%"
if "%_a:~-1%"=="""" set "_inq=0"
exit /b 0

rem 解析收集到的 /dir: 片段(去引号)
:argparse
if not defined ARGCLEAN exit /b 0
set "_d=%ARGCLEAN%"
if /i not "%_d:~0,5%"=="/dir:" exit /b 0
set "_d=%_d:~5%"
if "%_d:~0,1%"=="""" set "_d=%_d:~1%"
if "%_d:~-1%"=="""" set "_d=%_d:~0,-1%"
set "ARGDIR=%_d%"
exit /b 0
exit /b 0


rem 解析 vX.Y.Z 到 SA / SB / SC 三个纯数字(缺省 0)
rem 两个坑都踩过了, 别再改回去:
rem  1) EnableDelayedExpansion 下 "for /f ... do set X=%%a & set Y=%%b" 取不稳 %%b/%%c,
rem     所以先拼中间串 "_savext" 再二次拆开;
rem  2) "set "%~1=值"" 这种"按引用赋值"在本机实测失效(变量名被当成值写进去),
rem     所以一律显式写变量名, 不做通用助手。
:parsever
set "SA=0"
set "SB=0"
set "SC=0"
set "_savext="
for /f "tokens=1,2,3 delims=." %%a in ("%~1") do set "_savext=%%a/%%b/%%c"
if not defined _savext exit /b 0
set "_sa="
set "_sb="
set "_sc="
for /f "tokens=1,2,3 delims=/" %%a in ("%_savext%") do set "_sa=%%a"& set "_sb=%%b"& set "_sc=%%c"
if defined _sa set "SA=%_sa%"
if defined _sb set "SB=%_sb%"
if defined _sc set "SC=%_sc%"
set "SA=%SA:v=%"
set "SA=%SA:V=%"
call :digitsA
if defined _sb call :digitsB
if defined _sc call :digitsC
exit /b 0

:digitsA
set "_dok=1"
for /f "delims=0123456789" %%x in ("%SA%") do set "_dok=0"
if not defined SA set "_dok=0"
if "%_dok%"=="0" set "SA=1"
exit /b 0

:digitsB
set "_dok=1"
for /f "delims=0123456789" %%x in ("%SB%") do set "_dok=0"
if not defined SB set "_dok=0"
if "%_dok%"=="0" set "SB=0"
exit /b 0

:digitsC
set "_dok=1"
for /f "delims=0123456789" %%x in ("%SC%") do set "_dok=0"
if not defined SC set "_dok=0"
if "%_dok%"=="0" set "SC=0"
exit /b 0

rem 比较包版本(SA/SB/SC)与已装版本(%~1) → CMP = LT / EQ / GT / OLDUNKNOWN
:cmpver
set "CMP=?"
set "BV=%~1"
if not defined BV exit /b 0
if /i "%BV%"=="未知" set "CMP=OLDUNKNOWN" & exit /b 0
set "BA=0"
set "BB=0"
set "BC=0"
set "_bext="
for /f "tokens=1,2,3 delims=." %%a in ("%BV%") do set "_bext=%%a/%%b/%%c"
if defined _bext for /f "tokens=1,2,3 delims=/" %%a in ("%_bext%") do set "_ba=%%a"& set "_bb=%%b"& set "_bc=%%c"
if defined _ba set "BA=%_ba%"
if defined _bb set "BB=%_bb%"
if defined _bc set "BC=%_bc%"
set "BA=%BA:v=%"
set "BA=%BA:V=%"
call :digitsBA
call :digitsBB
call :digitsBC
if %SA% GTR %BA% goto :cmpgt
if %SA% LSS %BA% goto :cmplt
if %SB% GTR %BB% goto :cmpgt
if %SB% LSS %BB% goto :cmplt
if %SC% GTR %BC% goto :cmpgt
if %SC% LSS %BC% goto :cmplt
set "CMP=EQ"
exit /b 0
:cmpgt
set "CMP=GT"
exit /b 0
:cmplt
set "CMP=LT"
exit /b 0

:digitsBA
set "_dok=1"
for /f "delims=0123456789" %%x in ("%BA%") do set "_dok=0"
if not defined BA set "_dok=0"
if "%_dok%"=="0" set "BA=0"
exit /b 0

:digitsBB
set "_dok=1"
for /f "delims=0123456789" %%x in ("%BB%") do set "_dok=0"
if not defined BB set "_dok=0"
if "%_dok%"=="0" set "BB=0"
exit /b 0

:digitsBC
set "_dok=1"
for /f "delims=0123456789" %%x in ("%BC%") do set "_dok=0"
if not defined BC set "_dok=0"
if "%_dok%"=="0" set "BC=0"
exit /b 0

rem 检测 WebView2(注册表 → 固定目录兜底)
:checkwv
set "WVFOUND="
set "WVVER="
for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients" /s /v pv 2^>nul') do call :takewv "%%b"
for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients" /s /v pv 2^>nul') do call :takewv "%%b"
for /f "tokens=2,*" %%a in ('reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients" /s /v pv 2^>nul') do call :takewv "%%b"
if not defined WVFOUND if exist "%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application\msedgewebview2.exe" set "WVFOUND=1"
if not defined WVFOUND for /d %%d in ("%ProgramFiles(x86)%\Microsoft\EdgeWebView\Application\*") do if not defined WVFOUND set "WVFOUND=1" & set "WVVER=%%~nxd"
if not defined WVFOUND for /d %%d in ("%ProgramFiles%\Microsoft\EdgeWebView\Application\*") do if not defined WVFOUND set "WVFOUND=1" & set "WVVER=%%~nxd"
if defined WVFOUND if not defined WVVER set "WVVER=未知版本"
exit /b 0

:takewv
if defined WVFOUND exit /b 0
set "WVV=%~1"
set "WVV=%WVV:REG_SZ=%"
set "WVV=%WVV: =%"
if not defined WVV exit /b 0
set "WVFOUND=1"
set "WVVER=%WVV%"
exit /b 0

rem 把用户输入变成绝对路径(去掉引号, 展开 %VAR%, 支持拖入的目录)
:abs
set "ABS="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[Environment]::ExpandEnvironmentVariables('%~1').Trim()"`) do set "ABS=%%i"
if defined ABS if "%ABS:~-1%"=="\" set "ABS=%ABS:~0,-1%"
exit /b 0

rem 老安装(没有 VERSION.txt)的版本探测: 从图签栏 REV. 版次 里读
rem 注意: 这里不要用管道(|) —— cmd 会把 ^| 原样传给 PowerShell 导致语法错误。
:readrev
set "RV="
if not exist "%~1\game\breach.html" exit /b 0
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "$t=Get-Content -Raw -LiteralPath '%~1\game\breach.html'; $m=[regex]::Match($t, 'tb-v.>v[0-9][0-9.]*'); if($m.Success){$m.Value.Substring(6)}"`) do set "RV=%%v"
if defined RV set "INSTVER=%RV%"
exit /b 0

rem 安装 WebView2(优先静默: 只有管理员才静默得下来, 不行就弹官方安装界面)
:installwv
set "WVINST=%SRC%\MicrosoftEdgeWebView2RuntimeInstallerX86.exe"
if exist "%WVINST%" goto :wvpath
if not defined WVINST for %%f in ("%SRC%\..\MicrosoftEdgeWebView2RuntimeInstallerX86.exe") do if exist "%%~ff" set "WVINST=%%~ff"
if not defined WVINST for %%f in ("%SRC%\MicrosoftEdgeWebView2RuntimeInstallerX86.exe\..\MicrosoftEdgeWebView2RuntimeInstallerX86.exe") do if exist "%%~ff" set "WVINST=%%~ff"
if not defined WVINST for %%f in ("%SRC%\..\..\MicrosoftEdgeWebView2RuntimeInstallerX86.exe") do if exist "%%~ff" set "WVINST=%%~ff"
:wvpath
if exist "%WVINST%" goto :wvrun
echo        [提示] 包内没有 WebView2 离线安装器, 跳过。
echo               本游戏是纯本地网页, 用系统浏览器照样能玩; 若以后需要 WebView2,
echo               可到 Microsoft 官网下载 "Evergreen Standalone Installer" 安装。
exit /b 0
:wvrun
echo        正在静默安装(可能需要几十秒)...
start /wait "" "%WVINST%" /silent /install
call :checkwv
if defined WVFOUND goto :wvsuccess
echo        静默安装没有生效(通常是因为当前不是管理员)。
echo        改为打开官方安装界面, 请在弹出的窗口里点「安装」...
start /wait "" "%WVINST%"
call :checkwv
if defined WVFOUND goto :wvsuccess
echo        [提示] 仍未检测到 WebView2 —— 不阻断安装, 游戏照旧能用浏览器玩。
exit /b 0
:wvsuccess
echo        安装成功, WebView2 版本 %WVVER%
exit /b 0