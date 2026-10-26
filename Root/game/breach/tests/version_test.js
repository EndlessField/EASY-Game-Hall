// 版本号一致性(v0.1.0 起)
// 目的: 一个版本号散落在六七个地方, 手改必然漏一处 —— 让它漏了就红。
//   1. VERSION.txt 是唯一权威(形如 vX.Y.Z);
//   2. 四页图签栏「REV. 版次」必须等于它(index 有 4 张图、hub / street 各 1 张、breach 由 setTitleBlock 注入);
//   3. package.json / CHANGELOG.md / README.md / AI_README.md / 打包脚本默认值必须等于它;
//   4. install.bat 的"老安装版本探测"正则必须保持能读出这个串(不要退回写死版本号)。
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(DIR, p), 'utf8');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// ---------- 权威值 ----------
const version = read('VERSION.txt').trim();
console.log('权威版本(VERSION.txt): ' + version);
ok(/^v\d+\.\d+\.\d+$/.test(version), 'VERSION.txt 是 vX.Y.Z 形式 (' + version + ')');
ok(!/^\uFEFF/.test(version), 'VERSION.txt 无 BOM(安装器的 for /f 要读第一列)');

// ---------- 1. 四页图签栏 REV. 版次 ----------
const STATIC_PAGES = [
  ['index.html', 4],          // 任务简报 / 新手教程 / 老兵贴士 / 本地排行榜 四张图各有图签栏
  ['game/hub.html', 1],
  ['game/street.html', 1],
];
for (const [file, expected] of STATIC_PAGES) {
  const h = read(file);
  const revs = [...h.matchAll(/tb-v">(v\d[0-9.]*)</g)].map(m => m[1]);
  ok(revs.length === expected, file + ': 图签栏 REV 数量 = ' + revs.length + ' (' + revs.join(',') + ')');
  ok(revs.every(v => v === version), file + ': 图签栏 REV 全部等于 ' + version);
  const stale = [...h.matchAll(/tb-v">(v[0-9][0-9.]*)</g)].map(m => m[1]).filter(v => v !== version);
  ok(stale.length === 0, file + ': 没有残留的旧版本号 (' + (stale.join(',') || '无') + ')');
}

// breach.html 的图签是运行时注入的(data-tb="rev"), 版本号写在 setTitleBlock 里
{
  const h = read('game/breach.html');
  const m = h.match(/kind === 'rev'\)\s*v = '(v\d[0-9.]*)'/);
  ok(!!m, 'game/breach.html: 找到 setTitleBlock 里的 rev 分支');
  ok(m && m[1] === version, 'game/breach.html: rev 注入值等于 ' + version + ' (' + (m ? m[1] : '?') + ')');
  ok(h.indexOf('data-tb="rev"') >= 0, 'game/breach.html: 覆盖层仍带 data-tb="rev" 图签位');
}

// ---------- 2. 工程文件 ----------
{
  let pkg = null;
  try { pkg = JSON.parse(read('package.json')); } catch (e) { ok(false, 'package.json 可解析'); }
  if (pkg) {
    ok(pkg.version === version.slice(1),
      'package.json version 与 VERSION.txt 一致 (' + pkg.version + ' vs ' + version + ')');
    ok(/^node tests\/run_all\.js$/.test((pkg.scripts || {}).test || ''),
      'package.json 的 npm test 指向 tests/run_all.js');
  }
}

ok(read('CHANGELOG.md').indexOf('## [' + version + ']') >= 0, 'CHANGELOG.md 有 ' + version + ' 的条目');
ok(new RegExp('当前版本 \\*\\*' + version + '\\*\\*').test(read('README.md')),
  'README.md 顶部声明的当前版本一致');
ok(read('AI_README.md').indexOf('当前构建版本：' + version) >= 0,
  'AI_README.md 顶部声明的当前构建版本一致');

{
  // 打包脚本不写死版本号, 从 VERSION.txt 读(改了 VERSION.txt 就自动打对版本)
  const ps = read('.uiwork/build-package.ps1');
  ok(/param\(\s*\[string\]\$Version\s*=\s*''/.test(ps),
    '.uiwork/build-package.ps1 的 -Version 默认值为空(走 VERSION.txt)');
  ok(ps.indexOf('VERSION.txt') >= 0, '.uiwork/build-package.ps1 会读 VERSION.txt');
  const hard = [...ps.matchAll(/v\d+\.\d+\.\d+/g)].map(m => m[0]);
  ok(hard.length === 0, '打包脚本里没有写死的版本号 (' + (hard.join(',') || '无') + ')');
}

{
  const bat = fs.readFileSync(path.join(DIR, '.uiwork/pkg/install.bat'), 'latin1');   // GBK 文件按字节读, 只查 ASCII 片段
  ok(bat.indexOf('tb-v.>v[0-9][0-9.]*') >= 0,
    'install.bat 的版本探测仍是通用正则 tb-v.>v[0-9][0-9.]*(没有写死版本号)');
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nVERSION TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
