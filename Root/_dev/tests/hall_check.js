// ============================================================================
// 游戏大厅清单与网页游戏依赖审计
// ----------------------------------------------------------------------------
// 校验(不联网, 纯本地文件):
//   1. games.json 结构完整: 每款游戏 id/name/group/kind/path, id 唯一, group 已声明;
//   2. **一款游戏一个条目**: 多页面作品必须用 modes 子页面表达, 不许把同一作品的
//      几个页面拆成好几条 —— 曾经「交火」的四个页面就是散成四条卡片的;
//   3. 清单里的每个 path(含 modes.path)都真实存在;
//   4. 每个网页游戏(含 modes 子页面)的本地依赖(href/src)都存在;
//   5. EXE 游戏的 kind/path 一致; 分组统计; 生成的大厅页零网络依赖。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');   // Z:\Root (本文件位于 Z:\Root\_dev\tests\)
const MANIFEST = path.join(ROOT, 'games.json');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }
function abs(rel) { return path.join(ROOT, rel.split('/').join(path.sep)); }
function pageScript(html) { const m = html.match(/<script>([\s\S]*?)<\/script>/); return m ? m[1] : ''; }

// ---------- 1. 清单 ----------
ok(fs.existsSync(MANIFEST), 'games.json 存在 (' + MANIFEST + ')');
if (!fs.existsSync(MANIFEST)) { console.log('\n' + pass + ' 通过, ' + fail + ' 失败'); process.exit(1); }
let m = null;
try { m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) { console.log('FAIL: games.json 不是合法 JSON: ' + e.message); process.exit(1); }
ok(!!m && Array.isArray(m.games) && m.games.length > 0, 'games.json 含 games 数组 (' + (m.games ? m.games.length : 0) + ' 款)');
ok(Array.isArray(m.groups) && m.groups.length > 0, 'games.json 含 groups 分组声明');
ok(m.version >= 2, '清单版本 >= 2 (支持 modes 子页面) 实际 ' + m.version);

const groupIds = new Set((m.groups || []).map(g => g.id));
const seen = new Set();
for (const g of m.games) {
  const tag = '[' + (g.id || '?') + ']';
  ok(!!g.id && !!g.name && !!g.group && !!g.kind && !!g.path, tag + ' 必备字段齐全 (id/name/group/kind/path)');
  ok(!seen.has(g.id), tag + ' id 唯一');
  seen.add(g.id);
  ok(groupIds.has(g.group), tag + ' group 已在 groups 中声明 (' + g.group + ')');
  ok(g.kind === 'web' || g.kind === 'exe', tag + ' kind 合法 (' + g.kind + ')');
  if (g.kind === 'exe') ok(/\.exe$/i.test(g.path), tag + ' EXE 游戏的 path 指向 .exe');
  else ok(/\.html?$/i.test(g.path), tag + ' 网页游戏的 path 指向 .html');
  if (g.cover) ok(/^fa-[a-z0-9-]+$/.test(g.cover), tag + ' cover 是 FontAwesome 图标名 (' + g.cover + ')');
  if (g.accent) ok(/^#[0-9a-fA-F]{6}$/.test(g.accent), tag + ' accent 是 #RRGGBB (' + g.accent + ')');
  if (g.modes) {
    ok(Array.isArray(g.modes) && g.modes.length >= 1, tag + ' modes 是非空数组');
    const mid = new Set();
    for (const md of g.modes) {
      ok(!!md.id && !!md.name && !!md.path, tag + '.' + md.id + ' 子页面字段齐全 (id/name/path)');
      ok(!mid.has(md.id), tag + '.' + md.id + ' 子页面 id 唯一');
      mid.add(md.id);
      ok(/\.html?$/i.test(md.path), tag + '.' + md.id + ' 子页面指向 .html');
    }
  }
}

// ---------- 2. 一款游戏只占一条 ----------
const modePaths = new Set();
for (const g of m.games) for (const md of (g.modes || [])) modePaths.add(md.path.toLowerCase());
// 自身主页同时作为 modes.home 是允许的(卡片上的「从主页开始」); 这里只抓"别人的子页面被单列成条目"
const split = m.games.filter(g => modePaths.has(g.path.toLowerCase()) &&
  !(g.modes || []).some(md => md.path.toLowerCase() === g.path.toLowerCase()));
ok(split.length === 0, '没有把同一作品的子页面拆成独立条目' +
   (split.length ? ' -> ' + split.map(g => g.id + ':' + g.path).join(', ') : ''));
const withModes = m.games.filter(g => (g.modes || []).length > 1);
ok(withModes.length >= 1, '多页面作品用 modes 表达 (' + withModes.map(g => g.name + '×' + g.modes.length).join(', ') + ')');
const breach = m.games.filter(g => g.id === 'breach');
ok(breach.length === 1 && (breach[0].modes || []).length === 4,
   '「交火」是一款游戏、四个页面 (实际 ' + breach.length + ' 条 / ' +
   (breach[0] ? (breach[0].modes || []).length : 0) + ' 个页面)');
const featured = m.games.filter(g => g.featured);
ok(featured.length <= 1, '主打卡片最多一张 (' + featured.length + ')');

// ---------- 3. 文件存在性 ----------
const missing = [];
for (const g of m.games) {
  if (!fs.existsSync(abs(g.path))) missing.push(g.id + ' -> ' + g.path);
  for (const md of (g.modes || [])) if (!fs.existsSync(abs(md.path))) missing.push(g.id + '.' + md.id + ' -> ' + md.path);
}
ok(missing.length === 0, '清单中所有页面文件都存在' + (missing.length ? ' (缺失: ' + missing.join(', ') + ')' : ''));

// ---------- 4. 网页游戏的本地依赖 ----------
function localRefs(html) {
  const out = [];
  for (const attr of ['href', 'src']) {
    const re = new RegExp(attr + '\\s*=\\s*["\']([^"\']+)["\']', 'gi');
    let mm;
    while ((mm = re.exec(html)) !== null) {
      let v = mm[1].trim();
      if (!v) continue;
      if (/^(?:data:|javascript:|mailto:|#)/i.test(v)) continue;
      if (/^[a-z]+:\/\//i.test(v) || v.startsWith('//')) { out.push({ v, remote: true }); continue; }
      out.push({ v: v.split('?')[0].split('#')[0], remote: false });
    }
  }
  return out;
}
const pages = [];
for (const g of m.games) {
  if (g.kind !== 'web') continue;
  pages.push({ id: g.id, rel: g.path });
  for (const md of (g.modes || [])) pages.push({ id: g.id + '.' + md.id, rel: md.path });
}
let depCount = 0;
for (const p of pages) {
  const full = abs(p.rel);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const dir = path.dirname(full);
  const refs = localRefs(html);
  const remote = refs.filter(r => r.remote).map(r => r.v);
  ok(remote.length === 0, '[' + p.id + '] 无网络引用' + (remote.length ? ' -> ' + JSON.stringify(remote) : ''));
  const bad = [];
  for (const r of refs) {
    if (r.remote) continue;
    if (!fs.existsSync(path.resolve(dir, r.v))) bad.push(r.v);
  }
  depCount += refs.filter(r => !r.remote).length;
  ok(bad.length === 0, '[' + p.id + '] 本地依赖齐全' + (bad.length ? ' 缺失: ' + JSON.stringify(bad) : ''));
}

// ---------- 5. 大厅页(按宿主规则从模板 + games.json 组装, 不依赖运行时产物) ----------
let HALL_HTML = '';
try { HALL_HTML = require('./_hall_build.js').buildHallPage(ROOT); } catch (e) { }
ok(!!HALL_HTML && HALL_HTML.indexOf('<!DOCTYPE html>') === 0,
   '可由 cpp\\HallPage.hpp 模板 + games.json 组装出大厅页 (' + HALL_HTML.length + ' 字节)');
if (HALL_HTML) {
  const script = pageScript(HALL_HTML);
  ok(script.indexOf('window.__HALL__') >= 0, '大厅页注入清单数据');
  let data = null;
  try { data = JSON.parse(HALL_HTML.split('\n').filter(l => l.indexOf('window.__HALL__ = ') === 0)[0].replace('window.__HALL__ = ', '').replace(/;\s*$/, '')); } catch (e) { }
  ok(!!data && data.games.length === m.games.length, '大厅页里的游戏数与 games.json 一致 (' + (data ? data.games.length : '?') + ')');
  const refs = localRefs(HALL_HTML);
  const remote = refs.filter(r => r.remote).map(r => r.v);
  ok(remote.length === 0, '大厅页零网络引用' + (remote.length ? ' -> ' + JSON.stringify(remote) : ''));
  // 大厅页本身住在 _runtime\ 下, 所以它里面的相对依赖要相对 _runtime\ 解析
  const hallDir = path.join(ROOT, '_runtime');
  const bad = refs.filter(r => !r.remote).filter(r => !fs.existsSync(path.resolve(hallDir, r.v))).map(r => r.v);
  ok(bad.length === 0, '大厅页本地依赖齐全' + (bad.length ? ' 缺失: ' + JSON.stringify(bad) : ''));
}

// ---------- 6. 图标必须真的在本地 FontAwesome 里存在 ----------
// 卡片封面/侧栏/按钮全是本地图标字体, 写错一个类名就会得到一个空豆腐块 —— 死代码审计抓不到。
const FA_CSS = path.join(ROOT, 'game', 'lib', 'fontawesome-free-7.3.1-web', 'css', 'all.min.css');
if (fs.existsSync(FA_CSS) && HALL_HTML) {
  const css = fs.readFileSync(FA_CSS, 'utf8');
  const FA_STYLE = new Set(['fa-solid', 'fa-regular', 'fa-brands', 'fa-classic', 'fa-fw', 'fa-spin',
    'fa-pulse', 'fa-spin-reverse', 'fa-spin-pulse', 'fa-bounce', 'fa-beat', 'fa-fade', 'fa-shake',
    'fa-flip', 'fa-rotate-90', 'fa-rotate-180', 'fa-rotate-270', 'fa-sr-only', 'fa-xs', 'fa-sm',
    'fa-lg', 'fa-xl', 'fa-2x', 'fa-3x', 'fa-4x', 'fa-5x', 'fa-6x', 'fa-7x', 'fa-8x', 'fa-9x', 'fa-10x']);
  const used = new Set();
  const scan = (text) => {
    let mm;
    const re = /\bfa-[a-z0-9-]+/g;
    while ((mm = re.exec(text)) !== null) if (!FA_STYLE.has(mm[0])) used.add(mm[0]);
  };
  scan(HALL_HTML);
  for (const g of m.games) {
    if (g.cover) scan(g.cover);
    for (const md of (g.modes || [])) if (md.icon) scan(md.icon);
  }
  for (const gr of m.groups) if (gr.icon) scan(gr.icon);
  // FontAwesome 7 的图标定义形如 .fa-gamepad{--fa:"\f11b"} (别名组为 .fa-a,.fa-b{...})
  const hasIcon = (name) => new RegExp('\\.' + name + '(?=[{,:])').test(css);
  const badIcon = [...used].filter(c => !hasIcon(c));
  ok(badIcon.length === 0, '大厅用到的 ' + used.size + ' 个图标在本地 FontAwesome 里都存在' +
     (badIcon.length ? ' -> 缺失: ' + JSON.stringify(badIcon) : ''));
}

// ---------- 7. 宿主注入脚本: 探针模式必须接管阻塞式对话框 ----------
// 有游戏在**加载期**弹 confirm(俄罗斯方块: "检测到未完成游戏, 是否恢复?"),
// 阻塞式对话框会把页面的 load 事件一直挂住 —— 探针就永远等不到 NavigationCompleted。
// 所以宿主在探针模式下会先注入 __hallProbeMode, 由 shim 把 alert/confirm/prompt
// 换成"记录 + 默认回答"。这里把 shim 抠出来在沙箱里跑一遍, 确认两条路都对。
const GH_SRC = path.join(ROOT, '_dev', 'cpp', 'GameHall.cpp');
if (fs.existsSync(GH_SRC)) {
  const gh = fs.readFileSync(GH_SRC, 'utf8');
  const a = gh.indexOf('LR"SHIM(');
  const b = gh.indexOf(')SHIM"');
  ok(a >= 0 && b > a, 'GameHall.cpp 里能找到注入脚本 kShimScript');
  if (a >= 0 && b > a) {
    const shim = gh.slice(a + 'LR"SHIM('.length, b);
    function runShim(probeMode) {
      const el = { style: {}, setAttribute() { }, appendChild() { }, addEventListener() { }, querySelector() { return { className: '' }; } };
      const doc = {
        readyState: 'complete',
        documentElement: { hasAttribute: (n) => n === 'data-hall-page', appendChild() { } },
        getElementById: () => null, createElement: () => el, addEventListener() { }
      };
      const sb = { document: doc, console, setTimeout: () => 0, clearTimeout() { }, addEventListener() { } };
      sb.window = sb;
      sb.__hallProbeMode = probeMode;
      vm.createContext(sb);
      vm.runInContext(shim, sb, { filename: 'kShimScript' });
      return sb;
    }
    let s1 = null, s2 = null, err = '';
    try { s1 = runShim(true); s2 = runShim(false); } catch (e) { err = e.message; }
    ok(!err, 'shim 能在沙箱里执行' + (err ? ' (' + err + ')' : ''));
    if (s1 && s2) {
      ok(s1.confirm('检测到未完成游戏，是否恢复？') === false, '探针模式: confirm 直接返回 false, 不会挂住 load');
      ok(Array.isArray(s1.__hallDialogs) && s1.__hallDialogs.length === 1 &&
         s1.__hallDialogs[0].indexOf('检测到未完成游戏') >= 0, '探针模式: 对话框内容被记录下来');
      ok(typeof s1.alert === 'function', '探针模式: alert/prompt 同样被接管');
      ok(!s2.__hallDialogs, '正常游玩: 不接管对话框, 玩家该看到的弹窗照旧');
    }
  }
}

// ---------- 8. 分组统计 ----------
const webN = m.games.filter(g => g.kind === 'web').length;
const exeN = m.games.filter(g => g.kind === 'exe').length;
const pageN = pages.length;
ok(webN + exeN === m.games.length, '分组统计: 网页 ' + webN + ' 款 + 本地程序 ' + exeN + ' 款 = ' + m.games.length + ' 款');
console.log('  (网页页面共 ' + pageN + ' 个: ' + webN + ' 款游戏 + ' +
  (pageN - webN) + ' 个 modes 子页面; 本地依赖共审计 ' + depCount + ' 条)');

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
