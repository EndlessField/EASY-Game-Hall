# 交火 · 户型图红蓝对抗

> **BREACH · Floorplan Red-vs-Blue** —— 一款《破门而入》(Door Kickers) 风格的室内战术射击小游戏。
>
> **纯前端 · 零依赖 · 零联网 · 断网可玩**：四个自包含单文件网页 + 一份本地 FontAwesome 字体。没有构建步骤、没有 `node_modules`、不打任何网络请求，双击 `index.html` 就能玩。

当前版本 **v3.5.1**（手机战斗画面横屏 + 移动端 UI 重写；v0.1.0 之后版本号回到 3.x 序列）· 许可证 [MIT](LICENSE) · 25 个断言测试守门

**在线试玩** → <https://endlessfield.github.io/breach-door-cqb/>（GitHub Pages，纯静态、零后端）

## 截图

| 主页 | 整备大厅 |
|---|---|
| ![主页](docs/screenshots/01-home.png) | ![整备大厅](docs/screenshots/04-armory.png) |

| 战前准备 | 长街尸潮 |
|---|---|
| ![战前准备](docs/screenshots/02-briefing.png) | ![长街尸潮](docs/screenshots/05-street.png) |

## 这是什么

一张户型图上打一场红蓝对抗。你带 2 台友军机器人从西侧入户，肃清东户里 4~6 台敌方机器人（按难度）。

- **地图按真实空间逻辑建模**，不是"房间方阵"。比例尺约 `1px ≈ 1cm`：一梯两户板式住宅（三室两厅一厨一卫＋南阳台）、仓库（双深货架＋3m 叉车巷道＋装卸月台）、工厂（西进东出的工艺动线）、写字楼（中央走廊＋独立单元）、地下车库（垂直式车位＋单行车道＋柱网）。门宽 0.8~1.3m、走廊 0.8~1.6m 都是照着现实尺寸摆的。
- **真实视线**：锥形视野 + 墙体/关门遮挡 + 战争迷雾 + 敌人脱离视野后的"最后目击"记忆标记。枪声会暴露位置，敌人会循声查探、破门突入。
- **战术 AI**：BFS 寻路（转角路点 + 轴分离滑墙穿门）、找掩体、侧翼包抄、反应延迟、低血撤退、掩护射击、倒地救援、听声查探。你可以用 `1`/`2`/`3` 选人，`X` 进指令模式给队友下移动命令。
- **你的战术工具**：破墙锤（砸开内隔墙 = 自选进攻路线）、声源诱饵（把守军调到另一个方向）、配电箱断电（全场变暗、双方视野同时收缩）、烟雾弹、炸药包（顺便炸毁家具，碰撞与寻路自动重建）。
- **八种枪**：突击步枪 / 冲锋枪 / 霰弹枪 / 狙击枪（右键开镜 2.2 倍）/ 轻机枪 / 精确射手步枪 + 手枪副武器（`Q` 随时切换），各自独立弹匣与换弹进度。
- **成长循环**：军功点 → 18 项永久升级 → 军衔晋升（等级无上限）；15 项成就；每日挑战；3 档档案；本地排行榜（战役 + 长街各一张）。
- **可选账户**：页面内自实现的 SHA-256 原语 → 口令派生 → 本地加密存储（SHA-256-CTR + HMAC 信封）。不建账户就与旧版完全一致 —— 账户是可选层，不会把人挡在门外。
- **战后作业图**：整局走位画成一张工程图（红蓝轨迹、阵亡叉号、交火圈号、比例尺、图签），可一键导出 PNG。
- **独立玩法《丧尸围城 · 长街尸潮》**：横向长街波次防守。无限波次、波后补给、每 3 波一次三选一强化、每 5 波尸王、波间可搭沙袋工事、每 5 波开放一次撤离窗口。队友有名字，阵亡即永久损失，可花指挥点招募。

## 开始游玩

### 方式一 · 在线试玩（GitHub Pages）

```
https://endlessfield.github.io/breach-door-cqb/
```

纯静态托管，零后端。`main` 上有推送就会自动跑 `.github/workflows/pages.yml` 重新部署（只发布 `index.html`、`game/` 与裁剪过的 `fontawesome-free-7.3.1-web/`，`tests/`、`.uiwork/` 不上线）。

### 方式二 · 本地双击（最省事）

1. 下载本仓库（`Code → Download ZIP`）并解压；
2. 双击根目录 `index.html`。

地图、AI、音效（WebAudio 合成）、存档（localStorage）全部本地实现，`file://` 协议下一切照常 —— **不需要服务器，也不会联网**。想用 HTTP 起本地服务也行：`npm start`（等价于 `node tools/serve.js`，零依赖）。

> 别把 `index.html` 单独拷出来 —— 它依赖同级的 `game/`、`photo.ico` 和 `fontawesome-free-7.3.1-web/`。

### 方式三 · Windows 安装包（`install.bat`）

发布包根目录带一个 `install.bat`（源码在 `.uiwork/pkg/install.bat`，由 `.uiwork/build-package.ps1` 打进包）：

- 询问安装目录（默认 `%LOCALAPPDATA%\交火`），已存在就按"更新"处理；
- 比对 `VERSION.txt`，装**旧**版本时会要求输入 `Y` 二次确认；
- 生成桌面快捷方式 `交火.lnk`（图标取自 `photo.ico`）；
- WebView2 运行时是可选的（游戏本身是纯网页），缺了不阻断安装。

自动化参数：`install.bat /dir:"<目录>" [/yes]`，或环境变量 `CF_DIR` / `CF_YES=1`。构建发布包：

```powershell
powershell -ExecutionPolicy Bypass -File .uiwork\build-package.ps1              # 版本号自动取 VERSION.txt，产出 交火_v3.5.1.zip
powershell -ExecutionPolicy Bypass -File .uiwork\build-package.ps1 -NoWebView2  # 不并入 187MB 的 WebView2 离线安装器（约 5MB）
```

（装了 PowerShell 7 的话把 `powershell -ExecutionPolicy Bypass -File` 换成 `pwsh -File` 即可。）

## 操作

> 默认键位，暂停菜单里 22 项全部可改（改完立即生效并持久化）。

| 按键 | 功能 |
|---|---|
| `WASD` / `Shift` | 移动 / 奔跑 |
| 鼠标 / 左键 | 瞄准 / 射击 |
| 右键 | 开镜（点击切换，可改为按住式） |
| `G` / `F` | 手雷 / 闪光弹（按住蓄力看轨迹） |
| `T` / `Y` | 烟雾弹 / 炸药包 |
| `Z` | 声源诱饵 |
| `H` | 破墙锤（贴内隔墙按住 1.4 秒） |
| `E` / `R` | 互交（开关门、拉闸）/ 换弹 |
| `Q` | 主武器 ↔ 手枪 |
| `1` `2` `3` | 选 队友A / 队友B / 全部（训练场里是切六把主武器） |
| `X` | 指令模式开关（左键点地 = 移动命令） |
| `C` / `V` / `B` | 跟随我 / 固守原地 / 集火准星目标 |
| 滚轮 / 中键拖动 | 缩放 / 平移视角 |
| `空格` | 暂停 |

长街尸潮页另有两个专属动作：`B` 搭沙袋工事、`V`（或滚轮）旋转工事朝向 15°。

## 界面视觉系统

四个页面共用一套纯 CSS 视觉语言，世界设定是"一叠摊在制图台上的**突入作业图纸**"：深普鲁士蓝纸面 + 象牙白墨线，青只给选中与主操作，黄蜡笔只给军功点/星级/教程，红蜡笔只给危险与阵亡。面板是图纸（图框 + 四角对位标记 + 图签栏 `图号 / 比例 / 张次`），数据是标注（尺寸链、引线、编号方块），状态用线型表达（实线 / 点划线 / 剖面线 / 反转实底）。没有背景图、不引外部字体，图标全部来自随包分发的本地 FontAwesome。

完整设计令牌与改 UI 的红线（哪些 id、类名、章节标记被测试直接扫描）见 [AI_README.md](AI_README.md) 的「界面视觉系统」与「改 UI 的红线」两节。

## 工程与测试

代码全部是**单个 HTML 文件内的原生 JS**（没有框架、没有打包器、没有 CDN），《交火》最难的部分不是画面而是"没有构建系统时的可维护性"，所以这个仓库把力气花在门禁上：

```bash
npm test          # = node tests/run_all.js，跑全部 25 个断言脚本（约 70s）
npm run test:verbose
```

- **`tests/` 里的测试不装任何依赖**：它们把页面的 `<script>` 送进 Node 的 `vm` 沙箱，用假的 canvas / WebAudio / localStorage 跑真实游戏逻辑，或直接读源码做结构断言。
- **`offline_test.js` 守离线**：任何 `http(s)://`、`@import`、`url(`、`fetch(`、`<script src=>`、外部字体与 emoji 依赖都会让它当场变红 —— 项目的"零联网"是**被自动检查的**，不是口头承诺。
- **`preview_test.js` 守地图一致性**：主页与整备大厅的地图预览数据不是手写的，由游戏内的地图构建器导出并逐字节比对。
- **`doc_test.js` 守文档**：每个页面的章节标记必须与文件头目录一一对应，README 声明的测试数量必须等于实际数量。
- **`version_test.js` 守版本**：四页图签栏的 `REV. 版次`、`VERSION.txt`、`package.json`、`CHANGELOG.md`、打包脚本默认版本必须一致。
- 另有四个**探针**（不是门禁，恒退出 0）：迷像素级渐变指纹、地图可走性 ASCII 图、地图转 PNG、长街卡死体检。

改代码前请先读 [AI_README.md](AI_README.md) —— 那里有完整的机制说明、参数分布和"改 UI 的红线"清单。

## 目录结构

```
index.html                      主页（图文教程 / 战绩速览 / 存档槽位 / 四大入口）
game/
  hub.html                      整备大厅（装备 / 难度 / 地图 / 18 项升级 / 成就 / 排行榜）
  breach.html                   游戏本体（战斗 + 战术指令 + 7 步互动教程 + 设置与改键）
  street.html                   独立玩法（长街波次防守）
fontawesome-free-7.3.1-web/     本地图标字体（仓库只提交运行必需的 5 个文件）
tests/                          25 个零依赖断言脚本 + 4 个探针
.uiwork/                        UI 作业工具与验证留档（安装器源码、打包脚本、约束文档、截图）
tools/serve.js                  零依赖本地静态服务器（`npm start`）
docs/
  PUBLISH.md                    发布到 GitHub 的完整步骤
  screenshots/                  截图
.github/workflows/              CI（测试）+ Pages（部署）
AI_README.md                    开发文档：机制 / 参数 / 约束 / 测试清单
CHANGELOG.md                    版本变更
```

## 兼容性

- 现代 Chromium / Firefox / Safari（桌面）。需要 Canvas 2D、WebAudio、`localStorage`、`crypto` 以上的基础能力。
- 移动端能打开但**没有触屏操作方案** —— 这是键鼠游戏。
- 安装包 `install.bat` 是 Windows 专用；网页形态跨平台。
- 存档只在你自己的浏览器里（`localStorage`），换机器/清站点数据会丢，重要进度用页面里的「导出存档」留备份（支持口令加密导出）。

## 文档

| 文件 | 内容 |
|---|---|
| [AI_README.md](AI_README.md) | 开发文档：全部玩法机制、数值参数位置、UI 设计系统、localStorage 协议、测试清单、改代码的红线 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |
| [docs/PUBLISH.md](docs/PUBLISH.md) | 从零把本仓库推上 GitHub 并开启 Pages / Release 的步骤 |
| [.uiwork/UI_CONSTRAINTS.md](.uiwork/UI_CONSTRAINTS.md) | 测试对四个页面 DOM/CSS 的硬约束全量清单 |
| [.uiwork/DOM_CONTRACT.md](.uiwork/DOM_CONTRACT.md) | JS 期望存在的 DOM 契约（id / 注入类名 / 覆盖层 / 图标清单） |

## 许可证

- **本项目代码与文案**：[MIT](LICENSE)。
- **图标字体**：FontAwesome Free 7.3.1 —— 图标 CC BY 4.0、字体 SIL OFL 1.1、代码 MIT，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [fontawesome-free-7.3.1-web/LICENSE.txt](fontawesome-free-7.3.1-web/LICENSE.txt)。

---

## English

**BREACH** is a Door-Kickers-style top-down tactical shooter that runs as four self-contained HTML files: zero dependencies, zero network requests, playable offline by double-clicking `index.html`. Five real-scale floorplans (apartment, warehouse, factory, office, garage), line-of-sight with fog of war and last-seen markers, BFS pathfinding AI with flanking and cover, wall breaching, power-cut, smoke and decoys, plus a separate endless zombie-defense mode. All game state lives in `localStorage`; `npm test` runs 25 dependency-free assertion suites that boot the real game code inside Node's `vm` sandbox. Licensed MIT (FontAwesome assets under their own licenses).
