# 游戏大厅 · 安装包制作工程

这个目录负责把 `..\Root\` 打包成可随时安装的 Windows 安装包。

## 目录

```
安装制作\
├── 脚本\
│   ├── 安装.bat          双击入口（纯 ASCII，避免 cmd 乱码）
│   ├── install.ps1       安装 / 升级 / 修复（UTF-8 with BOM）
│   ├── 卸载.bat          卸载入口（纯 ASCII，兼容旧名）
│   ├── 卸载游戏大厅.bat   可见卸载入口（安装根目录 / 包根目录各一份）
│   └── uninstall.ps1     卸载（UTF-8 with BOM）
├── redist\
│   ├── MicrosoftEdgeWebView2RuntimeInstallerX64.exe
│   ├── MicrosoftEdgeWebView2RuntimeInstallerX86.exe
│   └── 360cse_23.0.1253.0.exe（360 极速浏览器）
├── 安装说明_模板.txt      生成安装包里的 安装说明.txt
├── build.ps1             制作脚本（UTF-8 with BOM）
└── 制作安装包.bat         双击制作（纯 ASCII）
```

## 一键制作

双击 **`制作安装包.bat`**，或：

```powershell
# 完整包（带 zip，约 500 MB，视磁盘速度几分钟）
powershell -ExecutionPolicy Bypass -File .\build.ps1

# 只生成目录，不压缩（调试用，几秒）
powershell -ExecutionPolicy Bypass -File .\build.ps1 -NoZip

# 允许缺少离线组件（只打 payload）
powershell -ExecutionPolicy Bypass -File .\build.ps1 -SkipRedistCheck
```

产物：

```
发布\游戏大厅_v0.2_安装包\        可直接双击 安装.bat
发布\游戏大厅_v0.2_安装包.zip     完整离线包
发布\SHA256SUMS.txt               每个文件的 SHA256
```

`build.ps1` 会：

1. 校验 `Root\`（exe / games.json / game）和 4 个安装器脚本；
2. 校验 redist 里的 WebView2 x64/x86 与 360cse；
3. 清理旧产物（严格校验路径必须在 `发布\` 下）；
4. 复制 payload，生成 `manifest.json`（97 个 payload 文件的 SHA256）；
5. 生成 `安装说明.txt`、`VERSION.txt`；
6. 压缩 zip，并检查 zip 内中文文件名是否乱码；
7. 写 `SHA256SUMS.txt`。

## 改版本号

安装包版本以 **`..\Root\VERSION.txt`** 为准（当前 `0.2`）。

改版本时同步：

- `Root\VERSION.txt`
- `Root\version.json`
- 制作时 `-Version 0.2`（决定产物目录名与包内 VERSION.txt）

`install.ps1` 读包内 `VERSION.txt` 作为版本，不写死。

## 安装器参数

| 参数 | 作用 |
|---|---|
| `-InstallDir <路径>` | 直接指定安装目录，不询问；未指定时默认目录 = 注册表记录的安装目录，否则 `%LOCALAPPDATA%\Programs\游戏大厅` |
| `-NoPrompt` | 不询问安装目录，直接用默认值（脚本/自动化用） |
| `-Machine` | 装到 `%ProgramFiles%\游戏大厅`（需要管理员） |
| `-Force` | 同版本强制修复；已装更新版本时允许降级 |
| `-DryRun` | 只检查并打印计划，不改文件/注册表 |
| `-Quiet` | 静默（不输出、不自动启动） |
| `-NoLaunch` | 安装后不启动大厅 |
| `-NoDesktopShortcut` / `-NoStartMenuShortcut` | 不创建对应快捷方式 |
| `-NoRegistry` | 不写注册表（便携/测试用；卸载仍可从安装根目录 `卸载游戏大厅.bat` 运行，内部用 `_installer\uninstall.ps1`） |
| `-SkipWebView2` / `-SkipBrowserCheck` | 跳过对应检查（测试用） |
| `-ContinueWithoutWebView2` | WebView2 安装失败也继续 |
| `-SimulateNoWebView2` / `-SimulateNoBrowser` | 模拟缺失，配合 `-DryRun` 验证分支 |

## 安装器行为

1. 检查安装包完整性；
2. 选择安装目录：
   - 默认会提示，直接回车 = 默认目录；直接输入完整路径 = 装到那里（如 `Z:\Root`、
     `G:\Fire\fontawesome-free-7.3.1-web`）；
   - 默认目录优先取注册表 `HKCU\Software\游戏大厅\InstallPath`，没有才扫常见目录 / 用 AppData；
   - `-InstallDir` 直接指定；`-NoPrompt` / `-Quiet` / `-DryRun` 不提示；
3. 检查目标目录的已安装版本：
   - 无 → 全新安装
   - 旧 → 升级（保留 `_runtime`）
   - 同版本 → 按 manifest 校验 97 个文件，缺了才修复
   - 新 → 默认不降级（`-Force` 才降）
4. 检查 WebView2：
   - 注册表 `HKLM/HKCU ...\EdgeUpdate\Clients\{F3017226-...}` 的 `pv`
   - 兜底扫 `Microsoft\EdgeWebView\Application`
   - 缺失 → 按系统位数运行 `redist\...X64/X86.exe /silent /install`
5. 检查现代浏览器（排除 IE）：
   - `StartMenuInternet`、`App Paths`、常见安装路径
   - 没有 → `360cse_*.exe --silent-install`，失败再试 `/S`、`/silent`，最后打开图形界面
6. 复制文件、写卸载注册表、创建桌面/开始菜单快捷方式；
7. 默认启动大厅（`-NoLaunch`/`-Quiet` 不启动）。

## 编码约定（避免“锟斤拷”）

- `.ps1`：**UTF-8 with BOM**（Windows PowerShell 5.1 才能正确读中文）；
- `.bat`：**只允许 ASCII**，不写中文，文件名可以是中文；
- `.txt` / 日志 / manifest：UTF-8；日志用 UTF-8 无 BOM 追加；
- zip 由 .NET `ZipArchive` 以 UTF-8 写入，条目名用正斜杠 `/`（不用 `Compress-Archive`，
  它在 PowerShell 5.1 会写成反斜杠 `\`，部分解压工具不认）；制作后会自动抽查中文条目。

> 如果编辑 `.ps1` 后中文变成乱码，先确认 BOM：
> `[IO.File]::ReadAllBytes($p)[0..2]` 应为 `0xEF 0xBB 0xBF`。
> 本工程的所有 `.ps1` 在制作前都已带 BOM。

## 测试记录（2026-10-26）

- **0.2**：payload 97 个文件（新增 `photo.ico`）；`Z:\Root` 从 0.1 原地升级到 0.2；
  桌面/开始菜单快捷方式 `IconLocation` = `Z:\Root\photo.ico,0`；卸载项 `DisplayIcon` 同；
  `卸载游戏大厅.bat` 在安装根目录和包根目录都能找到卸载器；
  安装根目录的脚本会把 uninstaller 复制到 `%TEMP%`、以 `%TEMP%` 为工作目录另起 PowerShell，
  然后批处理自身退出，避免 .bat 锁住安装目录；实测静默卸载后目录完整删除；
- 0.2 卸载：从临时安装运行可见脚本，目录删除后 `HKCU\Software\游戏大厅` 仍指向 `Z:\Root`，
  不会误删另一份安装的注册表/快捷方式；
- 0.1：全新安装到含空格/中文的目录：96 个 payload 文件，SHA256 全对；
- 默认询问安装目录：输入 `Z:\Root` 能识别为已安装 0.1 并原地检查；
- 输入自定义路径（`W:\...\Custom Path\GameHall`）：全新安装成功，注册表/快捷方式都指向该目录；
- `-NoPrompt` / `-InstallDir`：不询问，直接使用指定目录；
- 同版本再装：识别 0.1，文件完整，跳过复制；
- 删掉 `game\贪吃蛇.html` 再装：识别缺失 1 个，修复；
- 把版本改成 0.0.9：升级到 0.1；
- 把版本改成 0.2.0：默认不降级，退出码 3；
- 加 `-Force`：降级到 0.1；
- 卸载：删除安装目录、注册表、快捷方式；`-KeepSaves` 把 `_runtime` 移到
  `%LOCALAPPDATA%\游戏大厅_存档备份\<时间戳>`；
- `-DryRun -SimulateNoWebView2 -SimulateNoBrowser`：两个缺失分支的计划输出正确；
- `Z:\Root\游戏大厅.exe --selftest`：3/3 通过，`CARDS=9`、`errors=0`；
- 编码：安装器中文输出、日志、`安装说明.txt` 均无乱码。
  （用管道批量传中文路径时可能受控制台编码影响，自动化请用 `-InstallDir`。）

## 注意

- 包内是 **360cse（360 极速浏览器）**，不是 360se（360 安全浏览器）。
  要换 360se，把它的安装包命名为 `360cse_*.exe` 放进 `redist\` 即可被识别。
- WebView2 离线安装器按 **系统位数** 选择（x64 系统用 X64，32 位系统用 X86），
  不是按大厅 exe 的位数。
- 升级不会删除安装目录下除 payload 之外的文件（尤其 `_runtime` 存档）。
- 默认会询问安装目录；直接回车时，已装过用已装目录，没装过用当前用户目录（不需要管理员）；
  只有 `-Machine`、WebView2 全局安装失败后提权才需要 UAC。
- 大厅是 32 位、静态链接 WebView2Loader，不需要 `WebView2Loader.dll`。
