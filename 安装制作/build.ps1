#requires -Version 5.1
<#
    游戏大厅 · 安装包制作脚本
    版本 0.2

    用法：
      powershell -ExecutionPolicy Bypass -File build.ps1
      powershell -ExecutionPolicy Bypass -File build.ps1 -Version 0.2 -NoZip
      powershell -ExecutionPolicy Bypass -File build.ps1 -SkipRedistCheck

    产物：
      发布\游戏大厅_v0.2_安装包\          （可直接双击 安装.bat）
      发布\游戏大厅_v0.2_安装包.zip       （完整离线包）
      发布\SHA256SUMS.txt

    本文件必须保存为 UTF-8 with BOM。
#>

[CmdletBinding()]
param(
    [string]$Version = '0.2',
    [switch]$NoZip,
    [switch]$KeepStage,
    [switch]$SkipRedistCheck
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if ($Version -notmatch '^\d+(\.\d+){0,3}$') {
    throw "版本号格式无效：$Version（示例：0.1）"
}

$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:ScriptSrc = Join-Path $PSScriptRoot '脚本'
$script:RedistSrc = Join-Path $PSScriptRoot 'redist'
$script:PayloadSrc = Join-Path $script:ProjectRoot 'Root'
$script:ReleaseRoot = Join-Path $script:ProjectRoot '发布'
$script:StageName = "游戏大厅_v${Version}_安装包"
$script:Stage = Join-Path $script:ReleaseRoot $script:StageName
$script:ZipPath = Join-Path $script:ReleaseRoot ($script:StageName + '.zip')
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:Utf8Bom = New-Object System.Text.UTF8Encoding($true)

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host ('[制作] ' + $Message) -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host ('  [OK] ' + $Message) -ForegroundColor Green
}

function Write-Note {
    param([string]$Message)
    Write-Host ('       ' + $Message) -ForegroundColor DarkGray
}

function Get-RelativePath {
    param([string]$Base, [string]$Full)
    $b = [IO.Path]::GetFullPath($Base).TrimEnd('\') + '\'
    $f = [IO.Path]::GetFullPath($Full)
    if (-not $f.StartsWith($b, [StringComparison]::OrdinalIgnoreCase)) {
        throw "路径不在预期目录内：$Full"
    }
    return $f.Substring($b.Length).Replace('\', '/')
}

function New-ZipFromDirectory {
    param([string]$SourceDir, [string]$ZipPath)
    Add-Type -AssemblyName System.IO.Compression | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
    $base = [IO.Path]::GetFullPath($SourceDir).TrimEnd('\') + '\'
    $zipStream = [IO.File]::Open($ZipPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false, [Text.Encoding]::UTF8)
        try {
            $files = @(Get-ChildItem -LiteralPath $SourceDir -Recurse -File -Force | Sort-Object FullName)
            foreach ($f in $files) {
                $rel = $f.FullName.Substring($base.Length).Replace('\', '/')
                $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Fastest)
                $entryStream = $entry.Open()
                try {
                    $fileStream = [IO.File]::OpenRead($f.FullName)
                    try { $fileStream.CopyTo($entryStream) } finally { $fileStream.Dispose() }
                } finally {
                    $entryStream.Dispose()
                }
            }
        } finally {
            $archive.Dispose()
        }
    } finally {
        $zipStream.Dispose()
    }
}

function Add-ManifestFiles {
    param([string]$BaseDir, [string]$Prefix, $List)
    $files = @(Get-ChildItem -LiteralPath $BaseDir -Recurse -File -Force | Sort-Object FullName)
    foreach ($f in $files) {
        $rel = Get-RelativePath -Base $BaseDir -Full $f.FullName
        $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash
        [void]$List.Add([ordered]@{
            path   = if ($Prefix) { "$Prefix/$rel" } else { $rel }
            size   = $f.Length
            sha256 = $h
        })
    }
}

# ---------------------------------------------------------------------------
# 校验
# ---------------------------------------------------------------------------
Write-Step "检查源目录（版本 $Version）"
foreach ($p in @($script:PayloadSrc, (Join-Path $script:PayloadSrc 'game'), (Join-Path $script:PayloadSrc '游戏大厅.exe'), (Join-Path $script:PayloadSrc 'games.json'))) {
    if (-not (Test-Path -LiteralPath $p)) { throw "缺少安装源：$p" }
}
Write-Ok "Root 安装源存在"
foreach ($p in @((Join-Path $script:ScriptSrc '安装.bat'), (Join-Path $script:ScriptSrc 'install.ps1'), (Join-Path $script:ScriptSrc '卸载.bat'), (Join-Path $script:ScriptSrc 'uninstall.ps1'))) {
    if (-not (Test-Path -LiteralPath $p)) { throw "缺少安装器脚本：$p" }
}
Write-Ok "安装器脚本齐全"

$redistX64 = Join-Path $script:RedistSrc 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
$redistX86 = Join-Path $script:RedistSrc 'MicrosoftEdgeWebView2RuntimeInstallerX86.exe'
$redist360 = @(Get-ChildItem -LiteralPath $script:RedistSrc -Filter '360cse_*.exe' -File -ErrorAction SilentlyContinue)
$missingRedist = @()
foreach ($p in @($redistX64, $redistX86)) { if (-not (Test-Path -LiteralPath $p)) { $missingRedist += $p } }
if ($redist360.Count -eq 0) { $missingRedist += (Join-Path $script:RedistSrc '360cse_*.exe') }
if ($missingRedist.Count -gt 0) {
    if ($SkipRedistCheck) {
        Write-Host ('  [!!] 缺少离线组件（-SkipRedistCheck 已跳过）：' + ($missingRedist -join '；')) -ForegroundColor Yellow
    } else {
        throw ("缺少离线组件：" + ($missingRedist -join '；') + "。请把安装器放进 安装制作\redist\，或加 -SkipRedistCheck。")
    }
} else {
    Write-Ok "离线组件齐全（WebView2 x64/x86 + 360cse）"
}

# ---------------------------------------------------------------------------
# 清理旧产物（严格校验路径）
# ---------------------------------------------------------------------------
Write-Step "准备输出目录"
if (-not (Test-Path -LiteralPath $script:ReleaseRoot)) { New-Item -ItemType Directory -Path $script:ReleaseRoot -Force | Out-Null }
$releaseFull = [IO.Path]::GetFullPath($script:ReleaseRoot).TrimEnd('\') + '\'
$stageFull = [IO.Path]::GetFullPath($script:Stage)
if (-not $stageFull.StartsWith($releaseFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "拒绝清理：输出目录不在 发布\ 下：$stageFull"
}
if ((Split-Path -Leaf $stageFull) -notmatch '^游戏大厅_v[\d._]+_安装包$') {
    throw "拒绝清理：输出目录名不符合约定：$stageFull"
}
if (Test-Path -LiteralPath $script:Stage) {
    Write-Note "删除旧目录：$script:Stage"
    Remove-Item -LiteralPath $script:Stage -Recurse -Force
}
if (Test-Path -LiteralPath $script:ZipPath) {
    Write-Note "删除旧压缩包：$script:ZipPath"
    Remove-Item -LiteralPath $script:ZipPath -Force
}
New-Item -ItemType Directory -Path $script:Stage -Force | Out-Null
$stagePayload = Join-Path $script:Stage 'payload'
$stageRedist = Join-Path $script:Stage 'redist'
New-Item -ItemType Directory -Path $stagePayload -Force | Out-Null
New-Item -ItemType Directory -Path $stageRedist -Force | Out-Null
Write-Ok $script:Stage

# ---------------------------------------------------------------------------
# 拷贝安装器
# ---------------------------------------------------------------------------
Write-Step "写入安装器"
foreach ($name in @('安装.bat', 'install.ps1', '卸载.bat', '卸载游戏大厅.bat', 'uninstall.ps1')) {
    Copy-Item -LiteralPath (Join-Path $script:ScriptSrc $name) -Destination (Join-Path $script:Stage $name) -Force
}
[IO.File]::WriteAllText((Join-Path $script:Stage 'VERSION.txt'), $Version + "`r`n", $script:Utf8Bom)
Write-Ok "安装器与 VERSION.txt"

# ---------------------------------------------------------------------------
# 拷贝 payload
# ---------------------------------------------------------------------------
Write-Step "复制游戏大厅文件"
Copy-Item -LiteralPath (Join-Path $script:PayloadSrc '游戏大厅.exe') -Destination (Join-Path $stagePayload '游戏大厅.exe') -Force
Copy-Item -LiteralPath (Join-Path $script:PayloadSrc 'games.json') -Destination (Join-Path $stagePayload 'games.json') -Force
foreach ($name in @('README.md', 'VERSION.txt', 'photo.ico')) {
    $p = Join-Path $script:PayloadSrc $name
    if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $stagePayload $name) -Force }
}
$stageGame = Join-Path $stagePayload 'game'
Copy-Item -LiteralPath (Join-Path $script:PayloadSrc 'game') -Destination $stageGame -Recurse -Force
Write-Ok ("游戏本体：" + (Get-RelativePath -Base $script:Stage -Full $stageGame))

# 安装版的版本标记（覆盖 payload 里可能已有的旧文件）
$versionJson = [ordered]@{
    app     = '游戏大厅'
    version = $Version
    channel = 'stable'
    entry   = '游戏大厅.exe'
    builtAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
} | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path $stagePayload 'version.json'), $versionJson, $script:Utf8NoBom)

$payloadFiles = @(Get-ChildItem -LiteralPath $stagePayload -Recurse -File -Force)
$payloadBytes = ($payloadFiles | Measure-Object -Property Length -Sum).Sum
Write-Ok ("payload：" + $payloadFiles.Count + " 个文件，" + [math]::Round($payloadBytes / 1MB, 1) + " MB")

# ---------------------------------------------------------------------------
# 拷贝离线组件
# ---------------------------------------------------------------------------
Write-Step "复制离线组件"
if (Test-Path -LiteralPath $redistX64) { Copy-Item -LiteralPath $redistX64 -Destination (Join-Path $stageRedist 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe') -Force }
if (Test-Path -LiteralPath $redistX86) { Copy-Item -LiteralPath $redistX86 -Destination (Join-Path $stageRedist 'MicrosoftEdgeWebView2RuntimeInstallerX86.exe') -Force }
if ($redist360.Count -gt 0) { Copy-Item -LiteralPath $redist360[0].FullName -Destination (Join-Path $stageRedist $redist360[0].Name) -Force }
$redistFiles = @(Get-ChildItem -LiteralPath $stageRedist -Recurse -File -Force)
$redistBytes = ($redistFiles | Measure-Object -Property Length -Sum).Sum
Write-Ok ("redist：" + $redistFiles.Count + " 个文件，" + [math]::Round($redistBytes / 1MB, 1) + " MB")

# ---------------------------------------------------------------------------
# manifest.json
# ---------------------------------------------------------------------------
Write-Step "生成 manifest.json"
$payloadList = New-Object System.Collections.ArrayList
Add-ManifestFiles -BaseDir $stagePayload -Prefix '' -List $payloadList
$redistList = New-Object System.Collections.ArrayList
Add-ManifestFiles -BaseDir $stageRedist -Prefix 'redist' -List $redistList
$manifest = [ordered]@{
    app               = '游戏大厅'
    version           = $Version
    builtAt           = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    payloadFileCount  = $payloadFiles.Count
    payloadTotalBytes = $payloadBytes
    payload           = @($payloadList)
    redist            = @($redistList)
}
$manifestJson = $manifest | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $script:Stage 'manifest.json'), $manifestJson, $script:Utf8NoBom)
Write-Ok ("manifest.json：" + $payloadList.Count + " payload + " + $redistList.Count + " redist")

# ---------------------------------------------------------------------------
# 安装说明
# ---------------------------------------------------------------------------
Write-Step "生成安装说明.txt"
$templatePath = Join-Path $PSScriptRoot '安装说明_模板.txt'
if (Test-Path -LiteralPath $templatePath) {
    $text = [IO.File]::ReadAllText($templatePath, [Text.Encoding]::UTF8)
    $text = $text.Replace('{{VERSION}}', $Version)
    $text = $text.Replace('{{DATE}}', (Get-Date -Format 'yyyy-MM-dd'))
    $text = $text.Replace('{{PAYLOAD_COUNT}}', [string]$payloadFiles.Count)
    $text = $text.Replace('{{PAYLOAD_MB}}', [string][math]::Round($payloadBytes / 1MB, 1))
    $text = $text.Replace('{{REDIST_MB}}', [string][math]::Round($redistBytes / 1MB, 1))
    $text = $text.Replace('{{STAGE_NAME}}', $script:StageName)
    [IO.File]::WriteAllText((Join-Path $script:Stage '安装说明.txt'), $text, $script:Utf8Bom)
} else {
    $text = @"
游戏大厅 v$Version · 安装说明
============================================================
安装：双击 安装.bat
卸载：设置 → 应用 → 游戏大厅，或运行安装目录下 _installer\卸载.bat
默认安装目录：%LOCALAPPDATA%\Programs\游戏大厅
离线组件：WebView2 x64/x86 + 360 极速浏览器
生成时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@
    [IO.File]::WriteAllText((Join-Path $script:Stage '安装说明.txt'), $text, $script:Utf8Bom)
}
Write-Ok "安装说明.txt"

# ---------------------------------------------------------------------------
# 压缩
# ---------------------------------------------------------------------------
if (-not $NoZip) {
    Write-Step "压缩完整离线包（可能较慢）"
    New-ZipFromDirectory -SourceDir $script:Stage -ZipPath $script:ZipPath
    $zipItem = Get-Item -LiteralPath $script:ZipPath
    Write-Ok ("zip：" + [math]::Round($zipItem.Length / 1MB, 1) + " MB")

    Write-Step "校验压缩包内文件名（防止中文乱码）"
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($script:ZipPath)
    try {
        $names = @($zip.Entries | ForEach-Object { $_.FullName })
        $required = @('安装.bat', 'install.ps1', '卸载.bat', 'uninstall.ps1', '安装说明.txt', 'manifest.json', 'payload/游戏大厅.exe', 'payload/games.json', 'payload/game/贪吃蛇.html', 'redist/MicrosoftEdgeWebView2RuntimeInstallerX64.exe', 'redist/MicrosoftEdgeWebView2RuntimeInstallerX86.exe')
        $missing = @($required | Where-Object { $names -notcontains $_ })
        if ($missing.Count -gt 0) { throw ("压缩包缺少条目：" + ($missing -join '；')) }
        $bad = @($names | Where-Object { $_ -match '[\uFFFD]' })
        if ($bad.Count -gt 0) { throw ("压缩包内文件名出现乱码：" + ($bad -join '；')) }
        Write-Ok ("zip 条目 " + $names.Count + " 个，中文文件名正常")
    } finally {
        $zip.Dispose()
    }
} else {
    Write-Note "已指定 -NoZip，跳过压缩。"
}

# ---------------------------------------------------------------------------
# 校验文件
# ---------------------------------------------------------------------------
Write-Step "写入 SHA256SUMS.txt"
$sumLines = New-Object System.Collections.ArrayList
$allStageFiles = @(Get-ChildItem -LiteralPath $script:Stage -Recurse -File -Force | Sort-Object FullName)
foreach ($f in $allStageFiles) {
    $rel = Get-RelativePath -Base $script:Stage -Full $f.FullName
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    [void]$sumLines.Add("$h  $rel")
}
$sumPath = Join-Path $script:ReleaseRoot 'SHA256SUMS.txt'
[IO.File]::WriteAllText($sumPath, ($sumLines -join "`r`n") + "`r`n", $script:Utf8NoBom)
Write-Ok $sumPath

# ---------------------------------------------------------------------------
# 完成
# ---------------------------------------------------------------------------
Write-Step "完成"
Write-Host ''
Write-Host '  安装包目录：' -NoNewline; Write-Host $script:Stage -ForegroundColor Green
if (-not $NoZip) { Write-Host '  离线压缩包：' -NoNewline; Write-Host $script:ZipPath -ForegroundColor Green }
Write-Host '  校验清单：  ' -NoNewline; Write-Host $sumPath -ForegroundColor Green
Write-Host ''
Write-Host ('  下一步：双击 ' + (Join-Path $script:Stage '安装.bat')) -ForegroundColor Cyan
Write-Host ''

if (-not $KeepStage) {
    Write-Note "（-KeepStage 未指定；安装包目录保留，方便检查）"
}
