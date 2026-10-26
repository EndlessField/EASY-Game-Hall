#requires -Version 5.1
<#
    游戏大厅 · 安装 / 升级程序
    版本 0.2

    功能：
      1. 检查安装包完整性；
      2. 选择安装目录（默认会询问，可直接输入 Z:\Root 这类完整路径），并检查已安装版本；
      3. 检查 WebView2 运行时，缺失时静默安装包内自带的离线安装器；
      4. 检查除 IE 以外的现代浏览器，缺失时安装包内自带的 360 极速浏览器；
      5. 复制文件、写注册表卸载项、创建桌面与开始菜单快捷方式。

    说明：
      - 默认会提示输入安装目录：直接回车 = 默认目录；直接输入完整路径 = 装到那里；
      - 默认目录：已安装则用它，否则 %LOCALAPPDATA%\Programs\游戏大厅（不需要管理员）；
      - -InstallDir 直接指定路径；-NoPrompt / -Quiet 不询问；-DryRun 不询问；
      - 加 -Machine 可安装到 %ProgramFiles%\游戏大厅（需要管理员）；
      - 升级时保留安装目录下的 _runtime（网页游戏存档）；
      - 本文件必须保存为 UTF-8 with BOM，否则 Windows PowerShell 5.1 会把中文读成乱码。
#>

[CmdletBinding()]
param(
    [string]$InstallDir,
    [switch]$Machine,
    [switch]$Force,
    [switch]$DryRun,
    [switch]$Quiet,
    [switch]$NoPrompt,
    [switch]$NoLaunch,
    [switch]$NoDesktopShortcut,
    [switch]$NoStartMenuShortcut,
    [switch]$SkipWebView2,
    [switch]$SkipBrowserCheck,
    [switch]$ContinueWithoutWebView2,
    [switch]$SimulateNoWebView2,
    [switch]$SimulateNoBrowser,
    [switch]$NoRegistry,
    [string]$LogPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:AppName = '游戏大厅'
$script:AppVersion = '0.2'
$script:QuietMode = [bool]$Quiet
$script:Warnings = 0

# ---------------------------------------------------------------------------
# 基础路径
# ---------------------------------------------------------------------------
$script:PackageRoot = $PSScriptRoot
$script:PayloadDir = Join-Path $script:PackageRoot 'payload'
$script:RedistDir = Join-Path $script:PackageRoot 'redist'
$script:ManifestPath = Join-Path $script:PackageRoot 'manifest.json'

# 版本号以包内 VERSION.txt 为准，找不到再退回脚本里的 0.2
$versionFile = Join-Path $script:PackageRoot 'VERSION.txt'
if (Test-Path -LiteralPath $versionFile) {
    try {
        $vline = Get-Content -LiteralPath $versionFile -Encoding UTF8 -TotalCount 1
        if ($vline -and $vline.Trim()) { $script:AppVersion = $vline.Trim() }
    } catch { }
}

# 日志：默认写到临时目录；不可写时退回安装包目录
if ([string]::IsNullOrWhiteSpace($LogPath)) {
    $LogPath = Join-Path $env:TEMP ("游戏大厅_安装日志_{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
}
try {
    [IO.File]::WriteAllText($LogPath, '', (New-Object System.Text.UTF8Encoding($true)))
} catch {
    $LogPath = Join-Path $script:PackageRoot ("安装日志_{0}.log" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
    [IO.File]::WriteAllText($LogPath, '', (New-Object System.Text.UTF8Encoding($true)))
}
$script:LogFilePath = $LogPath

# ---------------------------------------------------------------------------
# 输出与日志
# ---------------------------------------------------------------------------
function Write-Log {
    param(
        [string]$Message = '',
        [ValidateSet('INFO', 'OK', 'WARN', 'ERR', 'STEP', 'TITLE', 'DIM')][string]$Level = 'INFO'
    )
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts][$Level] $Message"
    try {
        [IO.File]::AppendAllText($script:LogFilePath, $line + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
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

function Write-Banner {
    Write-Log '============================================================' 'TITLE'
    Write-Log ("  游戏大厅 · 安装程序                      版本 " + $script:AppVersion) 'TITLE'
    Write-Log '  本地单机游戏合集 · 离线可玩' 'TITLE'
    Write-Log '============================================================' 'TITLE'
    Write-Log ''
}

function Write-WarningLine {
    param([string]$Message)
    $script:Warnings++
    Write-Log $Message 'WARN'
}

# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------
function Test-Admin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $p = New-Object Security.Principal.WindowsPrincipal($id)
        return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch { return $false }
}

function ConvertTo-NumericVersion {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    $m = [regex]::Match($Text, '\d+(?:\.\d+){0,3}')
    if (-not $m.Success) { return $null }
    $parts = $m.Value.Split('.')
    while ($parts.Count -lt 4) { $parts = @($parts) + '0' }
    try { return [version]($parts -join '.') } catch { return $null }
}

function Test-DirectoryWritable {
    param([string]$Dir)
    try {
        if (-not (Test-Path -LiteralPath $Dir)) {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        }
        $probe = Join-Path $Dir ('.write_test_' + [guid]::NewGuid().ToString('N') + '.tmp')
        [IO.File]::WriteAllText($probe, 'x')
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        return $true
    } catch { return $false }
}

function Get-DefaultInstallDir {
    if ($Machine) {
        return (Join-Path $env:ProgramFiles $script:AppName)
    }
    $local = [Environment]::GetFolderPath('LocalApplicationData')
    return (Join-Path $local ('Programs\' + $script:AppName))
}

function Resolve-InstallPath {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { throw '路径为空。' }
    $raw = $Text.Trim().Trim('"')
    try {
        $p = [Environment]::ExpandEnvironmentVariables($raw)
        $p = [IO.Path]::GetFullPath($p)
    } catch {
        throw ("路径无效：" + $Text + "（" + $_.Exception.Message + "）")
    }
    $p = $p.TrimEnd('\')
    if ($p -match '^[A-Za-z]:$') { throw "安装目录不能是盘符根目录：$p" }
    if ($p -match '(?i)^[A-Za-z]:\\Windows(\\|$)') { throw "安装目录不能是 Windows 系统目录：$p" }
    return $p
}

function Read-InstallPath {
    param([string]$DefaultPath, [string]$Note)
    Write-Log ''
    Write-Log '  可以直接输入安装路径，例如 Z:\Root 或 G:\Fire\fontawesome-free-7.3.1-web；直接回车使用默认值。' 'INFO'
    if ($Note) { Write-Log ("  " + $Note) 'DIM' }
    Write-Log ("  默认目录：" + $DefaultPath) 'DIM'
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        Write-Host '  安装到: ' -NoNewline
        $line = $null
        try { $line = [Console]::ReadLine() } catch { $line = $null }
        if ($null -eq $line) { break }
        Write-Host ''
        $line = $line.Trim()
        if ($line -eq '') { return $DefaultPath }
        $line = $line.Trim('"')
        try {
            $resolved = Resolve-InstallPath $line
            Write-Log ("  已选择：" + $resolved) 'INFO'
            return $resolved
        } catch {
            Write-Log ("  [!!] " + $_.Exception.Message + "，请重新输入。") 'WARN'
        }
    }
    Write-Log '  没有输入有效路径，使用默认目录。' 'WARN'
    return $DefaultPath
}

# ---------------------------------------------------------------------------
# WebView2
# ---------------------------------------------------------------------------
function Get-WebView2Info {
    $guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    $regPaths = @(
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid",
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid",
        "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$guid"
    )
    foreach ($rp in $regPaths) {
        try {
            if (Test-Path -LiteralPath $rp) {
                $pv = (Get-ItemProperty -LiteralPath $rp -ErrorAction Stop).pv
                if (-not [string]::IsNullOrWhiteSpace($pv)) {
                    $v = ConvertTo-NumericVersion $pv
                    if ($v -and $v -gt [version]'0.0.0.0') {
                        return [pscustomobject]@{ Found = $true; Version = $pv; Source = $rp }
                    }
                }
            }
        } catch { }
    }

    $dirs = @()
    if (${env:ProgramFiles(x86)}) { $dirs += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application') }
    if ($env:ProgramFiles) { $dirs += (Join-Path $env:ProgramFiles 'Microsoft\EdgeWebView\Application') }
    foreach ($d in $dirs) {
        if (-not (Test-Path -LiteralPath $d)) { continue }
        $subs = Get-ChildItem -LiteralPath $d -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
        foreach ($s in $subs) {
            if (Test-Path -LiteralPath (Join-Path $s.FullName 'msedgewebview2.exe')) {
                return [pscustomobject]@{ Found = $true; Version = $s.Name; Source = $s.FullName }
            }
        }
    }
    return [pscustomobject]@{ Found = $false; Version = $null; Source = $null }
}

function Install-WebView2Runtime {
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'X64' } else { 'X86' }
    $installer = Join-Path $script:RedistDir "MicrosoftEdgeWebView2RuntimeInstaller$arch.exe"
    if (-not (Test-Path -LiteralPath $installer)) {
        Write-Log "  [!!] 缺少 WebView2 离线安装器：$installer" 'ERR'
        return (Get-WebView2Info)
    }

    $tmp = Join-Path $env:TEMP ("WebView2RuntimeInstaller{0}_{1}.exe" -f $arch, [guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $installer -Destination $tmp -Force
    try {
        Write-Log "  正在静默安装 WebView2（$arch，可能需要 1-2 分钟）..." 'INFO'
        $p = Start-Process -FilePath $tmp -ArgumentList @('/silent', '/install') -PassThru -WindowStyle Hidden
        $exited = $p.WaitForExit(900000)
        if (-not $exited) {
            Write-Log '  [!!] WebView2 安装器 15 分钟仍未结束。' 'WARN'
        }
        for ($i = 0; $i -lt 12; $i++) {
            $info = Get-WebView2Info
            if ($info.Found) { return $info }
            Start-Sleep -Seconds 5
        }

        if (-not (Test-Admin)) {
            Write-Log '  当前不是管理员，尝试提升权限安装（会弹出 UAC）...' 'WARN'
            try {
                $p2 = Start-Process -FilePath $tmp -ArgumentList @('/silent', '/install') -Verb RunAs -PassThru -WindowStyle Hidden
                $null = $p2.WaitForExit(900000)
            } catch {
                Write-Log ("  [!!] 提升权限失败：" + $_.Exception.Message) 'WARN'
            }
            for ($i = 0; $i -lt 12; $i++) {
                $info = Get-WebView2Info
                if ($info.Found) { return $info }
                Start-Sleep -Seconds 5
            }
        }
        return (Get-WebView2Info)
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# 现代浏览器检测（排除 IE）
# ---------------------------------------------------------------------------
function Get-ExecutableFromCommand {
    param([string]$Command)
    if ([string]::IsNullOrWhiteSpace($Command)) { return $null }
    $c = $Command.Trim()
    if ($c.StartsWith('"')) {
        $end = $c.IndexOf('"', 1)
        if ($end -gt 1) { return $c.Substring(1, $end - 1) }
    }
    $idx = $c.IndexOf(' ')
    if ($idx -gt 0) { return $c.Substring(0, $idx) }
    return $c
}

function Get-ModernBrowsers {
    $found = @{}

    $regRoots = @(
        'HKLM:\SOFTWARE\Clients\StartMenuInternet',
        'HKLM:\SOFTWARE\WOW6432Node\Clients\StartMenuInternet',
        'HKCU:\SOFTWARE\Clients\StartMenuInternet'
    )
    foreach ($root in $regRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($key in (Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)) {
            $cmd = $null
            try {
                $cmdKey = (Get-Item -LiteralPath $key.PSPath -ErrorAction Stop).OpenSubKey('shell\open\command')
                if ($cmdKey) {
                    $cmd = $cmdKey.GetValue('')
                    $cmdKey.Close()
                }
            } catch { }
            $exe = Get-ExecutableFromCommand $cmd
            if (-not $exe) { continue }
            if (-not (Test-Path -LiteralPath $exe)) { continue }
            $leaf = [IO.Path]::GetFileName($exe).ToLowerInvariant()
            if ($leaf -eq 'iexplore.exe' -or $leaf -eq 'msedgewebview2.exe') { continue }
            $display = $key.PSChildName
            try {
                $default = (Get-Item -LiteralPath $key.PSPath -ErrorAction Stop).GetValue('')
                if ($default) { $display = $default }
            } catch { }
            $ver = ''
            try { $ver = (Get-Item -LiteralPath $exe -ErrorAction Stop).VersionInfo.FileVersion } catch { }
            $found[$exe.ToLowerInvariant()] = [pscustomobject]@{ Name = $display; Path = $exe; Version = $ver }
        }
    }

    $appPathsRoots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths'
    )
    $exeNames = @('msedge.exe', 'chrome.exe', 'firefox.exe', '360se.exe', '360chrome.exe', 'qqbrowser.exe', 'opera.exe', 'brave.exe', 'vivaldi.exe', 'sogouexplorer.exe', '2345explorer.exe', 'liebao.exe', 'maxthon.exe')
    foreach ($root in $appPathsRoots) {
        if (-not (Test-Path -LiteralPath $root)) { continue }
        foreach ($en in $exeNames) {
            $k = Join-Path $root $en
            if (-not (Test-Path -LiteralPath $k)) { continue }
            $exe = $null
            try { $exe = (Get-Item -LiteralPath $k -ErrorAction Stop).GetValue('') } catch { }
            if (-not $exe) { continue }
            if (-not (Test-Path -LiteralPath $exe)) { continue }
            $name = switch ($en.ToLowerInvariant()) {
                'msedge.exe'       { 'Microsoft Edge' }
                'chrome.exe'       { 'Google Chrome' }
                'firefox.exe'      { 'Mozilla Firefox' }
                '360se.exe'        { '360 安全浏览器' }
                '360chrome.exe'    { '360 极速浏览器' }
                'qqbrowser.exe'    { 'QQ 浏览器' }
                'opera.exe'        { 'Opera' }
                'brave.exe'        { 'Brave' }
                'vivaldi.exe'      { 'Vivaldi' }
                'sogouexplorer.exe'{ '搜狗浏览器' }
                '2345explorer.exe' { '2345 浏览器' }
                'liebao.exe'       { '猎豹浏览器' }
                'maxthon.exe'      { '傲游浏览器' }
                default            { $en }
            }
            $ver = ''
            try { $ver = (Get-Item -LiteralPath $exe -ErrorAction Stop).VersionInfo.FileVersion } catch { }
            $found[$exe.ToLowerInvariant()] = [pscustomobject]@{ Name = $name; Path = $exe; Version = $ver }
        }
    }

    $known = @()
    $pf = $env:ProgramFiles
    $pf86 = ${env:ProgramFiles(x86)}
    $lad = $env:LOCALAPPDATA
    if ($pf) {
        $known += @(
            (Join-Path $pf 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $pf 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $pf 'Mozilla Firefox\firefox.exe'),
            (Join-Path $pf '360\360Chrome\Chrome\Application\360chrome.exe'),
            (Join-Path $pf '360\360se6\Application\360se.exe')
        )
    }
    if ($pf86) {
        $known += @(
            (Join-Path $pf86 'Microsoft\Edge\Application\msedge.exe'),
            (Join-Path $pf86 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $pf86 'Mozilla Firefox\firefox.exe'),
            (Join-Path $pf86 '360\360Chrome\Chrome\Application\360chrome.exe'),
            (Join-Path $pf86 '360\360se6\Application\360se.exe')
        )
    }
    if ($lad) {
        $known += @(
            (Join-Path $lad 'Google\Chrome\Application\chrome.exe'),
            (Join-Path $lad '360Chrome\Chrome\Application\360chrome.exe'),
            (Join-Path $lad '360se6\Application\360se.exe')
        )
    }
    foreach ($exe in $known) {
        if (-not (Test-Path -LiteralPath $exe)) { continue }
        $leaf = [IO.Path]::GetFileName($exe).ToLowerInvariant()
        if ($leaf -eq 'iexplore.exe') { continue }
        $name = switch ($leaf) {
            'msedge.exe'    { 'Microsoft Edge' }
            'chrome.exe'    { 'Google Chrome' }
            'firefox.exe'   { 'Mozilla Firefox' }
            '360se.exe'     { '360 安全浏览器' }
            '360chrome.exe' { '360 极速浏览器' }
            default         { $leaf }
        }
        if (-not $found.ContainsKey($exe.ToLowerInvariant())) {
            $ver = ''
            try { $ver = (Get-Item -LiteralPath $exe -ErrorAction Stop).VersionInfo.FileVersion } catch { }
            $found[$exe.ToLowerInvariant()] = [pscustomobject]@{ Name = $name; Path = $exe; Version = $ver }
        }
    }

    return @($found.Values | Sort-Object Name)
}

function Install-BundledBrowser {
    $candidates = @(Get-ChildItem -LiteralPath $script:RedistDir -Filter '360cse_*.exe' -File -ErrorAction SilentlyContinue)
    if ($candidates.Count -eq 0) {
        Write-WarningLine '  [!!] 包内没有 360 极速浏览器安装器，跳过。'
        return $false
    }
    $installer = $candidates[0].FullName
    $tmp = Join-Path $env:TEMP ("360cse_{0}.exe" -f [guid]::NewGuid().ToString('N'))
    Copy-Item -LiteralPath $installer -Destination $tmp -Force
    try {
        $attempts = @('--silent-install', '/S', '/silent')
        foreach ($a in $attempts) {
            Write-Log "  尝试静默安装 360 极速浏览器（$a）..." 'INFO'
            try {
                $p = Start-Process -FilePath $tmp -ArgumentList $a -PassThru -WindowStyle Hidden
                $null = $p.WaitForExit(600000)
            } catch {
                Write-Log ("  [!!] 启动 360 安装器失败：" + $_.Exception.Message) 'WARN'
                continue
            }
            Start-Sleep -Seconds 3
            $browsers = @(Get-ModernBrowsers)
            if ($browsers.Count -gt 0) {
                Write-Log ("  [OK] 已检测到浏览器：" + $browsers[0].Name + ' ' + $browsers[0].Version) 'OK'
                return $true
            }
        }

        Write-Log '  [!!] 静默安装未成功，改为打开 360 安装界面，请按提示完成。' 'WARN'
        try {
            $p = Start-Process -FilePath $tmp -PassThru
            $null = $p.WaitForExit()
        } catch {
            Write-Log ("  [!!] 打开 360 安装界面失败：" + $_.Exception.Message) 'WARN'
        }
        $browsers = @(Get-ModernBrowsers)
        return ($browsers.Count -gt 0)
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# 已安装版本检测
# ---------------------------------------------------------------------------
function Get-HallVersionFromDir {
    param([string]$Dir)
    foreach ($name in @('install.json', 'version.json')) {
        $p = Join-Path $Dir $name
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try {
            $j = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8) | ConvertFrom-Json
            if ($j -and $j.version) { return [string]$j.version }
        } catch { }
    }
    $p = Join-Path $Dir 'VERSION.txt'
    if (Test-Path -LiteralPath $p) {
        try {
            $line = Get-Content -LiteralPath $p -Encoding UTF8 -TotalCount 1
            if ($line -and $line.Trim()) { return $line.Trim() }
        } catch { }
    }
    $p = Join-Path $Dir '游戏大厅.exe'
    if (Test-Path -LiteralPath $p) {
        try {
            $fv = (Get-Item -LiteralPath $p).VersionInfo.FileVersion
            if ($fv) { return $fv }
        } catch { }
    }
    return $null
}

function Get-HallAtPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) {
        return [pscustomobject]@{ Installed = $false; Path = $null; Version = $null }
    }
    $p = $Path
    try { $p = Resolve-InstallPath $Path } catch { }
    if (-not (Test-Path -LiteralPath (Join-Path $p '游戏大厅.exe'))) {
        return [pscustomobject]@{ Installed = $false; Path = $p; Version = $null }
    }
    $v = Get-HallVersionFromDir $p
    return [pscustomobject]@{ Installed = $true; Path = $p; Version = $v }
}

function Add-HallCandidate {
    param($List, [string]$Path, [string]$Version, [string]$Source)
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    try {
        $p = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
        $p = [IO.Path]::GetFullPath($p).TrimEnd('\')
    } catch { return }
    foreach ($item in $List) {
        if ($item.Path -ieq $p) { return }
    }
    [void]$List.Add([pscustomobject]@{ Path = $p; Version = $Version; Source = $Source })
}

function Get-InstalledHall {
    $candidates = New-Object System.Collections.ArrayList

    # 指定了 -InstallDir 时，把它也当作候选（便于反复安装到同一目录 / 便携测试）
    if ($InstallDir) {
        $p = [Environment]::ExpandEnvironmentVariables($InstallDir.Trim().Trim('"'))
        Add-HallCandidate $candidates $p $null '命令行 -InstallDir'
    }

    foreach ($kp in @('HKCU:\Software\游戏大厅', 'HKLM:\Software\游戏大厅', 'HKLM:\Software\WOW6432Node\游戏大厅')) {
        if (-not (Test-Path -LiteralPath $kp)) { continue }
        try {
            $props = Get-ItemProperty -LiteralPath $kp -ErrorAction Stop
            Add-HallCandidate $candidates $props.InstallPath $props.Version $kp
        } catch { }
    }

    $uninstallRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($ur in $uninstallRoots) {
        if (-not (Test-Path -LiteralPath $ur)) { continue }
        foreach ($k in (Get-ChildItem -LiteralPath $ur -ErrorAction SilentlyContinue)) {
            try {
                $props = Get-ItemProperty -LiteralPath $k.PSPath -ErrorAction Stop
            } catch { continue }
            if ($props.DisplayName -eq $script:AppName -or $k.PSChildName -eq $script:AppName) {
                Add-HallCandidate $candidates $props.InstallLocation $props.DisplayVersion $k.PSPath
            }
        }
    }

    $defaults = @()
    $defaults += (Join-Path $env:LOCALAPPDATA ('Programs\' + $script:AppName))
    $defaults += (Join-Path $env:LOCALAPPDATA $script:AppName)
    if ($env:ProgramFiles) { $defaults += (Join-Path $env:ProgramFiles $script:AppName) }
    if (${env:ProgramFiles(x86)}) { $defaults += (Join-Path ${env:ProgramFiles(x86)} $script:AppName) }
    foreach ($d in $defaults) { Add-HallCandidate $candidates $d $null '默认目录' }

    $valid = @()
    foreach ($c in $candidates) {
        if (-not (Test-Path -LiteralPath (Join-Path $c.Path '游戏大厅.exe'))) { continue }
        $ver = $c.Version
        if ([string]::IsNullOrWhiteSpace($ver)) { $ver = Get-HallVersionFromDir $c.Path }
        $valid += [pscustomobject]@{ Path = $c.Path; Version = $ver; Source = $c.Source }
    }
    if ($valid.Count -eq 0) {
        return [pscustomobject]@{ Installed = $false; Path = $null; Version = $null; Source = $null }
    }

    $sorted = $valid | Sort-Object -Property @{ Expression = { $v = ConvertTo-NumericVersion $_.Version; if ($v) { $v } else { [version]'0.0.0.0' } }; Descending = $true }, @{ Expression = { $_.Path }; Descending = $false }
    $best = @($sorted)[0]
    return [pscustomobject]@{ Installed = $true; Path = $best.Path; Version = $best.Version; Source = $best.Source }
}

# ---------------------------------------------------------------------------
# 安装包清单 / 完整性
# ---------------------------------------------------------------------------
function Read-PackageManifest {
    if (-not (Test-Path -LiteralPath $script:ManifestPath)) { return $null }
    try {
        return ([IO.File]::ReadAllText($script:ManifestPath, [Text.Encoding]::UTF8) | ConvertFrom-Json)
    } catch {
        Write-Log ("  [!!] manifest.json 解析失败：" + $_.Exception.Message) 'WARN'
        return $null
    }
}

function Test-PayloadIntegrity {
    param([string]$Dir, $Manifest)
    $result = [pscustomobject]@{ Ok = $false; Missing = @(); Changed = @(); Checked = 0 }
    if (-not $Manifest -or -not $Manifest.payload) {
        $result.Ok = (Test-Path -LiteralPath (Join-Path $Dir '游戏大厅.exe')) -and (Test-Path -LiteralPath (Join-Path $Dir 'games.json'))
        return $result
    }
    $missing = New-Object System.Collections.ArrayList
    $changed = New-Object System.Collections.ArrayList
    foreach ($f in @($Manifest.payload)) {
        $rel = [string]$f.path
        $target = Join-Path $Dir ($rel -replace '/', '\')
        if (-not (Test-Path -LiteralPath $target)) {
            [void]$missing.Add($rel)
            continue
        }
        try {
            $h = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
            if ($h -ne [string]$f.sha256) { [void]$changed.Add($rel) }
        } catch { [void]$changed.Add($rel) }
        $result.Checked++
    }
    $result.Missing = @($missing)
    $result.Changed = @($changed)
    $result.Ok = ($result.Missing.Count -eq 0 -and $result.Changed.Count -eq 0)
    return $result
}

function Copy-PayloadToStaging {
    param([string]$SourceDir, [string]$StageDir, $Manifest)
    New-Item -ItemType Directory -Path $StageDir -Force | Out-Null
    if ($Manifest -and $Manifest.payload) {
        foreach ($f in @($Manifest.payload)) {
            $rel = [string]$f.path
            $src = Join-Path $SourceDir ($rel -replace '/', '\')
            $dst = Join-Path $StageDir ($rel -replace '/', '\')
            $parent = Split-Path -Parent $dst
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            Copy-Item -LiteralPath $src -Destination $dst -Force
            $h = (Get-FileHash -LiteralPath $dst -Algorithm SHA256).Hash
            if ($h -ne [string]$f.sha256) { throw "复制校验失败：$rel" }
        }
    } else {
        Copy-Item -Path (Join-Path $SourceDir '*') -Destination $StageDir -Recurse -Force
    }
}

function Install-HallFiles {
    param([string]$TargetDir, $Manifest)
    if (-not (Test-DirectoryWritable $TargetDir)) { throw "目录不可写：$TargetDir" }
    $stage = Join-Path $TargetDir ('.install_stage_' + [guid]::NewGuid().ToString('N'))
    try {
        Copy-PayloadToStaging -SourceDir $script:PayloadDir -StageDir $stage -Manifest $Manifest
        $files = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Force)
        foreach ($f in $files) {
            $rel = $f.FullName.Substring($stage.Length).TrimStart('\')
            $dst = Join-Path $TargetDir $rel
            $parent = Split-Path -Parent $dst
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
        }
        $bytes = ($files | Measure-Object -Property Length -Sum).Sum
        if ($null -eq $bytes) { $bytes = 0 }
        return [pscustomobject]@{ Count = $files.Count; Bytes = [int64]$bytes }
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

# ---------------------------------------------------------------------------
# 快捷方式 / 注册表 / 元数据
# ---------------------------------------------------------------------------
function New-ShortcutSafe {
    param([string]$ShortcutPath, [string]$TargetPath, [string]$WorkingDirectory, [string]$IconPath, [string]$Description)
    try {
        $parent = Split-Path -Parent $ShortcutPath
        if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        $wsh = New-Object -ComObject WScript.Shell
        $sc = $wsh.CreateShortcut($ShortcutPath)
        $sc.TargetPath = $TargetPath
        $sc.WorkingDirectory = $WorkingDirectory
        if ($IconPath) { $sc.IconLocation = "$IconPath,0" }
        if ($Description) { $sc.Description = $Description }
        $sc.Save()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sc)
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($wsh)
        return $true
    } catch {
        $script:Warnings++
        Write-Log ("  [!!] 创建快捷方式失败：" + $ShortcutPath + "（" + $_.Exception.Message + "）") 'WARN'
        return $false
    }
}

function Create-HallShortcuts {
    param([string]$TargetDir, [string]$Version, [string]$Scope)
    $exe = Join-Path $TargetDir '游戏大厅.exe'
    $icon = Join-Path $TargetDir 'photo.ico'
    if (-not (Test-Path -LiteralPath $icon)) { $icon = $exe }
    $desc = "游戏大厅 · 本地单机游戏合集 v$Version"

    if (-not $NoDesktopShortcut) {
        $desktop = if ($Scope -eq 'machine') { [Environment]::GetFolderPath('CommonDesktopDirectory') } else { [Environment]::GetFolderPath('Desktop') }
        if ($desktop) {
            $lnk = Join-Path $desktop '游戏大厅.lnk'
            if (New-ShortcutSafe -ShortcutPath $lnk -TargetPath $exe -WorkingDirectory $TargetDir -IconPath $icon -Description $desc) {
                Write-Log "  [OK] 桌面快捷方式：$lnk" 'OK'
            }
        }
    }

    if (-not $NoStartMenuShortcut) {
        $startRoot = if ($Scope -eq 'machine') { [Environment]::GetFolderPath('CommonStartMenu') } else { [Environment]::GetFolderPath('StartMenu') }
        if ($startRoot) {
            $lnk = Join-Path (Join-Path $startRoot 'Programs') '游戏大厅.lnk'
            if (New-ShortcutSafe -ShortcutPath $lnk -TargetPath $exe -WorkingDirectory $TargetDir -IconPath $icon -Description $desc) {
                Write-Log "  [OK] 开始菜单快捷方式：$lnk" 'OK'
            }
        }
    }
}

function Install-SupportFiles {
    param([string]$TargetDir)
    $installerDir = Join-Path $TargetDir '_installer'
    New-Item -ItemType Directory -Path $installerDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $script:PackageRoot 'uninstall.ps1') -Destination (Join-Path $installerDir 'uninstall.ps1') -Force
    # 旧版曾在 _installer 里放 .bat；运行中的 .bat 会锁住安装目录，升级时清掉，统一用安装根目录的可见脚本。
    foreach ($legacyName in @('卸载.bat', '卸载游戏大厅.bat')) {
        $legacy = Join-Path $installerDir $legacyName
        if (Test-Path -LiteralPath $legacy) { Remove-Item -LiteralPath $legacy -Force -ErrorAction SilentlyContinue }
    }
    $uninstallVisible = Join-Path $script:PackageRoot '卸载游戏大厅.bat'
    if (Test-Path -LiteralPath $uninstallVisible) {
        Copy-Item -LiteralPath $uninstallVisible -Destination (Join-Path $TargetDir '卸载游戏大厅.bat') -Force
    }
    if (Test-Path -LiteralPath $script:ManifestPath) {
        Copy-Item -LiteralPath $script:ManifestPath -Destination (Join-Path $installerDir 'manifest.json') -Force
    }
    if (Test-Path -LiteralPath (Join-Path $script:PackageRoot '安装说明.txt')) {
        Copy-Item -LiteralPath (Join-Path $script:PackageRoot '安装说明.txt') -Destination (Join-Path $TargetDir '安装说明.txt') -Force
    }
}

function Register-Hall {
    param([string]$TargetDir, [string]$Version, [string]$Scope)
    $exe = Join-Path $TargetDir '游戏大厅.exe'
    $icon = Join-Path $TargetDir 'photo.ico'
    if (-not (Test-Path -LiteralPath $icon)) { $icon = $exe }
    $appRoot = if ($Scope -eq 'machine') { 'HKLM:\Software\游戏大厅' } else { 'HKCU:\Software\游戏大厅' }
    New-Item -Path $appRoot -Force | Out-Null
    Set-ItemProperty -Path $appRoot -Name 'InstallPath' -Value $TargetDir
    Set-ItemProperty -Path $appRoot -Name 'Version' -Value $Version
    Set-ItemProperty -Path $appRoot -Name 'InstallDate' -Value (Get-Date -Format 'yyyyMMdd')
    Set-ItemProperty -Path $appRoot -Name 'Publisher' -Value $script:AppName

    $unRoot = if ($Scope -eq 'machine') { 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall' } else { 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' }
    $unKey = Join-Path $unRoot $script:AppName
    New-Item -Path $unKey -Force | Out-Null
    $uninstallScript = Join-Path $TargetDir '_installer\uninstall.ps1'
    $uninstall = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $uninstallScript
    $quietUninstall = 'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}" -Quiet' -f $uninstallScript

    Set-ItemProperty -Path $unKey -Name 'DisplayName' -Value $script:AppName
    Set-ItemProperty -Path $unKey -Name 'DisplayVersion' -Value $Version
    Set-ItemProperty -Path $unKey -Name 'Publisher' -Value $script:AppName
    Set-ItemProperty -Path $unKey -Name 'InstallLocation' -Value $TargetDir
    Set-ItemProperty -Path $unKey -Name 'DisplayIcon' -Value ("{0},0" -f $icon)
    Set-ItemProperty -Path $unKey -Name 'UninstallString' -Value $uninstall
    Set-ItemProperty -Path $unKey -Name 'QuietUninstallString' -Value $quietUninstall
    Set-ItemProperty -Path $unKey -Name 'NoModify' -Value 1 -Type DWord
    Set-ItemProperty -Path $unKey -Name 'NoRepair' -Value 1 -Type DWord
    Set-ItemProperty -Path $unKey -Name 'InstallDate' -Value (Get-Date -Format 'yyyyMMdd')
    try {
        $size = (Get-ChildItem -LiteralPath $TargetDir -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Set-ItemProperty -Path $unKey -Name 'EstimatedSize' -Value ([int]($size / 1KB)) -Type DWord
    } catch { }
}

function Write-InstallMetadata {
    param([string]$TargetDir, [string]$Version, [string]$Scope)
    $meta = [ordered]@{
        app             = $script:AppName
        version         = $Version
        installedAt     = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        installScope    = $Scope
        installPath     = $TargetDir
        installer       = '游戏大厅安装器 0.2'
        manifestSha256  = $script:ManifestSha256
    }
    $json = $meta | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText((Join-Path $TargetDir 'install.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
$exitCode = 0
$webViewWarning = $false

try {
    try { $Host.UI.RawUI.WindowTitle = "游戏大厅 v$($script:AppVersion) 安装程序" } catch { }
    Write-Banner
    Write-Log ("[环境] " + [Environment]::OSVersion.VersionString + " · PowerShell " + $PSVersionTable.PSVersion + " · " + $(if (Test-Admin) { '管理员' } else { '当前用户' })) 'DIM'
    Write-Log ("[日志] " + $script:LogFilePath) 'DIM'
    Write-Log ''

    # [1/5] 安装包
    Write-Log '[1/5] 检查安装包' 'STEP'
    if (-not (Test-Path -LiteralPath $script:PayloadDir)) { throw "安装包不完整：缺少 payload 目录（请完整解压后再运行）。" }
    $payloadExe = Join-Path $script:PayloadDir '游戏大厅.exe'
    $payloadGames = Join-Path $script:PayloadDir 'games.json'
    if (-not (Test-Path -LiteralPath $payloadExe)) { throw "安装包不完整：payload\游戏大厅.exe 不存在。" }
    if (-not (Test-Path -LiteralPath $payloadGames)) { throw "安装包不完整：payload\games.json 不存在。" }
    $manifest = Read-PackageManifest
    if ($manifest -and $manifest.version -and ([string]$manifest.version -ne $script:AppVersion)) {
        Write-Log ("  [!!] manifest.json 版本（" + $manifest.version + "）与 VERSION.txt（" + $script:AppVersion + "）不一致，以 VERSION.txt 为准。") 'WARN'
    }
    $script:ManifestSha256 = if (Test-Path -LiteralPath $script:ManifestPath) { (Get-FileHash -LiteralPath $script:ManifestPath -Algorithm SHA256).Hash } else { $null }
    $payloadCount = @(Get-ChildItem -LiteralPath $script:PayloadDir -Recurse -File -Force).Count
    Write-Log ("  [OK] 安装包版本 " + $script:AppVersion + "，payload " + $payloadCount + " 个文件") 'OK'
    Write-Log ''

    # [2/5] 选择安装目录 + 已安装版本
    Write-Log '[2/5] 选择安装目录 / 检查已安装版本' 'STEP'
    # 优先用注册表里记录的安装路径作为默认值；它比“扫描到的其它副本”更能代表上次安装的位置
    $registered = $null
    foreach ($kp in @('HKCU:\Software\游戏大厅', 'HKLM:\Software\游戏大厅', 'HKLM:\Software\WOW6432Node\游戏大厅')) {
        if (-not (Test-Path -LiteralPath $kp)) { continue }
        try {
            $rp = (Get-ItemProperty -LiteralPath $kp -ErrorAction Stop).InstallPath
            if ($rp) {
                $cand = Get-HallAtPath $rp
                if ($cand.Installed) { $registered = $cand; break }
            }
        } catch { }
    }
    $existing = if ($registered) { $registered } else { Get-InstalledHall }
    if ($existing.Installed) {
        $ev = if ($existing.Version) { $existing.Version } else { '版本未知' }
        Write-Log ("  本机已安装：" + $ev + "（" + $existing.Path + "）") 'INFO'
    } else {
        Write-Log '  本机未检测到已安装的游戏大厅。' 'INFO'
    }

    if ($Machine) {
        $defaultTarget = Get-DefaultInstallDir
    } elseif ($existing.Installed) {
        $defaultTarget = $existing.Path
    } else {
        $defaultTarget = Get-DefaultInstallDir
    }

    $targetDir = $defaultTarget
    if ($InstallDir) {
        $targetDir = Resolve-InstallPath $InstallDir
        Write-Log ("  使用 -InstallDir：" + $targetDir) 'INFO'
    } elseif ($NoPrompt -or $Quiet -or $DryRun) {
        Write-Log ("  使用默认目录：" + $targetDir) 'INFO'
    } else {
        $note = $null
        if ($existing.Installed) {
            $ev = if ($existing.Version) { $existing.Version } else { '版本未知' }
            if ($Machine) {
                $note = "本机已安装：" + $existing.Path + "（" + $ev + "）；-Machine 模式默认装到 Program Files。"
            } else {
                $note = "检测到已安装：" + $existing.Path + "（" + $ev + "），直接回车将升级这里。"
            }
        }
        $targetDir = Read-InstallPath -DefaultPath $defaultTarget -Note $note
    }

    $targetInstalled = Get-HallAtPath $targetDir
    $targetDir = $targetInstalled.Path
    if ($existing.Installed -and ($existing.Path -ine $targetDir)) {
        Write-Log ("  [..] 本机另有安装：" + $existing.Path + "；本次目标 " + $targetDir + "，旧安装不会被删除。") 'WARN'
    }
    if ($targetInstalled.Installed) {
        $tv = if ($targetInstalled.Version) { $targetInstalled.Version } else { '版本未知' }
        Write-Log ("  目标目录已有大厅：" + $tv) 'INFO'
    } else {
        Write-Log '  目标目录还没有大厅，将全新安装。' 'INFO'
    }

    $installed = $targetInstalled
    $oldVersionLabel = if ($installed.Version) { $installed.Version } else { '旧版' }
    $packageVer = ConvertTo-NumericVersion $script:AppVersion
    if (-not $packageVer) { throw "安装包版本号无效：$($script:AppVersion)" }

    $mode = 'install'
    $installedVer = $null
    if ($installed.Installed) {
        $installedVer = ConvertTo-NumericVersion $installed.Version
        $shownVersion = $oldVersionLabel

        if ($installedVer -and $installedVer -gt $packageVer) {
            if (-not $Force) {
                Write-Log ("  [!!] 已安装版本 " + $shownVersion + " 比安装包 " + $script:AppVersion + " 新；默认不降级。") 'WARN'
                Write-Log '       如确需降级，请运行：powershell -ExecutionPolicy Bypass -File install.ps1 -Force' 'DIM'
                Write-Log ''
                Write-Log '没有修改任何文件。' 'WARN'
                exit 3
            }
            Write-Log ("  [!!] 已安装版本 " + $shownVersion + " 比安装包 " + $script:AppVersion + " 新；已按 -Force 降级。") 'WARN'
            $mode = 'downgrade'
        } elseif ($installedVer -and $installedVer -eq $packageVer) {
            if ($Force) {
                Write-Log '  [..] 已指定 -Force，强制修复/重装相同版本。' 'INFO'
                $mode = 'repair'
            } else {
                $integrity = Test-PayloadIntegrity -Dir $installed.Path -Manifest $manifest
                if ($integrity.Ok) {
                    Write-Log '  [OK] 版本相同且文件完整，无需安装。' 'OK'
                    $mode = 'none'
                } else {
                    Write-Log ("  [..] 版本相同但文件缺失/损坏（缺失 " + $integrity.Missing.Count + " 个，变化 " + $integrity.Changed.Count + " 个），将修复安装。") 'WARN'
                    $mode = 'repair'
                }
            }
        } elseif ($installedVer -and $installedVer -lt $packageVer) {
            Write-Log ("  [..] 安装包较新：" + $shownVersion + " -> " + $script:AppVersion + "，将升级（保留 _runtime 存档）。") 'INFO'
            $mode = 'upgrade'
        } else {
            Write-Log '  [..] 已安装版本无法判断，将按升级处理。' 'WARN'
            $mode = 'upgrade'
        }
    }
    Write-Log ''

    # [3/5] WebView2
    Write-Log '[3/5] 检查 WebView2 运行时' 'STEP'
    $wv = if ($SimulateNoWebView2) {
        [pscustomobject]@{ Found = $false; Version = $null; Source = '模拟缺失' }
    } else {
        Get-WebView2Info
    }

    if ($wv.Found) {
        Write-Log ("  [OK] 已安装 WebView2 " + $wv.Version) 'OK'
    } elseif ($SkipWebView2) {
        Write-Log '  [!!] 已跳过 WebView2 检查（-SkipWebView2）。' 'WARN'
    } elseif ($DryRun) {
        Write-Log '  [..] 未检测到 WebView2；演练模式不实际安装。' 'INFO'
        Write-Log '       正式安装时会运行 redist\MicrosoftEdgeWebView2RuntimeInstallerX64.exe /silent /install' 'DIM'
    } else {
        Write-Log '  [..] 未检测到 WebView2，开始安装包内自带的离线安装器...' 'WARN'
        $wv = Install-WebView2Runtime
        if ($wv.Found) {
            Write-Log ("  [OK] WebView2 安装成功：" + $wv.Version) 'OK'
        } else {
            $webViewWarning = $true
            Write-WarningLine '  [!!] WebView2 安装失败，游戏大厅将无法启动。'
            Write-Log '       请手动运行 redist\MicrosoftEdgeWebView2RuntimeInstallerX64.exe（32 位系统用 X86）。' 'DIM'
            if (-not $ContinueWithoutWebView2) {
                throw '缺少 WebView2 运行时，安装已停止。安装好运行时后重新运行本程序即可。'
            }
            Write-WarningLine '  [!!] 已按 -ContinueWithoutWebView2 继续。'
        }
    }
    Write-Log ''

    # [4/5] 现代浏览器
    Write-Log '[4/5] 检查现代浏览器（已排除 IE）' 'STEP'
    $browsers = if ($SimulateNoBrowser) { @() } else { @(Get-ModernBrowsers) }
    if ($browsers.Count -gt 0) {
        $names = ($browsers | Select-Object -First 3 | ForEach-Object { if ($_.Version) { "$($_.Name) $($_.Version)" } else { $_.Name } }) -join '、'
        Write-Log ("  [OK] 已安装：" + $names) 'OK'
        if ($browsers.Count -gt 3) { Write-Log ("       另有 " + ($browsers.Count - 3) + " 个浏览器。") 'DIM' }
    } elseif ($SkipBrowserCheck) {
        Write-Log '  [!!] 已跳过浏览器检查（-SkipBrowserCheck）。' 'WARN'
    } elseif ($DryRun) {
        Write-Log '  [..] 未检测到现代浏览器；演练模式不实际安装 360 极速浏览器。' 'INFO'
        Write-Log '       正式安装时会运行 redist\360cse_23.0.1253.0.exe --silent-install' 'DIM'
    } else {
        Write-Log '  [..] 未检测到现代浏览器，开始安装包内自带的 360 极速浏览器...' 'WARN'
        $ok = Install-BundledBrowser
        if ($ok) {
            Write-Log '  [OK] 360 极速浏览器已安装。' 'OK'
        } else {
            Write-WarningLine '  [!!] 360 极速浏览器未能自动安装；游戏大厅仍可运行（它使用 WebView2），可稍后手动安装。'
        }
    }
    Write-Log ''

    # [5/5] 安装
    Write-Log '[5/5] 安装 / 更新' 'STEP'
    if ($DryRun) {
        Write-Log '  [..] 演练模式：不会复制文件、写注册表或创建快捷方式。' 'INFO'
        Write-Log ("  计划版本：" + $script:AppVersion + "；模式：" + $mode) 'DIM'
        Write-Log ("  计划目录：" + $targetDir) 'DIM'
        $exitCode = 0
    } else {
        $scope = if ($Machine) { 'machine' } else { 'user' }
        if ($Machine -and -not (Test-Admin)) {
            throw '使用 -Machine 安装到 Program Files 需要管理员权限。请右键「安装.bat」→ 以管理员身份运行，或使用默认的当前用户安装。'
        }

        Write-Log ("  目标目录：" + $targetDir) 'INFO'
        if (-not (Test-DirectoryWritable $targetDir)) {
            throw "目录不可写：$targetDir。请换一个目录，或以管理员身份运行。"
        }

        if ($mode -ne 'none') {
            $copyResult = Install-HallFiles -TargetDir $targetDir -Manifest $manifest
            Write-Log ("  [OK] 已复制 " + $copyResult.Count + " 个文件（" + [math]::Round($copyResult.Bytes / 1MB, 1) + " MB）") 'OK'
        } else {
            Write-Log '  [OK] 文件已是最新，跳过复制。' 'OK'
        }

        Install-SupportFiles -TargetDir $targetDir
        Write-InstallMetadata -TargetDir $targetDir -Version $script:AppVersion -Scope $scope
        if ($NoRegistry) {
            Write-Log '  [..] 已跳过注册表写入（-NoRegistry；便携/测试用）' 'WARN'
        } else {
            Register-Hall -TargetDir $targetDir -Version $script:AppVersion -Scope $scope
            Write-Log '  [OK] 已写入卸载信息（设置 → 应用 → 游戏大厅）' 'OK'
        }
        Create-HallShortcuts -TargetDir $targetDir -Version $script:AppVersion -Scope $scope

        if (-not (Test-Path -LiteralPath (Join-Path $targetDir '游戏大厅.exe'))) {
            throw "安装后校验失败：$targetDir\游戏大厅.exe 不存在。"
        }

        if (-not $NoLaunch -and -not $Quiet -and -not $webViewWarning) {
            try {
                Start-Process -FilePath (Join-Path $targetDir '游戏大厅.exe') -WorkingDirectory $targetDir
                Write-Log '  [OK] 已启动游戏大厅' 'OK'
            } catch {
                Write-Log ("  [!!] 启动失败：" + $_.Exception.Message) 'WARN'
            }
        }

        Write-Log ''
        Write-Log '============================================================' 'TITLE'
        if ($mode -eq 'none') {
            Write-Log ("  已是最新版本 " + $script:AppVersion + "，无需安装。") 'TITLE'
        } elseif ($mode -eq 'upgrade') {
            Write-Log ("  升级完成！" + $oldVersionLabel + " -> " + $script:AppVersion) 'TITLE'
        } elseif ($mode -eq 'downgrade') {
            Write-Log ("  安装完成（降级）！" + $oldVersionLabel + " -> " + $script:AppVersion) 'TITLE'
        } elseif ($mode -eq 'repair') {
            Write-Log ("  修复完成！版本 " + $script:AppVersion) 'TITLE'
        } else {
            Write-Log ("  安装完成！版本 " + $script:AppVersion) 'TITLE'
        }
        Write-Log ("  安装目录：" + $targetDir) 'TITLE'
        Write-Log '  双击桌面「游戏大厅」即可开始。' 'TITLE'
        Write-Log '  卸载：设置 → 应用 → 游戏大厅，或运行安装目录下 卸载游戏大厅.bat' 'TITLE'
        if ($webViewWarning) {
            Write-Log '  [!!] 注意：WebView2 尚未安装成功，游戏大厅暂时无法启动。' 'WARN'
        }
        Write-Log '============================================================' 'TITLE'
        Write-Log ("日志：" + $script:LogFilePath) 'DIM'
        $exitCode = if ($script:Warnings -gt 0) { 2 } else { 0 }
    }
} catch {
    Write-Log ''
    Write-Log ("[错误] " + $_.Exception.Message) 'ERR'
    Write-Log ("安装未完成。日志：" + $script:LogFilePath) 'ERR'
    $exitCode = 1
}

exit $exitCode
