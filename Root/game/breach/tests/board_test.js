// 本地排行榜(v3.2 + 难度系数)回归测试:
//   ① 名次口径(榜单分 = 表现分 × 难度系数; 战役星级→用时→击杀 / 长街波数→得分 作分项与兜底)
//   ② 上限与裁剪(留 50 条, 只报前 10 名次)  ③ 明文且全机共用(账户/游客/未解锁都能看到同一张榜)
//   ④ 脏数据容错(手改也读不崩、写不坏) + 老榜(无难度字段)按标准难度重算
//   ⑤ 两个游戏页真的会写榜(战役只记胜利局 / 长街每次结算)  ⑥ 渲染用 FontAwesome 且转义用户名
//   ⑦ 四个页面的排行榜模块逐字节一致
//   难度系数(简单 0.85 / 标准 1 / 困难 1.2)的回归散在 ①b(同表现按难度排)、①c(系数可压过星级)、
//   ①d(长街系数)、④b(老榜无难度字段按标准重算)、⑥(系数与榜分真的渲染出来)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = path.join(__dirname, '..');
function readHtml(name) {
  const h = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { raw: h, script: h.match(/<script>([\s\S]*?)<\/script>/)[1] };
}
function mkStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i],
    get length() { return Object.keys(m).length; },
    _raw: m,
  };
}
function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() { } }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => { }; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeSandbox(store, sess) {
  const els = {};
  let raf = null;
  const listeners = {};
  function makeEl() {
    const e = {
      style: {},
      classList: {
        _s: {}, add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
        toggle(c, v) { const on = (v === undefined) ? !this._s[c] : !!v; if (on) this._s[c] = 1; else delete this._s[c]; return on; },
        contains(c) { return !!this._s[c]; },
      },
      children: [], firstChild: null,
      addEventListener() { }, removeEventListener() { },
      appendChild(c) { e.children.push(c); e.firstChild = e.children[0]; return c; },
      removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); e.firstChild = e.children[0] || null; return c; },
      setAttribute() { }, getAttribute: () => null, getContext: () => makeCtx(),
      width: 0, height: 0, className: '', textContent: '', innerHTML: '', value: '', checked: false,
      type: '', href: '', download: '', title: '', autocomplete: '', disabled: false, onclick: null,
    };
    Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; if (v) els[v] = e; } });
    return e;
  }
  const sb = {
    console, performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl()),
      createElement: () => makeEl(),
      addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); },
      body: { appendChild() { }, removeChild() { } },
    },
    localStorage: store, sessionStorage: sess,
    location: { href: '' }, confirm: () => true, setTimeout, clearTimeout,
  };
  sb.globalThis = sb; sb.window.window = sb.window;
  sb._els = els; sb._raf = () => raf;
  return sb;
}
function load(page, store, sess) {
  const sb = makeSandbox(store, sess);
  vm.runInNewContext(readHtml(page).script, sb);
  return sb;
}
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('ok: ' + m); } else { fail++; console.log('FAIL: ' + m); } }
const isEnv = (s) => { try { const o = JSON.parse(s); return !!(o && o.enc === 'acct-store-v1'); } catch (e) { return false; } };
const HOME = 'index.html';

// ---------- ① 名次口径 ----------
console.log('--- ① 名次口径 ---');
let store = mkStore(), sess = mkStore();
let sb = load(HOME, store, sess);
let G = sb.window.__game;
const base = { map: 'house', mapName: '户型图', diff: 'norm', who: '游客' };
G.boardAdd('campaign', Object.assign({}, base, { stars: 2, time: 200, kills: 5 }));
G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 260, kills: 4 }));   // 星高 → 第一
G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 180, kills: 2 }));   // 同星 → 用时短 → 第一
G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 180, kills: 9 }));   // 同星同时 → 击杀多 → 第一
let top = G.boardTop('campaign');
ok(top.length === 4, '① 战役榜记下 4 条 (' + top.length + ')');
ok(top[0].stars === 3 && top[0].time === 180 && top[0].kills === 9, '① 战役排序: 星级→用时→击杀 (榜首 3★/180s/9杀)');
ok(top[3].stars === 2, '① 星级最低的排最后');
G.boardAdd('street', Object.assign({}, base, { waves: 8, score: 900 }));
G.boardAdd('street', Object.assign({}, base, { waves: 11, score: 100 }));
G.boardAdd('street', Object.assign({}, base, { waves: 11, score: 1400 }));
let topS = G.boardTop('street');
ok(topS[0].waves === 11 && topS[0].score === 1400, '① 长街排序: 波数→得分 (榜首 11 波/1400 分)');
ok(topS[2].waves === 8, '① 波数最少的排最后');
// ①b 难度系数: 完全一样的表现, 困难 > 标准 > 简单(榜单分 = 表现分 × 系数)
{
  G.boardClear('campaign');
  const perf = { stars: 2, time: 200, kills: 5, map: 'house', mapName: '户型图' };
  G.boardAdd('campaign', Object.assign({}, perf, { diff: 'easy' }));
  G.boardAdd('campaign', Object.assign({}, perf, { diff: 'hard' }));
  G.boardAdd('campaign', Object.assign({}, perf, { diff: 'norm' }));
  const t3 = G.boardTop('campaign');
  ok(t3.length === 3 && t3[0].diff === 'hard' && t3[1].diff === 'norm' && t3[2].diff === 'easy',
    '① 同表现按难度排: 困难 > 标准 > 简单 (' + t3.map(e => e.diff).join(' > ') + ')');
  // 表现分 = 2★×1000 + 5杀×10 + 用时奖励(600-200) = 2450
  ok(t3[1].coef === 1 && t3[1].pts === 2450, '① 标准 ×1.0 → 榜分 2450 (实际 ×' + t3[1].coef + ' / ' + t3[1].pts + ')');
  ok(t3[0].coef === 1.2 && t3[0].pts === 2940, '① 困难 ×1.2 → 榜分 2940 (2450×1.2, 实际 ' + t3[0].pts + ')');
  ok(t3[2].coef === 0.85 && t3[2].pts === 2083, '① 简单 ×0.85 → 榜分 2083 (2450×0.85=2082.5 四舍五入, 实际 ' + t3[2].pts + ')');
}
// ①c 难度系数可以压过"高一档星级": 这是系数要的效果(困难 2★ > 简单 3★), 不是排序错乱
{
  G.boardClear('campaign');
  G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 600, kills: 0, diff: 'easy' }));   // 3000×0.85 = 2550
  G.boardAdd('campaign', Object.assign({}, base, { stars: 2, time: 60, kills: 6, diff: 'hard' }));    // 2600×1.2 = 3120
  const t3 = G.boardTop('campaign');
  ok(t3[0].stars === 2 && t3[0].diff === 'hard' && t3[0].pts > t3[1].pts,
    '① 困难 2★ 压过简单 3★(榜分 ' + t3[0].pts + ' > ' + t3[1].pts + ')');
}
// ①d 长街: 同波数看难度, 难度系数甚至能压过"多一波"
{
  G.boardClear('street');
  G.boardAdd('street', Object.assign({}, base, { waves: 10, score: 0, diff: 'easy' }));   // 10000×0.85 = 8500
  G.boardAdd('street', Object.assign({}, base, { waves: 10, score: 0, diff: 'hard' }));   // 12000
  G.boardAdd('street', Object.assign({}, base, { waves: 11, score: 0, diff: 'easy' }));   // 11000×0.85 = 9350
  const t3 = G.boardTop('street');
  ok(t3.map(e => e.diff + e.waves).join(',') === 'hard10,easy11,easy10',
    '① 长街同波数看难度、系数可压过一波 (' + t3.map(e => e.diff + e.waves).join(',') + ')');
  G.boardClear('campaign');
}

// ---------- ② 上限与裁剪 ----------
console.log('--- ② 上限与裁剪 ---');
for (let i = 0; i < 60; i++) G.boardAdd('street', Object.assign({}, base, { waves: i, score: i * 10 }));
ok(G.boardCount('street') === G.BOARD.cap, '② 落盘保留上限 ' + G.BOARD.cap + ' 条 (实际 ' + G.boardCount('street') + ')');
ok(G.boardTop('street', 10).length === 10, '② 展示取前 10 条');
const rank = G.boardAdd('street', Object.assign({}, base, { waves: 0, score: 0 }));
ok(rank === 0, '② 排在 10 名之外的成绩返回名次 0 (实际 ' + rank + ')');
const rank1 = G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 1, kills: 1 }));
ok(rank1 === 1, '② 新纪录返回名次 1 (实际 ' + rank1 + ')');

// ---------- ③ 明文、全机共用 ----------
console.log('--- ③ 明文与全机共用 ---');
const rawBoard = store._raw[G.BOARD.key];
ok(!!rawBoard && !isEnv(rawBoard) && rawBoard.indexOf('"waves"') > 0, '③ 榜单是明文 JSON(不是账户信封)');
ok(rawBoard.indexOf('"pts"') < 0 && rawBoard.indexOf('"coef"') < 0, '③ 派生字段(榜分/难度系数)不落盘, 读榜时重算');
{
  // 账户模式下同样是明文, 且未解锁也看得见
  const hub = load('game/hub.html', store, sess);
  const GH = hub.window.__game;
  const acc = GH.acctCreate('榜霸', 'pw-7777');
  ok(acc.ok === true, '③ 建账户成功');
  GH.boardAdd('campaign', Object.assign({}, base, { stars: 1, time: 500, kills: 0, who: GH.boardWho() }));
  ok(!isEnv(store._raw[GH.BOARD.key]), '③ 账户解锁状态下写榜仍是明文');
  const beforeTop = GH.boardTop('campaign').length;
  GH.sessClear();
  ok(GH.acctLocked() === true, '③ 已锁定');
  ok(GH.boardTop('campaign').length === beforeTop, '③ 锁定时照样读得到榜单 (' + beforeTop + ' 条)');
  ok(store._raw[GH.BOARD.key].indexOf('榜霸') > 0, '③ 榜上记录了账户名(用户名本来就是明文)');
}

// ---------- ④ 脏数据容错 ----------
console.log('--- ④ 脏数据容错 ---');
store._raw['breach_game_board'] = 'not-json-at-all';
ok(G.boardTop('campaign').length === 0 && G.boardCount('street') === 0, '④ 整块坏掉时读成空榜(不抛错)');
G.boardAdd('campaign', Object.assign({}, base, { stars: 3, time: 60, kills: 3 }));
ok(G.boardCount('campaign') === 1, '④ 坏数据之后仍能正常写入');
store._raw['breach_game_board'] = JSON.stringify({
  v: 1, campaign: [
    { stars: 99, time: -5, kills: 'x', map: 'BAD!!', mapName: '名字特别长的地图名', who: '名字特别特别长的玩家', diff: 'nope', at: 42 },
    'not-an-object', null,
  ], street: { nope: 1 },
});
const dirty = G.boardTop('campaign');
ok(dirty.length === 1, '④ 只保留合法对象条目 (' + dirty.length + ')');
const d0 = dirty[0];
ok(d0.stars === 3 && d0.time === 0 && d0.kills === 0, '④ 越界星级钳到 3 / 负数用时归 0 / 非数字击杀归 0');
ok(d0.map === 'house' && d0.diff === 'norm', '④ 非法地图回退 house / 非法难度回退标准');
ok(d0.who.length <= 16 && d0.mapName.length <= 8, '④ 超长名字被截断 (who=' + d0.who + ', map=' + d0.mapName + ')');
ok(Array.isArray(G.boardList('street')) , '④ 非数组的榜字段当成空榜');
// ④b 老榜没有 diff 字段 → 按标准难度重算榜单分, 不需要迁移存档
store._raw['breach_game_board'] = JSON.stringify({
  v: 1, campaign: [{ stars: 3, time: 180, kills: 0, map: 'house', mapName: '户型图', who: '游客', at: '2026-01-01T00:00:00.000Z' }],
});
const legacy = G.boardTop('campaign');
ok(legacy.length === 1 && legacy[0].diff === 'norm' && legacy[0].coef === 1 && legacy[0].pts === 3420,
  '④ 老成绩(无难度字段)按标准 ×1.0 重算榜分 3420 (实际 ' + (legacy[0] && legacy[0].pts) + ')');
G.boardClear();
ok(G.boardCount('campaign') === 0 && G.boardCount('street') === 0, '④ 清空榜单');

// ---------- ⑤ 游戏页真的会写榜 ----------
console.log('--- ⑤ 游戏页集成 ---');
{
  const st = mkStore(), ss = mkStore();
  const breach = load('game/breach.html', st, ss);
  const GB = breach.window.__game;
  GB.start();
  GB.saveResult(false, 0);                     // 失败局不记
  ok(GB.boardCount('campaign') === 0, '⑤ 战役失败局不进榜');
  GB.saveResult(true, 3);                      // 胜利局记一条
  const bc = GB.boardTop('campaign');
  ok(bc.length === 1 && bc[0].stars === 3, '⑤ 战役胜利局进榜 (stars=' + (bc[0] && bc[0].stars) + ')');
  ok(!!bc[0] && /^[a-z]+$/.test(bc[0].map) && bc[0].mapName.length > 0 && bc[0].who === '游客',
    '⑤ 榜上带地图与身份 (' + (bc[0] && bc[0].map) + '/' + (bc[0] && bc[0].mapName) + '/' + (bc[0] && bc[0].who) + ')');
  ok(GB.lastBoardRank === 1, '⑤ 结算页拿得到名次 (rank=' + GB.lastBoardRank + ')');
}
{
  // 长街: 真跑一局到结算(与 protocol_test 第⑦段同一套路)
  const st = mkStore(), ss = mkStore();
  const street = load('game/street.html', st, ss);
  const GS = street.window.__game;
  GS.start();
  let t = 0;
  const step = (n) => { for (let i = 0; i < n; i++) { t += 16; street._raf()(t); } };
  step(Math.ceil(9 / 0.016));
  for (const z of GS.units.filter(u => u.kind === 'zombie' && !u.dead)) GS.killUnit(z, GS.player);
  step(12);
  GS.player.dead = true;
  for (let i = 0; i < 900 && GS.result === null; i++) { GS.player.dead = true; step(1); }
  step(Math.ceil(4 / 0.016));
  const sc = GS.boardTop('street');
  ok(sc.length === 1, '⑤ 长街结算写入榜单 (' + sc.length + ' 条)');
  ok(!!sc[0] && sc[0].waves >= 1 && sc[0].score > 0, '⑤ 长街榜记了波数与得分 (第 ' + (sc[0] && sc[0].waves) + ' 波 / ' + (sc[0] && sc[0].score) + ' 分)');
  ok(GS.lastBoardRank === 1, '⑤ 长街结算页拿得到名次');
}

// ---------- ⑥ 渲染 ----------
console.log('--- ⑥ 渲染 ---');
{
  G.boardClear();
  G.boardAdd('campaign', Object.assign({}, base, { stars: 2, time: 95, kills: 7, who: '<b>x</b>' }));
  const html = G.boardRenderHTML('campaign');
  ok(html.indexOf('fa-trophy') >= 0, '⑥ 榜首用奖杯图标(fa-trophy)');
  ok(html.indexOf('fas fa-star') >= 0 && html.indexOf('far fa-star') >= 0, '⑥ 星级用实心/空心 FA 星, 不用 ★/☆');
  ok(html.indexOf('★') < 0 && html.indexOf('☆') < 0, '⑥ 渲染结果里没有星形字符');
  ok(html.indexOf('&lt;b&gt;x&lt;/b&gt;') > 0 && html.indexOf('<b>x</b>') < 0, '⑥ 用户名被转义(不会当 HTML 执行)');
  ok(html.indexOf('1:35') > 0, '⑥ 用时格式化成 m:ss (' + '1:35' + ')');
  ok(html.indexOf('榜分 ') > 0 && html.indexOf('2575') > 0, '⑥ 行尾显示榜分 (2★/95s/7杀 = 2575)');
  G.boardAdd('campaign', Object.assign({}, base, { stars: 2, time: 95, kills: 7, diff: 'hard', who: '困难户' }));
  const htmlHard = G.boardRenderHTML('campaign');
  ok(htmlHard.indexOf('困难 ×1.2') > 0, '⑥ 行内标出难度系数(困难 ×1.2)');
  ok(htmlHard.indexOf('3090') > 0, '⑥ 榜分按难度加权显示(2575×1.2=3090)');
  const empty = (G.boardClear(), G.boardRenderHTML('street'));
  ok(empty.indexOf('还没有成绩') > 0, '⑥ 空榜给出提示文案');
  G.boardAdd('street', Object.assign({}, base, { waves: 6, score: 300, evac: true, boss: 1 }));
  const sh = G.boardRenderHTML('street');
  ok(sh.indexOf('fa-truck-fast') > 0 && sh.indexOf('fa-crown') > 0, '⑥ 撤离/尸王标记也用 FA 图标');
}

// ---------- ⑦ 四页模块一致 ----------
console.log('--- ⑦ 副本一致性 ---');
{
  const PAGES = ['index.html', 'game/hub.html', 'game/breach.html', 'game/street.html'];
  const reg = (h, b, e) => { const i = h.indexOf(b), j = h.indexOf(e); return (i < 0 || j < 0) ? null : h.slice(i, j + e.length); };
  const BB = '// >>> BOARD-BEGIN', BE = '// <<< BOARD-END';
  const ref = reg(readHtml(PAGES[0]).raw, BB, BE);
  ok(!!ref && ref.split('\n').length > 120, '⑦ 排行榜模块存在 (' + (ref ? ref.split('\n').length : 0) + ' 行)');
  const bad = PAGES.filter(p => reg(readHtml(p).raw, BB, BE) !== ref);
  ok(bad.length === 0, '⑦ 四个页面的排行榜模块逐字节一致' + (bad.length ? ' — ' + bad.join(', ') : ''));
  const dup = PAGES.filter(p => readHtml(p).raw.split('function boardAdd(').length - 1 !== 1);
  ok(dup.length === 0, '⑦ 每页只有一份排行榜实现' + (dup.length ? ' — ' + dup.join(', ') : ''));
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nBOARD TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
