// 构建收尾: ASCII 名产物 -> 中文交付名, 并刷新宿主生成的大厅页 _hall.html。
// 全程只有这一个大厅可执行文件: Z:\Root\游戏大厅.exe
//
// 说明: 不再产出独立的「游戏大厅.html」—— 大厅只保留 WebView2 版本。
//       _hall.html 是宿主每次启动都会重写的内部页面(也是 tests\ 审计的对象),
//       这里用 --export 在不开窗的情况下把它刷新一遍, 供测试与排查使用。
//
// 注意: 子进程 stdout 重定向到**文件**而不是管道 —— 某些受限宿主里 stdio:'pipe' 会因
//       EPERM 失败, 落盘再读既稳又能留日志。
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = 'Z:\\Root\\';
const src = ROOT + '_build_hall.exe';
const dst = ROOT + '游戏大厅.exe';

// 架构自检: 构建脚本传进来的目标架构必须和产物真的对得上 —— "兼容 32 位"这件事
// 不能只靠口头约定, 这里直接读 PE 头核对位数, 不符就让构建失败。
const wantArch = (process.argv[2] || 'x86').toLowerCase();
const MACHINE = { 0x014c: 'x86', 0x8664: 'x64', 0xaa64: 'arm64' };
function peArch(file) {
  const b = fs.readFileSync(file);
  const pe = b.readInt32LE(0x3c);
  return MACHINE[b.readUInt16LE(pe + 4)] || 'unknown';
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  fs.unlinkSync(src);
  const got = peArch(dst);
  console.log('已生成 ' + dst + ' (' + fs.statSync(dst).size + ' 字节, ' +
              (got === 'x86' ? '32 位 x86' : got) + ')');
  if (got !== wantArch) {
    console.log('!! 架构不符: 期望 ' + wantArch + ', 实际 ' + got + ' —— 这个大厅不能这样发布');
    process.exit(1);
  }
} else if (fs.existsSync(dst)) {
  const got = peArch(dst);
  console.log('复用已存在的 ' + dst + ' (' + fs.statSync(dst).size + ' 字节, ' +
              (got === 'x86' ? '32 位 x86' : got) + ')');
} else {
  console.log('!! 既没有 ' + src + ' 也没有 ' + dst);
  process.exit(1);
}

// 刷新宿主生成的大厅页(exe --export 只生成页面, 不弹窗)
const logPath = ROOT + '_export.log';
let out = '';
try {
  const fd = fs.openSync(logPath, 'w');
  try {
    execFileSync(dst, ['--export'], { stdio: ['ignore', fd, 'ignore'] });
  } finally {
    fs.closeSync(fd);
  }
  out = fs.readFileSync(logPath, 'utf8');
} catch (e) {
  console.log('提示: --export 未执行(' + String(e.message).split('\n')[0] + '), _hall.html 未刷新');
} finally {
  try { fs.unlinkSync(logPath); } catch (e) { }
}
if (out.trim()) console.log(out.trim());

const gen = ROOT + '_runtime\\hall.html';
if (fs.existsSync(gen)) console.log('已刷新 ' + gen + ' (' + fs.statSync(gen).size + ' 字节)');
else console.log('提示: 未生成 ' + gen);
