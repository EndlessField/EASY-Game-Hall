# 游戏大厅 · 本地单机游戏库

本地单机游戏合集，**全部离线可玩、零网络依赖**。共 **9 款游戏**：5 款网页游戏 + 4 款本地程序。
其中「交火」是**一款游戏、四个页面**（主页 / 整备大厅 / 战役 / 长街尸潮），在大厅里只占一张卡片。

> 本文以 `Z:\Root` 为例；实际可以安装在任意目录。安装包默认装到
> `%LOCALAPPDATA%\Programs\游戏大厅`（当前用户，不需要管理员），见下面「安装 / 升级」。

## 目录结构

根目录只有 6 个安装文件 + 3 个文件夹，一眼能看清：

```
Z:\Root\
├── 游戏大厅.exe             ★ 唯一入口（单进程 · 单窗口 · 单 WebView2 · 32 位）
├── games.json              ★ 游戏清单：名字/分组/封面/说明 + modes 子页面
├── photo.ico               ★ 大厅图标（桌面/开始菜单快捷方式默认使用）
├── README.md
├── VERSION.txt             安装包版本（0.2）
├── version.json            版本标记（安装器读取）
│
├── game\                    ★ 所有游戏都在这里
│   ├── breach\                    交火 v3.5.1（四个页面 + 自带 25 个测试 + 4 个探针）
│   │   ├── index.html                   主页（教程 / 战绩 / 存档位 / 排行榜 / 五图预览）
│   │   ├── game\hub.html                 整备大厅（装备 / 难度 / 地图 / 18 项升级 / 军衔晋升钢印 / 成就 / 排行榜 / 账户）
│   │   ├── game\breach.html              战役本体（战斗 / 战术指令 / 破墙 / 诱饵 / 断电 / 作业图）
│   │   ├── game\street.html              丧尸围城 · 长街尸潮（波间工事 / 招募 / 撤离窗口）
│   │   ├── photo.ico
│   │   ├── AI_README.md / 使用说明.txt
│   │   └── tests\                        25 个断言测试 + 4 个探针 + run_all.js
│   ├── 程序\                      4 款本地程序（丧尸末日 / 如果你被困在了同一天 / 狼人杀 / 猫国建设者）
│   ├── 贪吃蛇.html / 太空射手.html / 俄罗斯方块.html
│   ├── 扫雷\
│   │   ├── 扫雷游戏.html
│   │   └── assets\                       扫雷自带的样式与贴图
│   └── lib\
│       └── fontawesome-free-7.3.1-web\  ★ 三个小游戏共用的图标字体（css + webfonts，0.8 MB）
│
├── _dev\                    玩的时候用不到：源码 / 测试 / 构建 / 旧版归档
│   ├── cpp\                     大厅源码（GameHall.cpp、HallPage.hpp）、构建脚本、WebView2 SDK
│   │   └── _legacy_lobby\       旧的三套大厅源码与旧产物
│   ├── tests\                   大厅与全库的 Node 测试（3 个脚本）
│   ├── _archive\                旧版游戏归档
│   │   ├── 交火_v3.0\             交火 v3.5.1 的旧版（v3.0 四个页面 + 自带测试 + v3.0 的三份设计文档）
│   │   └── 破门而入_v2.0\         交火的前身（v2.0 四个页面 + 自带测试），升级时整体留下
│   └── _backup_before_merge_*\  最早那批破门而入页面快照（已过时，可删）
│
└── _runtime\                大厅运行时自己生成的，删掉会自动重建
    ├── hall.html                宿主生成的大厅页（内部文件，不是给你双击的）
    └── profile\                 WebView2 用户数据 —— **网页游戏的存档就在这里**
```

> 根目录里若多出 `交火存档_*.json`，那是你自己从游戏里**导出**的存档（玩家数据），不是安装内容，删不删都行。

> **大厅是 32 位程序**：`游戏大厅.exe` 编成 x86，在 32 位 Windows 上原生运行，在 64 位 Windows 上
> 走 WOW64 也一样运行（WebView2 浏览器进程仍按系统架构起，实测 64 位系统上跑的就是 64 位
> `msedgewebview2.exe`）。WebView2 加载器已经**静态链入**，根目录不再需要 `WebView2Loader.dll`
> —— 少一个文件可丢，也彻底没有"exe 与 dll 位数对不上"这类问题。详见下面「32 位系统」。

> **图标字体有两份，都在用**：
> `game\lib\fontawesome-free-7.3.1-web\` 供三个小游戏（贪吃蛇 / 太空射手 / 俄罗斯方块）引用；
> `game\breach\fontawesome-free-7.3.1-web\` 是《交火》自带的裁剪版（约 0.13 MB），
> 交火四个页面直接按发行包原路径引用（`index.html` 写 `fontawesome-…`，`game\` 内三页写 `../fontawesome-…`）。
> 两份不能互相替代，删任意一份都会让对应页面丢图标。`_dev\tests\hall_check.js` 会逐个解析
> 页面的 `href`/`src`，确认本地依赖真的存在。

## 快速开始

| 方式 | 文件 | 说明 |
|---|---|---|
| **大厅（唯一入口）** | `游戏大厅.exe` | 卡片式游戏库；网页游戏在**同一个** WebView2 里打开，本地程序一键启动 |
| 逐个直开 | `game\breach\index.html`、`game\*.html`、`game\程序\*.exe` | 不想用大厅时直接双击任意游戏 |

> 大厅只保留 WebView2 版本（原先那份可双击的 `游戏大厅.html` 已删除）。
> `游戏大厅.exe` 是 **32 位(x86)** 程序：32 位 Windows 原生跑，64 位 Windows 走 WOW64 也能跑，
> 一套产物覆盖两种系统；WebView2 加载器已静态链入，**不需要** `WebView2Loader.dll`。
> 只依赖系统的 Edge WebView2 Runtime；缺 Runtime 或初始化超时会给明确的错误提示，不会白屏。

## 安装 / 升级（安装包 v0.2）

发布包解压后双击 **`安装.bat`**。安装器会先询问安装目录：

- **直接回车** → 用默认目录；
- **直接输入完整路径** → 装到那里，例如 `Z:\Root`、`G:\Fire\fontawesome-free-7.3.1-web`；
  路径不需要加引号，带空格也可以整行输入。

| 项目 | 说明 |
|---|---|
| 默认目录 | 本机已装过 → 已安装目录（如 `Z:\Root`）；没装过 → `%LOCALAPPDATA%\Programs\游戏大厅` |
| 桌面快捷方式 | `游戏大厅.lnk`（指向安装目录的 `游戏大厅.exe`，图标用 `photo.ico`） |
| 开始菜单 | `程序\游戏大厅.lnk`（图标同上） |
| 卸载 | 设置 → 应用 → 游戏大厅，或安装目录下 `卸载游戏大厅.bat` |

安装器会依次检查：

1. **安装包完整性**（`payload\游戏大厅.exe`、`games.json`、`game\`）；
2. **安装目录 + 已安装版本**：目标目录没有 → 全新安装；旧版 → 覆盖升级并保留 `_runtime` 存档；
   同版本 → 校验 97 个文件的 SHA256，缺文件就修复；更新版本 → 默认不降级；
3. **WebView2 运行时**：缺失时按系统位数静默安装 `redist\MicrosoftEdgeWebView2RuntimeInstallerX64/X86.exe`；
4. **现代浏览器**（排除 IE）：Edge / Chrome / Firefox / 360 / QQ / Opera / Brave / Vivaldi 等；
   一个都没有时安装 `redist\360cse_23.0.1253.0.exe`（360 极速浏览器）。

> 包内是 **360cse（360 极速浏览器）**，不是 360se（360 安全浏览器）；两者都是 Chromium 内核。
> 大厅本身用 WebView2 显示网页，外部浏览器只是兜底。
>
> 不想询问、直接指定：`powershell -ExecutionPolicy Bypass -File install.ps1 -InstallDir "D:\Games\游戏大厅"`；
> 或加 `-NoPrompt` 用默认目录。装到 Program Files：以管理员身份运行后加 `-Machine`；
> 强制重装/降级：加 `-Force`；只看计划不动文件：加 `-DryRun`。
> 安装器日志在 `%TEMP%\游戏大厅_安装日志_*.log`，全部 UTF-8，不会出现“锟斤拷”。

### 大厅快捷键

| 按键 | 作用 |
|---|---|
| 方向键 / Enter | 在卡片间移动 / 启动选中的游戏 |
| `F` | 收藏 / 取消收藏当前卡片 |
| `/` 或 `Ctrl+F` | 聚焦搜索框 |
| `Esc` | 清空搜索 |
| `F11` | 全屏（游戏里很实用） |
| `F1` / `Alt+←` | 从任意游戏页返回大厅 |
| 鼠标移到**窗口顶部** | 滑出「← 游戏大厅」浮条（平时完全隐藏，不遮挡游戏 HUD） |

## 32 位系统（x86）

| 项目 | 说明 |
|---|---|
| 位数 | `游戏大厅.exe` 默认编成 **32 位(x86)**：32 位 Windows 原生运行，64 位 Windows 通过 WOW64 运行，**一套产物覆盖两种系统**，不用另下 64 位版本 |
| 依赖 | 只需要系统的 **Edge WebView2 Runtime**。32 位系统装 x86 运行时、64 位系统装 x64 运行时，两种都能被这个 32 位大厅使用（实测：Windows 11 64 位 + x64 运行时 155，32 位大厅创建 WebView2 控制器 `hr=0`，8 个页面全部 `errors=0`） |
| 不需要 | `WebView2Loader.dll` 已改成静态链接（`WebView2LoaderStatic.lib`），根目录不再有这个文件；也不依赖 VC++ 运行库（`/MT` 静态 CRT，导入表里只有系统 DLL） |
| 4 款本地程序 | `game\程序\*.exe` 本来就是 32 位，32 位系统直接能跑 |
| 老系统 | Windows 7 / 8.1 微软已停止 WebView2 支持，只能用 **109 及更早的固定版本运行时**：解压后把环境变量 `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` 指向那个目录即可（WebView2 加载器原生支持）。大厅对 DPI 感知也做了运行时降级（取不到 `SetProcessDpiAwarenessContext` 就退回 `SetProcessDPIAware`），不会在加载器阶段报"找不到入口点"。这两个系统**没有实测** |
| 想编 64 位 | `build_game_hall.bat x64`（默认 `x86`）；产物都是同名 `游戏大厅.exe`，覆盖旧文件即可 |

> 32 位进程最多只能用 2 GB 内存，但大厅宿主只是"开窗口 + 导航"的薄壳（常驻内存很小），
> 真正吃内存的页面渲染在独立的 `msedgewebview2.exe` 里，按系统架构运行，不受这个限制。

> 换到 32 位机器上可以先跑一次 `游戏大厅.exe --selftest` 验证：第一行会打印
> `SELFTEST START … arch=x86`，三步全过（`SET-OK` / `SHARED-OK` / `CARDS=9`）就说明大厅与
> WebView2 都正常。

## 新增 / 修改游戏：只改 `games.json`

大厅不硬编码游戏列表，启动时读取同目录 `games.json`，并逐条检查文件是否存在
（**缺失的条目自动标灰，不会出现打不开的死卡片**）。加一款游戏只需两步：

1. 把游戏文件放进 `game\`（网页）或 `game\程序\`（本地程序）；
2. 在 `games.json` 的 `games` 数组里加一条：

```json
{ "id": "my-game", "name": "我的游戏", "group": "web", "kind": "web",
  "path": "game/我的游戏.html",
  "cover": "fa-rocket", "accent": "#4f8cff",
  "tags": ["标签一", "标签二"], "desc": "一句话说明" }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✔ | 唯一标识（宿主消息里用它） |
| `name` / `group` / `kind` / `path` | ✔ | 名称 / 分组 id（须在 `groups` 里声明）/ `web` 或 `exe` / 相对路径（用 `/`） |
| `cover` | | FontAwesome 图标名（卡片封面，如 `fa-crosshairs`），默认 `fa-gamepad` |
| `accent` | | 主题色 `#RRGGBB`（卡片封面渐变 + 按钮配色） |
| `tags` / `desc` | | 标签与说明（参与搜索） |
| `featured` | | `true` = 跨两列的主打卡片（最多一张） |
| `modes` | | **同一款游戏的多个页面**（见下） |

### 一款游戏、多个页面：用 `modes`

「交火」的四个页面就是这样表达的 —— 大厅里只有**一张卡片**，四个页面是卡片上的四个模式按钮：

```json
{
  "id": "breach", "name": "交火", "group": "web", "kind": "web",
  "path": "game/breach/index.html", "cover": "fa-crosshairs", "accent": "#ffc256", "featured": true,
  "tags": ["战术射击", "战役", "四页一体"], "desc": "四个页面共用一份存档，是一座完整作品的四个部分。",
  "modes": [
    { "id": "home",     "name": "主页 · 教程",        "icon": "fa-house",              "path": "game/breach/index.html" },
    { "id": "hub",      "name": "整备大厅",           "icon": "fa-screwdriver-wrench", "path": "game/breach/game/hub.html" },
    { "id": "campaign", "name": "战役 · 红蓝对抗",    "icon": "fa-crosshairs",         "path": "game/breach/game/breach.html" },
    { "id": "street",   "name": "丧尸围城 · 长街尸潮", "icon": "fa-skull",              "path": "game/breach/game/street.html" }
  ]
}
```

- `path` 是卡片「开始游戏」的入口，`modes` 是卡片下方的快捷入口；
- `_dev\tests\hall_check.js` 会**明确拦截**「把同一款游戏的子页面拆成好几条清单项」这种回归；
- 改完在大厅里点「重新扫描清单」即可，**不用重新编译**。

## 大厅是怎么做到的（单 WebView2）

| 设计 | 说明 |
|---|---|
| 一个 WebView2 | 大厅页与所有网页游戏都在**同一个** `ICoreWebView2` 里 `Navigate` 切换：① 点击网页游戏 = 原地导航，不开新窗口；② `NewWindowRequested` 一律拦下 —— 本地页面回落到本实例，外链交给系统浏览器；③ 窗口客户区只有 WebView2 一个控件（界面全部由页面自己画） |
| 本地内容同源化 | 用 `SetVirtualHostNameToFolderMapping` 把 `Z:\Root\` 映射成 `https://hall.local/`：拿到真正的同源 origin、可用 secure context、中文/空格路径统一百分号编码；运行库不支持时自动退回 `file://`（`--file` 可强制旧基址） |
| 存档不搬家就清零？不会 | 换 origin 意味着旧 `file://` 里的存档会读不到，所以**首次启动做一次性迁移**：读出 `breach_game_cfg / breach_game_save / breach_game_set / breach_game_slot / …_s / …_s2 / hall_prefs_v1` → 写进 `https://hall.local` → 落标记文件 `_runtime\profile\hall_origin_migrated_v1`，之后永不再跑。失败或 8 秒超时都只是跳过，**绝不挡路** |
| 返回大厅 | 宿主向每个页面注入顶部浮条（默认隐藏，鼠标到顶部才滑出），另有 `F1` / `Alt+←` |
| 无白闪 | 窗口背景与 `DefaultBackgroundColor` 都是深色；`AreBrowserAcceleratorKeysEnabled=FALSE`（`F5`/`Ctrl+R` 不会在战斗中刷新游戏） |
| 自检 | `游戏大厅.exe --selftest [--vhost\|--file]`：依次加载主页 → 整备页 → 大厅页，打印 `origin`、位数（`arch=x86`）、`localStorage` 是否同源共享、卡片与模式数量，退出码 0/1 |

## 重新编译大厅

```bat
Z:\Root\_dev\cpp\build_game_hall.bat
```

- 源码：`_dev\cpp\GameHall.cpp`（清单解析 + WebView2 宿主 + 消息桥）与 `_dev\cpp\HallPage.hpp`（大厅页面模板）
- 默认编 **32 位(x86)**；要 64 位就 `build_game_hall.bat x64`
- 关键编译参数：`/utf-8`（源码含中文）、`/MT`（静态 CRT，不依赖 VC++ 运行库）、静态链入
  `WebView2LoaderStatic.lib`（所以**不需要** `WebView2Loader.dll`）、
  链接 `user32 shell32 ole32 gdi32 shlwapi version advapi32`、输出到 `Z:\Root\`
- SDK 已解包在 `_dev\cpp\wv2sdk\`（x86 / x64 / arm64 三套 loader 都在）
- 构建收尾 `_dev\cpp\rename_hall.js` 把产物改名成 `游戏大厅.exe`、读 PE 头核对位数
  （默认期望 x86，不符直接构建失败），再调用 `--export` 刷新 `_runtime\hall.html`

## 自动化测试

```bat
:: 大厅与全库（3 个脚本，不依赖 exe、不需要浏览器）
cd Z:\Root\_dev\tests
node hall_check.js         :: 清单审计 + 每个页面文件/本地依赖存在性 + 图标名真的有 + 「一款游戏只占一条」
node hall_page_test.js     :: 大厅页离屏渲染：卡片/搜索/收藏/过滤/宿主消息协议/缺文件兜底
node games_smoke_test.js   :: 全部 9 个网页游戏在 DOM 桩里各跑 90 帧，抓运行时异常、悬空 id、网络 API

:: 交火 v3.0 与破门而入 v2.0（两代前身）的完整测试集存档在 _dev\_archive\ 下对应目录的 tests\
:: 交火自带的完整测试集（24 个断言测试 + 4 个探针）
cd Z:\Root\game\breach
node tests\run_all.js
```

> `run_all.js` 靠 `child_process` 逐个拉起测试脚本；**在禁止程序开管道**的受限沙箱里，
> 这 25 个子进程会全部启动失败（各 0ms、无输出、看起来像"全线 FAIL"），那是沙箱边界而不是测试结论。
> 遇到这种情况就照 `tests\run_all.js` 里的 `ORDER` 逐个直跑：`node tests\offline_test.js`、`node tests\doc_test.js`…
> 本库最近一次（2026-10-26）就是这样逐个跑完的：**24/25 通过**；`version_test.js` 需要源码树里的
> `.uiwork\build-package.ps1`，安装副本没带这个开发文件，其余 24 个全过；4 个探针（`fog_probe` /
> `map_probe` / `map_render` / `street_stuck_probe`）另跑，全部正常 —— 其中 `map_render.js` 重画出的
> 5 张 `tests\_map_*.png` 与包内自带的**逐字节相同**。

当前状态：**大厅侧 3 个脚本全过（`hall_check.js` 116/116）；交火 24/25（仅 `version_test.js` 缺 `.uiwork` 开发文件）；交火 4 个探针全过；32 位大厅 `--selftest` 3/3、`--probe-all` 8/8**。

## 自检与导出

```bat
Z:\Root\游戏大厅.exe --selftest          :: 默认走 https://hall.local（虚拟主机）
Z:\Root\游戏大厅.exe --selftest --file   :: 走 file:// 对比
Z:\Root\游戏大厅.exe --probe-all         :: 逐个打开所有网页游戏, 报标题/正文/canvas 尺寸/JS 错误数
Z:\Root\游戏大厅.exe --probe game/扫雷/扫雷游戏.html   :: 只测一个页面
Z:\Root\游戏大厅.exe --export            :: 只生成 _runtime\hall.html(不弹窗)，供排查使用
```

`--selftest` 里 `SHARED-OK` 是关键证据：**主页写、整备页读**能读到同一份数据，
说明四个交火页面确实是「一款游戏、一份存档」。

`--probe-all` 是「每个游戏到底打不打得开」的最终证据，实测输出（**32 位**大厅 + 本机 WebView2 155，64 位 Windows 11）：

```
PROBE-ALL 共 8 个页面, base=https://hall.local/
PROBE 交火: "title=交火 · 主页 | text=2463 | canvas=[mapPrev:560x233] | errors=0 | dialogs=0"
PROBE 交火 · 整备大厅: "title=交火 · 整备大厅 | text=2188 | canvas=[mapPrev:480x200] | errors=0 | dialogs=0"
PROBE 交火 · 战役 · 红蓝对抗: "title=交火 · 户型图红蓝对抗 | text=616 | canvas=[cv:962x635,mm:192x80,aarCanvas:1240x520] | errors=0 | dialogs=0"
PROBE 交火 · 丧尸围城 · 长街尸潮: "title=交火 · 长街尸潮（独立玩法） | text=1338 | canvas=[cv:962x635] | errors=0 | dialogs=0"
PROBE 贪吃蛇: "title=贪吃蛇 | text=138 | canvas=[gameCanvas:500x500] | errors=0 | dialogs=0"
PROBE 太空射手: "title=太空射手 · 星际猎手 | text=412 | canvas=[game:800x600] | errors=0 | dialogs=0"
PROBE 俄罗斯方块: "title=俄罗斯方块 - 经典益智游戏 | text=150 | canvas=[game:300x600,?:80x80,?:80x80,?:80x80] | errors=0 | dialogs=1 <- confirm: 检测到未完成游戏，是否恢复？"
PROBE 扫雷: "title=扫雷游戏（无猜版）- Minesweeper | text=31 | canvas=[rm:39x23,es:39x23,paf:225x225] | errors=0 | dialogs=0"
SELFTEST DONE: steps=8 fails=0
```

> 这组读数是 **32 位大厅**在本机（Windows 11 64 位 + x64 WebView2 Runtime 155）上跑出来的：
> 32 位宿主 + 64 位运行时这个组合没问题；`--selftest` 的 3 步（`SET-OK` / `SHARED-OK` /
> `CARDS=9 NAV=5 MODES=4`）也全过。`dialogs=1` 是俄罗斯方块加载期那个
> 「检测到未完成游戏，是否恢复？」被探针 shim 接管记录，不影响判定。
> （更早的受限沙箱里 WebView2 的命名管道被禁，`--probe-all` 会卡在控制器创建
> `hr=0x80004004`、进程 exit code 3；那是沙箱边界，普通桌面不受影响。）

`canvas` 尺寸是"真的开局了"的证据：扫雷的 `paf:225x225` = 9×25 的棋盘已经建好，
交火的 `cv:962x635` = 战斗画布已经在跑。

## 整理记录

- **v8（本次）**：安装包 **0.2**。
  - 大厅图标改为安装目录下的 **`photo.ico`**：桌面/开始菜单快捷方式、卸载项 `DisplayIcon`
    都指向它；根目录新增 `photo.ico`，payload 从 96 个文件变成 97 个。
  - 新增可见卸载脚本 **`卸载游戏大厅.bat`**：安装根目录一份、安装包根目录一份，
    内部调用 `_installer\uninstall.ps1`（包根目录则调用本地 `uninstall.ps1`）。
  - 版本号 0.1 → 0.2；升级/修复保留 `_runtime`，卸载默认保留存档。
  - 实测：`Z:\Root` 从 0.1 原地升级到 0.2；快捷方式 `IconLocation` = `Z:\Root\photo.ico,0`；
    `卸载游戏大厅.bat` 在安装目录和包目录都能找到卸载器。
- **v7**：新增 **Windows 安装包 v0.1**（安装 / 升级 / 修复 / 卸载）。
  - 安装源仍是本目录；制作工程在 `安装制作\`（脚本 + WebView2 x64/x86 + 360cse），产物在 `发布\`。
  - 安装器 `install.ps1` 检查：安装包完整性 → 已安装版本（新装 / 升级 / 同版本校验修复 / 更新版本不降级）
    → WebView2（缺失静默装离线安装器）→ 现代浏览器（缺了装 360 极速浏览器）→ 复制文件 + 桌面/开始菜单快捷方式。
  - 默认当前用户安装到 `%LOCALAPPDATA%\Programs\游戏大厅`；`-Machine` 可装 Program Files；
    升级保留 `_runtime` 存档；同版本按 `manifest.json` 的 96 个 SHA256 校验，缺文件才修复。
  - 编码：`.ps1` 全部 UTF-8 with BOM，`.bat` 只含 ASCII，安装说明/日志 UTF-8，避免“锟斤拷”。
  - 新增根目录 `VERSION.txt`（0.1）与 `version.json`；README 里的交火版本号同步到 v3.5.1。
  - 测试：全新安装、同版本跳过、删文件修复、0.0.9→0.1 升级、0.2.0 不降级、`-Force` 降级、卸载删除、
    HKCU 卸载项、桌面/开始菜单快捷方式、`-KeepSaves` 存档备份均通过；游戏自带测试 24/25
    （仅 `version_test.js` 缺源码树的 `.uiwork\build-package.ps1`）。
- **v6**：大厅改成 **32 位(x86)** 构建，兼容 32 位系统 —— 64 位 Windows 上同样运行（WOW64）。
  - 构建脚本改为 `vcvarsall.bat x86` + 静态链入 `WebView2LoaderStatic.lib`，并显式 `/MT`（静态 CRT）：
    产物**不再需要 `WebView2Loader.dll`**，根目录的安装文件从 4 个减到 3 个
    （`游戏大厅.exe` / `games.json` / `README.md`；玩家导出的存档 JSON 不算）；
    导入表里只剩 `user32 / shell32 / ole32 / gdi32 / kernel32 / advapi32`，连 VC++ 运行库都不依赖。
  - `rename_hall.js` 现在读 PE 头核对架构（默认期望 x86，不符直接构建失败），构建输出里写明
    「32 位 x86」——"兼容 32 位"由构建收尾把关，不靠口头约定。
  - `SetProcessDpiAwarenessContext` 改成运行时 `GetProcAddress` 取地址、取不到退回
    `SetProcessDPIAware()`：老系统不会在加载器阶段报"找不到入口点"，能正常弹出"缺 WebView2 Runtime"。
  - 缺运行时 / 初始化超时的提示改成 32 位口径（说明装对应架构的 Evergreen 运行时，并注明
    Win7/8.1 只能用 109 及更早的固定版）。
  - 实测（Windows 11 64 位 + x64 WebView2 155）：32 位大厅 `--selftest` 3/3 步全过
    （`SET-OK`、`SHARED-OK`、`CARDS=9 NAV=5 MODES=4`），`--probe-all` **8 个页面全过、errors=0**；
    `--probe-all` 读数已按本次结果填进「自检与导出」那节。大厅侧 3 个 Node 脚本（116 / 33 / 9）全过。
- **v5**：安装《交火》**v3.2**（根目录的 `交火_v3.2.zip`）—— 老规矩 `game\breach\` **原地升级**，
  大厅里仍是**一款游戏、四个页面**只占一张卡（四条 `modes` 的 id/路径一字未改，只更新了 `games.json` 里那句版本说明）。
  - 这次**包内内容与文件名一致**（`使用说明.txt` 抬头、`AI_README.md` 抬头、游戏内图签 `REV. 版次` 全是 v3.2），
    不用再写"文件名写 3.x、内容却是 3.y"那种说明。
  - 升级前把整个 v3.0 安装原样归档到 `_dev\_archive\交火_v3.0\`（四页 + 22 个自带测试 + `AUDIT.md` /
    `CHANGELOG_v3.md` / `DESIGN.md`）。v3.2 包里**不再有**那三份文档，只发 `AI_README.md` + `使用说明.txt`，
    所以它们跟着旧版一起进归档，没有留在新安装里冒充"当前文档"。
  - 随包自带的 FontAwesome 副本照例**删除**，四页 `<link>` 改指 `game\lib\`（`index.html` 写 `../lib/…`，
    `game\` 内三页写 `../../lib/…`），`tests\offline_test.js` 白名单照旧放开一层可选 `lib/` 段。
    这次专门核过：包里那份与共享那份 **SHA-256 逐字节相同**，四页用到的 108 个 `fa-*` 图标共享 CSS 里全都有。
  - 安装后逐文件比对：**36 个文件与包内逐字节相同**，只有上述 5 个文件按预期改了那一行（4 页 + 白名单）。
  - 测试：交火自带 **24 个断言测试全过**（v3.0 是 22 个，v3.2 新增 `account_test.js` / `board_test.js`）
    ＋ 4 个探针全过；大厅侧 3 个脚本（116 / 33 / 9 项）全过。
  - 顺带修掉 `_dev\tests\games_smoke_test.js` 的一个**误报**：交火 v3.2 的账户弹窗是运行时用工厂函数
    （`acctField(parent, id, …)` → `inp.id = id`）现造的输入框，静态 HTML 里查不到 `acctPw` / `acctDelPw`，
    于是"悬空 id"检查把主页/整备/长街三页判成 FAIL。现在它会先认出"把形参写进元素 id"的函数、
    再收集调用点上对应位置的字面量实参；`$("ss")` 那类**从来没被造过**的 id 依旧照抓不误（扫雷回归保护没打折）。
  - 根目录的 `交火_v3.2.zip` 已删除，根目录仍是 **4 个文件 + 3 个文件夹**。
- **v4**：安装《交火》v3.0 —— 它是 `破门而入 v2.0` 的**后继版本**（同一血脉、同样四页一体），
  因此 `game\breach\` **原地升级**，大厅卡片更名「交火」，仍是**一款游戏、四个页面**只占一张卡。
  旧版四页与自带测试整体归档到 `_dev\_archive\破门而入_v2.0\`；随包自带的 FontAwesome 副本已删除，
  四页 `<link>` 改指库内唯一一份 `game\lib\`；根目录的 `交火_v3.1.zip` 已删除，
  根目录仍是 **4 个文件 + 3 个文件夹**。
  > ⚠ **版本号说明**：压缩包文件名写的是 `交火_v3.1.zip`，但**包内每个文件都是 v3.0** ——
  > `使用说明.txt` 抬头（`《交火》 CROSSFIRE · v3.0`）、`AUDIT.md`、`CHANGELOG_v3.md`、
  > 以及游戏内图签的 `REV. 版次 = v3.0`（`game\breach.html`）都指向 v3.0，全包没有一处写 3.1。
  > 所以按**包内实际内容**记为 v3.0，不跟着文件名伪造版本号。
- **v3**：根目录只留 `游戏大厅.exe` / `WebView2Loader.dll` / `games.json` / `README.md`
  加 `game\`、`_dev\`、`_runtime\` 三个文件夹；4 款本地程序从 `EXE\` 挪进 `game\程序\`；
  源码与测试收进 `_dev\`；运行时产物（大厅页 + WebView2 用户数据）收进 `_runtime\`。
- **v2**：所有网页游戏从 `Html\` 挪进 `game\`；两份 28.8 MB 的 FontAwesome 合并成 `game\lib\` 下唯一一份 0.8 MB；
  删除可双击的静态 `游戏大厅.html`，大厅只保留 WebView2 版；安装破门而入 v2.0。
- 修掉的真 bug：**扫雷打不开** —— `assets/js/game.js` 的 `start()` 第一步就取 `$("ss").href`，
  而离线副本当初只抓了游戏主体、没带站点外壳，`ss`/`nick`/`uid` 三个元素缺失 → 初始化直接抛异常，
  表现就是"打开扫雷点不动"。已在页面里补齐并隐藏这三个遗留元素，并给 `games_smoke_test.js`
  加了对应的回归检查（详见 `game\扫雷\扫雷游戏.html` 里的注释）。
- 另外查清了一件事：**俄罗斯方块会在加载时弹「检测到未完成游戏，是否恢复？」**。
  这是原作者的**有意设计**（存了 1 小时内的半局就会问），不是 bug —— 点一下就能玩。
  但它是**阻塞式** `confirm`，会把页面的 `load` 事件一直挂住，所以自动化探针必须
  自己接管对话框：`--probe-all` 会用 shim 把 `alert/confirm/prompt` 换成"记录 + 默认回答"
  再报出来（正常游玩完全不干预，你该看到的对话框照旧出现）。
- 旧的三套大厅（win32 / Edge `--app` / 硬编码 WebView2 版）源码与产物归档在 `_dev\cpp\_legacy_lobby\`。

## 常见问题：`游戏大厅.exe` 打不开，提示"智能应用控制已阻止"

**症状**：双击后弹出「智能应用控制已阻止可能不安全的应用 / 我们已阻止 Z:\Root\游戏大厅.exe，因为无法验证其发布者」。

**原因**：Windows 11 的 **智能应用控制（SAC）** 在强制模式下只看两件事——有没有**可信 CA 的代码签名**、或有没有**微软云端信誉**。本大厅是**自己编译的、无签名**的程序，而且**每次重新编译都会产生一个新的文件哈希**，对 SAC 来说永远是"从没见过的陌生人"，所以必被拦。命令行里跑会看到
`An Application Control policy has blocked this file` 或 `blocked by your organization's Device Guard policy` —— 同一个东西。

**注意**：SAC **没有白名单、没有单应用例外、也没有"仍然运行"按钮**；自签名证书也没用（微软明确说消费版不认本地证书存储）。所以只有两条路：

1. **关掉智能应用控制**（本机采用）：`设置 → 隐私和安全性 → Windows 安全中心 → 应用和浏览器控制 → 智能应用控制 → 关闭`。
   - 本机是 **Windows 11 25H2 / Build 26200.9457**，已经包含 2026-04 的 KB5083769（25H2 → 26200.8246）——从那一版起 SAC **可以随时开关、不需要重装系统**，所以关掉是可逆的；更早的版本关掉就要重置系统才能再开。
   - 关掉后 Defender 实时防护与 SmartScreen 照常在跑，丢掉的只是"启动前先拦陌生程序"这一层。
   - **不用重启、也不用重新编译**，策略一撤 `游戏大厅.exe` 立刻能跑。
   - 想恢复：回到同一页面点「打开」即可（若发现开关回不去，说明系统还没装到那一版更新）。
2. **买一张代码签名证书**（OV 级别即可）给大厅签名，然后每次构建后重新签一次——保住 SAC 的同时让重编也能跑。

**验证是否已关闭**：
```powershell
(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy').VerifiedAndReputablePolicyState
# 0=已关闭  1=强制  2=评估
```

> 顺带一提：SAC 只拦**可执行文件**，不拦 `.html`。所以就算大厅被拦，
> 双击 `game\` 里的网页游戏和 `game\程序\*.exe` 照样能玩（那 4 个本地程序因为在
> SAC 评估期就被运行过，通常不会被拦；而大厅每次重编都是新哈希，必被拦）。

## 自检命令速查

```bat
Z:\Root\游戏大厅.exe --selftest --vhost   :: 大厅自检(虚拟主机基址)
Z:\Root\游戏大厅.exe --selftest --file    :: 大厅自检(file:// 基址)
Z:\Root\游戏大厅.exe --probe-all          :: 逐个打开全部网页页面, 报错误数/canvas 尺寸/对话框
Z:\Root\游戏大厅.exe --probe game/扫雷/扫雷游戏.html   :: 只测一个页面
Z:\Root\游戏大厅.exe --export             :: 只生成 _runtime\hall.html, 不弹窗
```
