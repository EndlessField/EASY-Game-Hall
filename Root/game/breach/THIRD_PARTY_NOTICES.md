# 第三方资源声明

本项目只分发一份第三方资源：**FontAwesome Free 7.3.1**（本地图标字体）。除此之外，四个游戏页面不引用任何外部字体、图片、脚本、样式表或 CDN。

## FontAwesome Free 7.3.1

- 来源：<https://fontawesome.com>（Font Awesome Free，7.3.1 版发行包）
- 原作者：Fonticons, Inc.
- 授权（该发行包内 `LICENSE.txt` 的原始声明）：
  - **图标**（Icons）：Creative Commons Attribution 4.0 International（CC BY 4.0）
  - **字体**（Fonts）：SIL Open Font License 1.1（SIL OFL 1.1）
  - **代码**（Code）：MIT License
- 完整授权文本随包分发在 [`fontawesome-free-7.3.1-web/LICENSE.txt`](fontawesome-free-7.3.1-web/LICENSE.txt)，**请连同该文件一起分发**。

### 本仓库实际提交的文件

游戏运行只需要下面 5 个文件（四个页面通过相对路径 `<link>` 引用 `css/all.min.css`，样式表内部再引用 4 个 `.woff2`）：

```
fontawesome-free-7.3.1-web/
  LICENSE.txt
  css/all.min.css
  webfonts/fa-brands-400.woff2
  webfonts/fa-regular-400.woff2
  webfonts/fa-solid-900.woff2
  webfonts/fa-v4compatibility.woff2
```

完整的 7.3.1 免费版发行包还有 `js/`、`scss/`、`svgs/`、`sprites/`、`metadata/` 等目录（约 28.8 MB），因为运行时不引用，**没有提交进仓库**（`.gitignore` 排除）。需要时从 <https://fontawesome.com/download> 下载同版本免费版，把缺的目录放回 `fontawesome-free-7.3.1-web/` 即可，游戏代码无需改动。

### 修改说明与署名

- 未修改字体文件与样式表（逐字节原样分发）。
- 图标选择与排布属本项目原创（四个页面共用 150+ 个图标），但图标本身的著作权归 Fonticons, Inc.。
- 按 CC BY 4.0 的要求，此处给出署名：**Icons by Font Awesome Free (<https://fontawesome.com>), CC BY 4.0**。
- `.uiwork/build-package.ps1` 打包时会把 FontAwesome 授权文件与裁剪说明（`.uiwork/pkg/打包说明.txt`）一并放进发布包。

## 其他

- 游戏内的音效由 WebAudio **实时合成**，不含任何采样文件。
- 无音频文件、无图片素材、无第三方 JS 库、无 web 字体（`@font-face` 由 FontAwesome 样式表内部声明，指向本地 `.woff2`）。
- `MicrosoftEdgeWebView2RuntimeInstallerX86.exe`（微软官方离线安装器）只用于可选的 Windows 安装包，**不入库、不属于本项目**。
