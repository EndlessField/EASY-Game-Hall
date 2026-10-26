离线组件目录（redist）
======================

仓库出于体积限制（GitHub 单文件 100 MB）没有放入这三个文件：

  MicrosoftEdgeWebView2RuntimeInstallerX64.exe
  MicrosoftEdgeWebView2RuntimeInstallerX86.exe
  360cse_23.0.1253.0.exe

需要生成“完整离线安装包”时，把它们放到本目录，然后运行：

  powershell -ExecutionPolicy Bypass -File ..\build.ps1

WebView2 Evergreen Standalone Installer 下载：
  https://developer.microsoft.com/microsoft-edge/webview2/
  选择 x64 / x86 的 Evergreen Standalone Installer。

360cse（360 极速浏览器）可从 360 官网获取；文件名保持 360cse_*.exe 即可被识别。