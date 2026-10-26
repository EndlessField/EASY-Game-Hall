#requires -Version 5.1
<#
    游戏大厅 · 卸载程序
    版本 0.2

    - 默认保留网页游戏存档：把 _runtime 移到
      %LOCALAPPDATA%\游戏大厅_存档备份\<时间戳>\
    - -RemoveSaves 连存档一起删除
    - -Quiet 静默卸载（不提问、不输出）
    - -Force 跳过“目录里必须有游戏大厅.exe”的校验
    - -InstallDir <路径> 指定安装目录（可见的 卸载游戏大厅.bat 从 TEMP 调用时用）

    本文件必须保存为 UTF-8 with BOM。
#>

[CmdletBinding()]
param(
    [switch]$Quiet,
    [switch]$RemoveSaves,
    [switch]$KeepSaves,
    [switch]$Force,
    [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
$script:AppName = '游戏大厅'
$script:QuietMode = [bool]$Quiet
$script:ExitCode = 0

if ([string]::IsNullOrWhiteSpace($env:TEMP)) {
    $logDir = $PSScriptRoot
} else {
    $logDir = $env:TEMP
}
$script:LogFilePath = Join-Path $logDir ("游戏大厅_卸载日志_{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
try {
    [IO.File]::WriteAllText($script:LogFilePath, '', (New-Object System.Text.UTF8Encoding($true)))
} catch {
    $script:LogFilePath = Join-Path $PSScriptRoot ("卸载日志_{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
    [IO.File]::WriteAllText($script:LogFilePath, '', (New-Object System.Text.UTF8Encoding($true)))
}

function Write-Log {
    param([string]$Message, [ValidateSet('INFO', 'OK', 'WARN', 'ERR', 'STEP', 'TITLE', 'DIM')][string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    try {
        [IO.File]::AppendAllText($script:LogFilePath, "[$ts][$Level] $Message`r`n", (New-Object System.Text.UTF8Encoding($false)))
    } catch { }
    if ($script:QuietMode) { return }
    switch ($Level) {
        'OK'    { Write-Host $Message -ForegroundColor Green }
        'WARN'  { Write-Host $Message -ForegroundColor Yellow }
        'ERR'   { Write-Host $Message -ForegroundColor Red }
        'STEP'  { Write-Host $Message -ForegroundColor Cyan }
        'TITLE' { Write-Host $Message -ForegroundColor White }
        'DIM'   { Write-Host $Message -ForegroundColor DarkGray }
        default { Write-Host $Message }
    }
}

function Test-Admin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $p = New-Object Security.Principal.WindowsPrincipal($id)
        return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function Get-InstallDirFromRegistry {
    foreach ($kp in @('HKCU:\Software\游戏大厅', 'HKLM:\Software\游戏大厅', 'HKLM:\Software\WOW6432Node\游戏大厅')) {
        if (-not (Test-Path -LiteralPath $kp)) { continue }
        try {
            $p = (Get-ItemProperty -LiteralPath $kp -ErrorAction Stop).InstallPath
            if ($p -and (Test-Path -LiteralPath $p)) { return [IO.Path]::GetFullPath($p).TrimEnd('\') }
        } catch { }
    }
    $roots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅'
    )
    foreach ($k in $roots) {
        if (-not (Test-Path -LiteralPath $k)) { continue }
        try {
            $p = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).InstallLocation
            if ($p -and (Test-Path -LiteralPath $p)) { return [IO.Path]::GetFullPath($p).TrimEnd('\') }
        } catch { }
    }
    return $null
}

function Remove-ShortcutIfOurs {
    param([string]$ShortcutPath, [string]$InstallDir)
    if (-not (Test-Path -LiteralPath $ShortcutPath)) { return }
    $ours = $false
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($ShortcutPath)
        $target = $sc.TargetPath
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sc)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wsh)
        if ($target -and ([IO.Path]::GetFullPath($target).TrimEnd('\') -ieq ([IO.Path]::GetFullPath((Join-Path $InstallDir '游戏大厅.exe')).TrimEnd('\')))) {
            $ours = $true
        }
    } catch {
        $ours = $false
    }
    if ($ours) {
        try {
            Remove-Item -LiteralPath $ShortcutPath -Force
            Write-Log ("  [OK] 已删除快捷方式：" + $ShortcutPath) 'OK'
        } catch {
            Write-Log ("  [!!] 删除快捷方式失败：" + $ShortcutPath + "（" + $_.Exception.Message + "）") 'WARN'
        }
    }
}

Write-Log '============================================================' 'TITLE'
Write-Log '  游戏大厅 · 卸载程序' 'TITLE'
Write-Log '============================================================' 'TITLE'
Write-Log ''

try {
    if ($InstallDir) {
        $installDir = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($InstallDir.Trim().Trim('"'))).TrimEnd('\')
    } else {
        $installDir = $null

        # 优先用本脚本所在位置（安装目录\_installer），避免注册表被改坏时找不到
        $parent = Split-Path -Parent $PSScriptRoot
        if ((Split-Path -Leaf $PSScriptRoot) -eq '_installer' -and (Test-Path -LiteralPath (Join-Path $parent '游戏大厅.exe'))) {
            $installDir = [IO.Path]::GetFullPath($parent).TrimEnd('\')
        }
        if (-not $installDir) { $installDir = Get-InstallDirFromRegistry }
        if (-not $installDir) {
            $defaults = @(
                (Join-Path $env:LOCALAPPDATA 'Programs\游戏大厅'),
                (Join-Path $env:LOCALAPPDATA '游戏大厅'),
                (Join-Path $env:ProgramFiles '游戏大厅')
            )
            if (${env:ProgramFiles(x86)}) { $defaults += (Join-Path ${env:ProgramFiles(x86)} '游戏大厅') }
            foreach ($d in $defaults) {
                if (Test-Path -LiteralPath (Join-Path $d '游戏大厅.exe')) { $installDir = [IO.Path]::GetFullPath($d).TrimEnd('\'); break }
            }
        }
    }

    if (-not $installDir) {
        Write-Log '没有找到已安装的「游戏大厅」。' 'WARN'
        Write-Log '如果它装在自定义目录，请直接删除该目录，并删除桌面的「游戏大厅」快捷方式。' 'DIM'
        exit 1
    }

    if ($installDir -match '^[A-Za-z]:\\?$' -or $installDir -match '(?i)\\Windows(\\|$)') {
        throw "拒绝操作可疑目录：$installDir"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $installDir '游戏大厅.exe')) -and -not $Force) {
        throw "目录里没有 游戏大厅.exe，已停止：$installDir"
    }

    $version = '未知'
    foreach ($f in @('install.json', 'version.json', 'VERSION.txt')) {
        $p = Join-Path $installDir $f
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try {
            if ($f -eq 'VERSION.txt') {
                $line = Get-Content -LiteralPath $p -Encoding UTF8 -TotalCount 1
                if ($line -and $line.Trim()) { $version = $line.Trim(); break }
            } else {
                $j = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json
                if ($j -and $j.version) { $version = [string]$j.version; break }
            }
        } catch { }
    }

    Write-Log ("安装目录：" + $installDir) 'INFO'
    Write-Log ("当前版本：" + $version) 'INFO'
    Write-Log ''

    if (-not $Quiet) {
        $answer = Read-Host '确定卸载「游戏大厅」吗？[Y/N]'
        if ($answer -notmatch '^(?i)y') {
            Write-Log '已取消，没有修改任何文件。' 'WARN'
            exit 4
        }
    }

    # 结束正在运行的大厅
    $running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -and ([IO.Path]::GetFullPath($_.Path).TrimEnd('\') -ieq ([IO.Path]::GetFullPath((Join-Path $installDir '游戏大厅.exe')).TrimEnd('\'))) } catch { $false }
    })
    if ($running.Count -gt 0) {
        Write-Log '正在结束「游戏大厅」进程...' 'INFO'
        foreach ($proc in $running) {
            try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop; Write-Log ("  [OK] 已结束进程 " + $proc.Id) 'OK' }
            catch { Write-Log ("  [!!] 结束进程失败：" + $_.Exception.Message) 'WARN' }
        }
        Start-Sleep -Seconds 2
    }

    # 存档
    $runtime = Join-Path $installDir '_runtime'
    $keep = $true
    if ($RemoveSaves) { $keep = $false }
    elseif ($KeepSaves) { $keep = $true }
    elseif (-not $Quiet) {
        $ans = Read-Host '保留网页游戏存档（_runtime）吗？[Y/n]'
        if ($ans -match '^(?i)n') { $keep = $false }
    }
    if ($keep -and (Test-Path -LiteralPath $runtime)) {
        $backupRoot = Join-Path $env:LOCALAPPDATA ('游戏大厅_存档备份\' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
        try {
            New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
            Move-Item -LiteralPath $runtime -Destination $backupRoot -Force
            Write-Log ("  [OK] 存档已备份到：" + (Join-Path $backupRoot '_runtime')) 'OK'
        } catch {
            Write-Log ("  [!!] 移动存档失败，改为复制：" + $_.Exception.Message) 'WARN'
            try {
                Copy-Item -LiteralPath $runtime -Destination $backupRoot -Recurse -Force
                Write-Log ("  [OK] 存档已复制到：" + (Join-Path $backupRoot '_runtime')) 'OK'
            } catch {
                Write-Log ("  [!!] 存档备份失败：" + $_.Exception.Message) 'WARN'
                if ($Quiet) {
                    Write-Log '  [!!] 静默模式无法确认，已停止；安装目录未删除。' 'ERR'
                    exit 1
                }
                $ans = Read-Host '存档备份失败。仍要继续删除安装目录吗？[y/N]'
                if ($ans -notmatch '^(?i)y') { Write-Log '已取消。' 'WARN'; exit 4 }
            }
        }
    } elseif (-not $keep) {
        Write-Log '按 -RemoveSaves 删除存档。' 'INFO'
    }

    # 快捷方式
    $desktopUser = [Environment]::GetFolderPath('Desktop')
    $desktopCommon = [Environment]::GetFolderPath('CommonDesktopDirectory')
    if ($desktopUser) { Remove-ShortcutIfOurs -ShortcutPath (Join-Path $desktopUser '游戏大厅.lnk') -InstallDir $installDir }
    if ($desktopCommon) { Remove-ShortcutIfOurs -ShortcutPath (Join-Path $desktopCommon '游戏大厅.lnk') -InstallDir $installDir }
    $startUser = [Environment]::GetFolderPath('StartMenu')
    $startCommon = [Environment]::GetFolderPath('CommonStartMenu')
    if ($startUser) { Remove-ShortcutIfOurs -ShortcutPath (Join-Path (Join-Path $startUser 'Programs') '游戏大厅.lnk') -InstallDir $installDir }
    if ($startCommon) { Remove-ShortcutIfOurs -ShortcutPath (Join-Path (Join-Path $startCommon 'Programs') '游戏大厅.lnk') -InstallDir $installDir }

    # 注册表：只删除指向当前安装目录的项，避免把另一份安装的注册信息也删掉
    $regTargets = @(
        @{ Key = 'HKCU:\Software\游戏大厅'; Value = 'InstallPath' },
        @{ Key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅'; Value = 'InstallLocation' },
        @{ Key = 'HKLM:\Software\游戏大厅'; Value = 'InstallPath' },
        @{ Key = 'HKLM:\Software\WOW6432Node\游戏大厅'; Value = 'InstallPath' },
        @{ Key = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅'; Value = 'InstallLocation' },
        @{ Key = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\游戏大厅'; Value = 'InstallLocation' }
    )
    foreach ($item in $regTargets) {
        $k = $item.Key
        if (-not (Test-Path -LiteralPath $k)) { continue }
        $isOurs = $false
        try {
            $v = (Get-ItemProperty -LiteralPath $k -ErrorAction Stop).($item.Value)
            if ($v) {
                $v = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($v.Trim().Trim('"'))).TrimEnd('\')
                $isOurs = ($v -ieq $installDir)
            }
        } catch { }
        if (-not $isOurs) {
            Write-Log ("  [..] 保留注册表项（指向其它安装）：" + $k) 'DIM'
            continue
        }
        if ($k -like 'HKLM:*' -and -not (Test-Admin)) {
            Write-Log ("  [!!] 需要管理员权限才能删除：" + $k) 'WARN'
            continue
        }
        try {
            Remove-Item -LiteralPath $k -Recurse -Force
            Write-Log ("  [OK] 已删除注册表项：" + $k) 'OK'
        } catch {
            Write-Log ("  [!!] 删除注册表项失败：" + $k + "（" + $_.Exception.Message + "）") 'WARN'
        }
    }

    # 删除安装目录
    Write-Log '正在删除安装目录...' 'INFO'
    $deleted = $false
    for ($i = 1; $i -le 3; $i++) {
        try {
            Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction Stop
            $deleted = $true
            break
        } catch {
            Write-Log ("  [..] 第 " + $i + " 次删除失败：" + $_.Exception.Message) 'WARN'
            Start-Sleep -Seconds 2
        }
    }
    if ($deleted) {
        Write-Log ("  [OK] 已删除：" + $installDir) 'OK'
    } else {
        Write-Log ("  [!!] 安装目录未能完全删除，请手动删除：" + $installDir) 'WARN'
        $script:ExitCode = 2
    }

    Write-Log ''
    Write-Log '============================================================' 'TITLE'
    Write-Log '  卸载完成。' 'TITLE'
    if ($keep) { Write-Log ("  存档备份：" + (Join-Path $env:LOCALAPPDATA '游戏大厅_存档备份')) 'TITLE' }
    Write-Log ("  日志：" + $script:LogFilePath) 'DIM'
    Write-Log '============================================================' 'TITLE'
} catch {
    Write-Log ''
    Write-Log ("[错误] " + $_.Exception.Message) 'ERR'
    Write-Log ("卸载未完成。日志：" + $script:LogFilePath) 'ERR'
    $script:ExitCode = 1
}

exit $script:ExitCode
