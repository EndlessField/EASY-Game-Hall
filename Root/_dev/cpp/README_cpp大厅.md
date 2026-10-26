# 游戏大厅 · C++ 版本说明

`Z:\Root` 下大厅相关产物与源码的关系。大厅依据**自身 exe 所在目录**定位 `game\`（所有游戏：
`breach\`、`程序\`、三个小游戏与 `lib\` 图标字体）与 `games.json`，复制到任意盘符都能用。
源码与测试都在 `_dev\` 下，运行时产物在 `_runtime\` 下。

## 一、当前唯一的大厅：`GameHall.cpp` + `HallPage.hpp` → `游戏大厅.exe`

一句话：**一个进程 / 一个窗口 / 一个 WebView2**。

| 能力 | 说明 |
|---|---|
| 清单外置 | 启动读同目录 `games.json`（v2：分组/封面/主题色/说明/`modes` 子页面），加游戏只改 JSON，**不用重编译** |
| 一款游戏一个条目 | 多页面作品用 `modes` 表达（如「破门而入」= 主页/整备/战役/长街共 4 页），大厅里只占一张卡片 |
| 存在性校验 | 逐条 `GetFileAttributesW`（含 `modes`），缺失自动标灰并说明原因 |
| 单 WebView2 | 大厅页与网页游戏都在同一个 `ICoreWebView2` 里导航；`NewWindowRequested` 拦下 —— 本地页面回落到本实例，外链交给系统浏览器 |
| 无原生工具条 | 窗口客户区只有 WebView2；界面（侧栏/搜索/收藏/最近游玩/排序）全部由页面自己画 |
| 返回大厅 | `AddScriptToExecuteOnDocumentCreated` 注入顶部浮条（默认隐藏，鼠标到顶部才滑出），另有 `F1`/`Alt+←` 加速键 |
| 本地内容同源 | `SetVirtualHostNameToFolderMapping("hall.local", exe目录, ALLOW)` → `https://hall.local/`；失败自动退回 `file://` + 百分号编码（`--file` 强制旧基址） |
| 存档迁移 | 换 origin 会让旧 `file://` 存档读不到，所以首次启动做一次性迁移（读出 9 个键，含 3 档存档位 `…_slot / …_s / …_s2` → 写新 origin → 落标记文件 `_runtime\profile\hall_origin_migrated_v1`）；失败/8s 超时只跳过，绝不挡路 |
| 外观 | 深色窗口背景 + `DefaultBackgroundColor`，无白闪；`AreBrowserAcceleratorKeysEnabled=FALSE`（`F5`/`Ctrl+R` 不会在战斗中刷新游戏） |
| 优雅降级 | 无 Runtime 或 40s 起不来 → 弹明确错误框后退出（只保留 WebView2 版，不再降级到浏览器） |
| 位数 | 默认编 **32 位(x86)**：32 位 Windows 原生跑、64 位 Windows 走 WOW64，一套产物覆盖两种系统；WebView2 加载器静态链入、`/MT` 静态 CRT，**不需要 `WebView2Loader.dll`**，也不依赖 VC++ 运行库（`build_game_hall.bat x64` 可编 64 位） |
| 自检 | `--selftest [--vhost\|--file]` 打印 origin / 位数（`arch=x86`）/ localStorage 同源情况 / 卡片模式数量，退出码 0/1；`--probe-all` 逐个打开**所有**网页游戏并报标题/正文长度/canvas 尺寸/JS 错误数（含 `modes` 子页面）；`--probe <相对路径>` 只测一个页面；`--export` 只生成 `_runtime\hall.html` 不弹窗 |
| 探针模式 | 探针/自检时会注入 `window.__hallProbeMode`，shim 据此把 `alert/confirm/prompt` 换成"记录 + 默认回答"——否则一个加载期的 `confirm` 就会让探针永远等不到 `load`（俄罗斯方块的「检测到未完成游戏，是否恢复？」正是如此）。正常游玩完全不干预 |

### 构建

```bat
Z:\Root\_dev\cpp\build_game_hall.bat        :: 默认 32 位(x86)
Z:\Root\_dev\cpp\build_game_hall.bat x64    :: 想编 64 位时
```

- 编译器：MSVC（`C:\Users\Admin\New\VC\Auxiliary\Build\vcvarsall.bat x86`；64 位版走 `vcvarsall.bat x64`），
  SDK 用 `_dev\cpp\wv2sdk\`（已解包）
- 必须 `/utf-8`（源码含中文）、`/MT`（静态 CRT）；**静态链入 `WebView2LoaderStatic.lib`**（x86/x64 各一份），
  链接 `user32 shell32 ole32 gdi32 shlwapi version advapi32`
- 产物只有 `Z:\Root\游戏大厅.exe`：**不需要** `WebView2Loader.dll`，也不依赖 VC++ 运行库；
  32 位产物在 32 位系统原生跑、64 位系统走 WOW64 跑
- 流程：`build_game_hall.bat` 编译到 ASCII 名 `_build_hall.exe`，再由 `_dev\cpp\rename_hall.js`
  改成中文交付名（**读 PE 头核对位数**，默认期望 x86，不符直接构建失败），并调用 `--export` 刷新
  `Z:\Root\_runtime\hall.html`（宿主生成的运行时页面，供 `_dev\tests\` 审计与排查；
  **不产出可双击的静态大厅页**）
  （cmd 批处理无法安全携带中文路径，改名与导出交给 Node）
- 注意：`rename_hall.js` 把子进程 stdout 重定向到**文件**而不是管道 —— 某些受限宿主里
  `stdio:'pipe'` 会因 EPERM 失败，落盘再读既稳又能留日志

### 源码结构

| 文件 | 作用 |
|---|---|
| `GameHall.cpp` | 宿主：极简 JSON 读取器、`loadManifest`/`fallbackHall`、URL 与百分号编码、注入数据 JSON、动作（网页/EXE/文件夹/重扫）、WebView2 初始化与事件（消息桥/导航完成/新窗口/加速键）、返回条注入脚本、`--selftest` 探针、白屏兜底 |
| `HallPage.hpp` | 大厅页面模板（600+ 行 HTML/CSS/JS）：侧栏分组/收藏/最近游玩、搜索、排序、卡片网格、纯 CSS 封面、空状态、Toast、键盘导航、localStorage 偏好 |
| `build_game_hall.bat` / `rename_hall.js` | 一键构建 + 改名 + 刷新 `_runtime\hall.html` |

### 宿主 ↔ 页面消息协议

页面通过 `window.chrome.webview.postMessage(...)` 上行，宿主用 `PostWebMessageAsString`
下行（`toast|<ok\|bad\|warn>|<文本>`）：

| 消息 | 含义 |
|---|---|
| `web:<gameId>` | 在大厅窗口内打开该游戏的 `path` |
| `web:<gameId>:<modeId>` | 直接打开该游戏的某个 `modes` 子页面 |
| `exe:<gameId>` | 启动本地程序（宿主 `ShellExecuteW`，成功/失败回一条 toast） |
| `reload` | 重新读取 `games.json` 并重绘 |
| `folder:game` / `folder:game/程序` | 打开 `game\` / `game\程序\`（宿主把 `/` 归一成 `\`，找不到就退回 `game\`） |
| `hall` | 返回大厅（浮条按钮） |

## 二、旧版大厅（已归档，保留备查）

| 文件 | 类型 | 归档位置 |
|---|---|---|
| `GameLobby_win32.cpp` → `游戏大厅.exe`（旧） | Win32 原生，网页游戏丢给系统浏览器 | `_dev\cpp\_legacy_lobby\` |
| `GameLobby_edge.cpp` | Edge `--app` 独立窗口 | `_dev\cpp\_legacy_lobby\` |
| `WebView2Lobby.cpp` | WebView2 内嵌，游戏列表硬编码 | `_dev\cpp\_legacy_lobby\` |
| `build_webview2.bat` | 旧 WebView2 版构建 | `_dev\cpp\_legacy_lobby\` |

`Z:\Root\` 下不再有 `游戏大厅_next.exe` / `game_hall_next.exe` / 旧 `游戏大厅.exe`；
**只有 `游戏大厅.exe` 一个大厅程序**。旧源码要重新编译可参考归档里的 `build_webview2.bat`
（MSYS2 g++ 与 MSVC 两条路都在文件头注释里）。

## 三、`_dev\cpp\` 目录内容一览

```
GameHall.cpp            大厅宿主源码(当前唯一)
HallPage.hpp            大厅页面模板(当前唯一)
build_game_hall.bat     一键构建
rename_hall.js          构建收尾: ASCII 产物 -> 中文交付名 + 刷新 _runtime\hall.html
wv2sdk\                 已解包的 Microsoft.Web.WebView2 SDK(头文件 + x86/x64/arm64 三套 WebView2Loader)
_legacy_lobby\          旧版大厅源码与旧产物(不再维护)
如果你被困在了同一天.cpp / 狼人杀.cpp / 猫国建设者.cpp   三个 EXE 小游戏的源码(丧尸末日无源码)
```
