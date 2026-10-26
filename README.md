# EASY Game Hall · 游戏大厅

EASY Game Hall 是一个 **Windows 本地单机游戏大厅**：一个 32 位 WebView2 宿主窗口，卡片式游戏库，所有游戏离线可玩、零网络依赖。

当前版本：**0.2**（9 款游戏：5 款网页游戏 + 4 款本地程序）

## 游戏

| 游戏 | 类型 | 说明 |
|---|---|---|
| 交火 | 网页 / 四页一体 | 战术射击：主页 / 整备大厅 / 战役 / 长街尸潮，共用一份存档 |
| 贪吃蛇 | 网页 | 多主题皮肤、本地最高分、触屏/键盘双操作 |
| 太空射手 | 网页 | 弹幕射击 |
| 俄罗斯方块 | 网页 | 经典方块、断点续玩 |
| 扫雷 | 网页 | 无猜版扫雷 |
| 丧尸末日 / 如果你被困在了同一天 / 狼人杀 / 猫国建设者 | 本地程序 | 4 个独立 exe，一键启动 |

## 目录

```text
EASY-Game-Hall/
├── Root/                  游戏大厅运行目录（安装源）
│   ├── 游戏大厅.exe        唯一入口（32 位，静态链接 WebView2Loader）
│   ├── games.json         游戏清单
│   ├── photo.ico          大厅图标（快捷方式/卸载项默认使用）
│   ├── README.md          游戏库详细说明
│   ├── VERSION.txt        0.2
│   ├── version.json
│   ├── game/              网页游戏 + 本地程序 + 共享图标字体
│   └── _dev/              大厅源码 / 测试 / 构建脚本（已剔除 WebView2 SDK 与旧归档）
├── 安装制作/               Windows 安装包制作工程
│   ├── 脚本/               install.ps1 / uninstall.ps1 / 安装.bat / 卸载游戏大厅.bat
│   ├── build.ps1           打包脚本
│   ├── 安装说明_模板.txt
│   └── README.md           参数、构建、编码说明
├── README.md
├── CHANGELOG.md
└── .gitignore
```

## 直接运行

1. 需要系统的 **Microsoft Edge WebView2 Runtime**（Windows 11 自带；Windows 10 多数已安装）。
2. 双击 `Root/游戏大厅.exe`。
3. 如果提示缺少 WebView2，安装 Evergreen Runtime 后再试。

> 大厅是 32 位程序，在 32 位 Windows 原生运行，在 64 位 Windows 通过 WOW64 运行；不需要 `WebView2Loader.dll`。

## 生成安装包

仓库**不包含** `安装制作/redist/` 里的离线组件（WebView2 x64/x86 + 360cse，共约 491 MB），因为 GitHub 单文件限制 100 MB。

### 完整离线安装包

1. 把以下文件放进 `安装制作/redist/`：
   - `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`
   - `MicrosoftEdgeWebView2RuntimeInstallerX86.exe`
   - `360cse_23.0.1253.0.exe`（360 极速浏览器，可选）
2. 运行：

```powershell
cd 安装制作
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

3. 产物：`发布\游戏大厅_v0.2_安装包\` 和 `游戏大厅_v0.2_安装包.zip`。

### 仅构建 payload（本机已有 WebView2）

```powershell
cd 安装制作
powershell -ExecutionPolicy Bypass -File .\build.ps1 -SkipRedistCheck -NoZip
```

这会生成不含 `redist\` 的安装目录；安装器检测到 WebView2 已存在时可以直接安装。

## 安装 / 卸载

- 安装：双击安装包里的 `安装.bat`。安装器会先询问安装目录：
  - 直接回车 = 默认目录（已装过则用已装目录，否则 `%LOCALAPPDATA%\Programs\游戏大厅`）；
  - 直接输入完整路径 = 装到那里，例如 `Z:\Root`、`G:\Fire\fontawesome-free-7.3.1-web`。
- 安装器会检查 WebView2、现代浏览器（排除 IE）和目标目录已安装版本，再决定安装 / 升级 / 修复 / 跳过。
- 桌面和开始菜单快捷方式图标使用安装目录下的 `photo.ico`。
- 卸载：安装目录下 `卸载游戏大厅.bat`，或 Windows 设置 → 应用 → 游戏大厅。
- 卸载默认保留网页存档，移动到 `%LOCALAPPDATA%\游戏大厅_存档备份\<时间戳>\`。

更详细说明见 [安装制作/README.md](安装制作/README.md) 和 [Root/README.md](Root/README.md)。

## v0.2 变更

- 大厅图标默认使用 `photo.ico`（快捷方式、卸载项）。
- 新增可见卸载脚本 `卸载游戏大厅.bat`（安装根目录 / 安装包根目录）。
- 安装器默认询问安装目录，支持直接输入路径。
- 卸载时只删除指向当前安装目录的注册表项，避免误删另一份安装。

## 完整离线包

本地完整离线包（含 WebView2 x64/x86 + 360cse）约 **494 MB**，未提交到 Git 仓库（GitHub 普通文件限制 100 MB）。需要时按上面的“完整离线安装包”步骤在本地构建，或从本地 `发布/` 目录取得。

## 第三方组件

- **Microsoft Edge WebView2 Runtime** — Microsoft，安装包内离线组件遵循 Microsoft 许可。
- **360 极速浏览器（360cse）** — 360.cn，仅在系统没有现代浏览器时由安装器调用；仓库不包含该二进制。
- **FontAwesome Free 7.3.1** — 图标字体，许可见 `Root/game/lib/fontawesome-free-7.3.1-web/LICENSE.txt` 与 `Root/game/breach/fontawesome-free-7.3.1-web/LICENSE.txt`。
- 交火自带的 `LICENSE` / `THIRD_PARTY_NOTICES.md` 保留在 `Root/game/breach/`。
