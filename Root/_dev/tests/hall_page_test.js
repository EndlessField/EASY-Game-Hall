// ============================================================================
// 游戏大厅页面审计(离屏运行, 不需要浏览器)
// ----------------------------------------------------------------------------
// 大厅页是 C++ 宿主生成的 Z:\Root\_runtime\hall.html(运行时产物), 里面注入了一份清单 JSON。
// 这里用最小 DOM 桩在 Node 沙箱里把它跑起来, 校验:
//   1. 卡片渲染: 数量、主打卡、缺失文件提示;
//   2. 「交火」四个页面**只占一张卡片**, 四个页面是它的四个模式按钮;
//   3. 侧栏分组 / 收藏 / 最近游玩 的计数与过滤;
//   4. 搜索与空状态;
//   5. 点击卡片 -> 宿主消息协议(web:<id>[:<mode>] / exe:<id>)正确;
//   6. 页面零网络依赖, 本地资源(本地 FontAwesome)齐全。
// 该文件不联网、不依赖任何 npm 包。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');          // Z:\Root (本文件位于 Z:\Root\_dev\tests\)
const { buildHallPage } = require('./_hall_build.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// 直接按宿主的规则组装页面(模板 + games.json), 不依赖预先跑过 exe
let raw = '';
try { raw = buildHallPage(ROOT); } catch (e) { }
ok(!!raw && raw.indexOf('<!DOCTYPE html>') === 0, '可由页面模板 + games.json 组装出大厅页 (' + raw.length + ' 字节)');
if (!raw) { console.log('\n' + pass + ' 通过, ' + fail + ' 失败'); process.exit(1); }

/* ---------------- 最小 DOM 桩 ---------------- */
function makeEl(tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    innerHTML: '', textContent: '', value: '', className: '', hidden: false,
    title: '', type: '', disabled: false, onclick: null,
    style: {},
    _listeners: {}, _qcache: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) { const on = (force === undefined) ? !this._s.has(c) : !!force; on ? this._s.add(c) : this._s.delete(c); return on; }
    },
    addEventListener(k, fn) { (this._listeners[k] = this._listeners[k] || []).push(fn); },
    appendChild() { }, setAttribute() { }, hasAttribute() { return false; },
    focus() { }, scrollIntoView() { },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; },
    querySelector() { return makeEl('i'); },
    querySelectorAll(sel) {
      const key = sel + '|' + this.innerHTML;
      if (this._qcache[key]) return this._qcache[key];
      let out = [];
      if (sel === 'button') out = scan(this.innerHTML, /<button\b([^>]*)>/g);
      else if (sel === '.card') out = scan(this.innerHTML, /<article\b([^>]*)>/g);
      this._qcache[key] = out;
      return out;
    }
  };
  return el;
}
function scan(html, re) {
  const out = []; let m;
  re.lastIndex = 0;
  while ((m = re.exec(html)) !== null) out.push(attrStub(m[1]));
  return out;
}
function attrStub(attrs) {
  const map = {};
  attrs.replace(/([a-zA-Z0-9_-]+)="([^"]*)"/g, (_, k, v) => { map[k] = v; return ''; });
  const el = makeEl('stub');
  el.getAttribute = (k) => (k in map ? map[k] : null);
  el.classList.contains = (c) => String(map['class'] || '').split(/\s+/).indexOf(c) >= 0;
  return el;
}
function makeDoc() {
  const cache = {};
  const doc = {
    title: '',
    activeElement: { tagName: 'BODY' },
    getElementById(id) { return cache[id] || (cache[id] = makeEl('div', id)); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() { },
    createElement(t) { return makeEl(t); },
    documentElement: { hasAttribute() { return false; }, appendChild() { } },
    _cache: cache
  };
  return doc;
}
function makeLS() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m
  };
}

/* ---------------- 跑一遍页面脚本 ---------------- */
function runPage(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const posted = [];
  const sandbox = {
    console, setTimeout, clearTimeout, JSON, Date, Math, parseInt, parseFloat, isNaN, String, Number, Object, Array, RegExp, Error,
    document: makeDoc(),
    localStorage: makeLS(),
    location: { href: '', origin: 'file://', protocol: 'file:' },
    chrome: {
      webview: {
        postMessage(msg) { posted.push(msg); },
        addEventListener() { }
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox, { filename: 'hall_page.js' });
  return { sb: sandbox, posted, doc: sandbox.document };
}

const R = runPage(raw);
ok(!!R, '页面内联脚本可执行(无异常)');
if (!R) { console.log('\n' + pass + ' 通过, ' + fail + ' 失败'); process.exit(1); }

const HALL = R.sb.window.__HALL__;
const grid = R.doc.getElementById('grid');
const nav = R.doc.getElementById('nav');
const q = R.doc.getElementById('q');

/* ---------------- 1. 清单结构 ---------------- */
const breachCards = (grid.innerHTML.match(/data-id="breach"/g) || []).length;
ok(breachCards === 1, '「交火」在网格里只占 1 张卡片 (实际 ' + breachCards + ')');
const otherBreach = HALL.games.filter(g => /^breach-/.test(g.id) || /breach/i.test(g.id)).length;
ok(otherBreach === 1, '清单里 id 含 breach 的条目只有 1 条 (实际 ' + otherBreach + ')');
const hero = HALL.games.filter(g => g.featured);
ok(hero.length === 1 && hero[0].id === 'breach', '主打卡片是「交火」');
const bm = (HALL.games.filter(g => g.id === 'breach')[0] || {}).modes || [];
ok(bm.length === 4, '交火含 4 个子页面/modes (主页/整备大厅/战役/长街)');
ok(bm.map(m => m.path).join(',').indexOf('game/breach/index.html') >= 0 &&
   bm.map(m => m.path).join(',').indexOf('game/breach/game/breach.html') >= 0 &&
   bm.map(m => m.path).join(',').indexOf('game/breach/game/hub.html') >= 0 &&
   bm.map(m => m.path).join(',').indexOf('game/breach/game/street.html') >= 0, '四个子页面路径齐全');

/* ---------------- 2. 渲染 ---------------- */
function countCards(html) { return (html.match(/<article class="card/g) || []).length; }
ok(countCards(grid.innerHTML) === HALL.games.length,
   '网格渲染出全部 ' + HALL.games.length + ' 张卡片');
ok(/card hero/.test(grid.innerHTML), '存在跨两列的主打卡片样式 (card hero)');
ok((grid.innerHTML.match(/data-mode=/g) || []).length === 4, '主打卡片渲染出 4 个模式按钮');
ok(R.doc.getElementById('crumbCount').textContent.indexOf(String(HALL.games.length)) >= 0,
   '顶部计数显示 ' + HALL.games.length + ' 款游戏');
ok((nav.innerHTML.match(/data-view=/g) || []).length === 5,
   '侧栏 = 全部 + 2 个分组 + 收藏 + 最近游玩');

const webN = HALL.games.filter(g => g.kind === 'web').length;
const exeN = HALL.games.filter(g => g.kind === 'exe').length;
ok(HALL.groups.length === 2 && webN === 5 && exeN === 4,
   '分组与数量: 网页 ' + webN + ' 款(四页合一后) + 本地程序 ' + exeN + ' 款');

/* ---------------- 3. 侧栏分组 / 收藏 / 最近 ---------------- */
const navBtns = nav.querySelectorAll('button');
const byView = {};
navBtns.forEach(b => { byView[b.getAttribute('data-view')] = b; });
ok(nav.innerHTML.indexOf('网页游戏') >= 0 && nav.innerHTML.indexOf('本地程序') >= 0 &&
   nav.innerHTML.indexOf('收藏') >= 0 && nav.innerHTML.indexOf('最近游玩') >= 0,
   '侧栏包含分组、收藏与最近游玩入口');
byView['web'].onclick && byView['web'].onclick();
ok(countCards(grid.innerHTML) === webN, '切到「网页游戏」后只剩 ' + webN + ' 张卡片');
byView['exe'].onclick && byView['exe'].onclick();
ok(countCards(grid.innerHTML) === exeN, '切到「本地程序」后只剩 ' + exeN + ' 张卡片');
byView['all'].onclick && byView['all'].onclick();
ok(countCards(grid.innerHTML) === HALL.games.length, '切回「全部游戏」恢复 ' + HALL.games.length + ' 张');

/* ---------------- 4. 搜索 / 空状态 ---------------- */
q.value = '贪吃';
R.sb.window.__hallApi.render();
ok(countCards(grid.innerHTML) === 1 && /贪吃蛇/.test(grid.innerHTML), '搜索「贪吃」只留下贪吃蛇');
q.value = '战术';
R.sb.window.__hallApi.render();
ok(countCards(grid.innerHTML) === 1 && /交火/.test(grid.innerHTML), '按标签/说明搜索能命中交火');
q.value = 'zzz不存在zzz';
R.sb.window.__hallApi.render();
ok(/show/.test(R.doc.getElementById('empty').className), '无结果时显示空状态');
q.value = '';
R.sb.window.__hallApi.render();
ok(countCards(grid.innerHTML) === HALL.games.length, '清空搜索后恢复全部卡片');

/* ---------------- 5. 宿主消息协议 ---------------- */
function clickCard(id, mode) {
  const handler = (grid._listeners['click'] || [])[0];
  if (!handler) return false;
  const card = attrStub('data-id="' + id + '"');
  const target = {
    closest(sel) {
      if (sel === '[data-fav]') return null;
      if (sel === '[data-mode]') return mode ? attrStub('data-mode="' + mode + '"') : null;
      if (sel === '.card') return card;
      return null;
    }
  };
  handler({ target });
  return true;
}
R.posted.length = 0;
clickCard('breach');
ok(R.posted[R.posted.length - 1] === 'web:breach', '点主打卡片 -> 宿主收到 web:breach');
R.posted.length = 0;
clickCard('breach', 'campaign');
ok(R.posted[R.posted.length - 1] === 'web:breach:campaign', '点「战役」模式 -> web:breach:campaign');
R.posted.length = 0;
clickCard('breach', 'street');
ok(R.posted[R.posted.length - 1] === 'web:breach:street', '点「丧尸围城」模式 -> web:breach:street');
R.posted.length = 0;
clickCard('werewolf');
ok(R.posted[R.posted.length - 1] === 'exe:werewolf', '点 EXE 卡片 -> exe:werewolf');
R.posted.length = 0;
R.sb.window.__hallApi.launch(HALL.games.filter(g => g.id === 'breach')[0], bm[1]);
ok(R.posted[R.posted.length - 1] === 'web:breach:hub', '直接进入「战前准备」-> web:breach:hub');
ok(!!R.sb.window.__hallApi.prefs, '大厅暴露了 __hallApi(自检/回归用)');

/* ---------------- 6. 离线与本地依赖 ---------------- */
const refs = [];
raw.replace(/(href|src)\s*=\s*["']([^"']+)["']/gi, (_, a, v) => { refs.push(v); return ''; });
const remote = refs.filter(v => /^[a-z]+:\/\//i.test(v) || v.startsWith('//'));
ok(remote.length === 0, '大厅页零网络引用' + (remote.length ? ' -> ' + JSON.stringify(remote) : ''));
const local = refs.filter(v => !/^(data:|javascript:|#)/i.test(v));
const hallDir = path.join(ROOT, '_runtime');          // 大厅页住在 _runtime\ 下
const missing = local.filter(v => !fs.existsSync(path.resolve(hallDir, v.split('?')[0].split('#')[0])));
ok(missing.length === 0, '大厅页本地依赖齐全 (' + local.length + ' 个)' + (missing.length ? ' 缺失: ' + JSON.stringify(missing) : ''));

/* ---------------- 7. 缺文件的兜底 ---------------- */
const lines = raw.split('\n');
const li = lines.findIndex(l => l.indexOf('window.__HALL__ = ') === 0);
ok(li >= 0, '大厅页注入了清单数据');
if (li >= 0) {
  const data = JSON.parse(lines[li].replace('window.__HALL__ = ', '').replace(/;\s*$/, ''));
  data.games = data.games.map(g => (g.id === 'snake' ? Object.assign({}, g, { exists: false }) : g));
  lines[li] = 'window.__HALL__ = ' + JSON.stringify(data) + ';';
  const R2 = runPage(lines.join('\n'));
  const g2 = R2.doc.getElementById('grid').innerHTML;
  ok(/card miss/.test(g2), '文件缺失的游戏卡片带 miss 标记');
  ok(/文件缺失/.test(g2), '缺失卡片给出「文件缺失」提示与路径');
  R2.posted.length = 0;
  const h2 = (R2.doc.getElementById('grid')._listeners['click'] || [])[0];
  const card2 = attrStub('data-id="snake"');
  h2({ target: { closest: (s) => (s === '.card' ? card2 : null) } });
  ok(R2.posted.length === 0, '缺失文件时不会向宿主发启动消息');
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
