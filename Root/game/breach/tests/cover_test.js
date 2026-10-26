// 掩体(家具)挡子弹回归测试
// 修复背景: buildMapHouse 末尾漏调 syncCoverSegs() → 户型图 coverSegs 为空 → 家具完全不挡子弹
//          (约 70% 的对局, 教程模式 100%)。本测试逐图核对"派生数据 coverSegs 与 lowCovers 一致"
//          并**行为验证**: 家具内部生成的子弹不得穿过家具。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function makeCtx() {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeEl() {
  const ls = {};
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    _fire(ev, obj) { for (const fn of ls[ev] || []) fn(obj); },
    appendChild() {}, className: '', disabled: false,
    textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => makeCtx(), onclick: null
  };
}
const els = {}; let rafCb = null; const listeners = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  location: { href: '' }, setTimeout, clearTimeout
};
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function key(k, down) { for (const fn of listeners['doc:keydown'] || []) if (down) fn({ key: k, repeat: false, preventDefault() {} }); for (const fn of listeners['doc:keyup'] || []) if (!down) fn({ key: k }); }
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; console.log('ok: ' + msg); } else { fails++; console.log('FAIL: ' + msg); } }
const g = () => sb.window.__game;

els['btnStart'].onclick();
const G = g();
let t = performance.now();

// --- 0. 内省钩子必须存在(修复前 coverSegs/coverHash 未暴露, 21 个测试都观察不到这份派生数据) ---
ok(Array.isArray(G.coverSegs), '内省钩子 __game.coverSegs 已暴露');
ok(G.coverHash, '内省钩子 __game.coverHash 已暴露');

// --- 1. 每张图: coverSegs 数量必须等于 lowCovers × 4 ---
const MAP_IDS = Object.keys(G.mapDefs);
function mapName(id) { return G.mapDefs[id].name; }
// 每张图取"一块内部空间足够大"的家具, 用于生成家具内部的测试子弹
// 坐标来自各 buildMap* 的 cov(...) 调用(1px ≈ 1cm)
const PROBE = {
  house: { x: 60, y: 930, w: 200, h: 45 },        // 客厅电视柜
  warehouse: { x: 60, y: 300, w: 160, h: 90 },    // 西侧办公区家具(见 buildMapWarehouse)
  factory: { x: 60, y: 300, w: 160, h: 90 },      // 见 buildMapFactory
  office: { x: 60, y: 300, w: 160, h: 90 },       // 见 buildMapOffice
  parking: { x: 60, y: 300, w: 160, h: 90 },      // 见 buildMapParking
  range: { x: 60, y: 300, w: 160, h: 90 },        // 见 buildMapRange
};

for (const id of MAP_IDS) {
  G.selectMap(id);
  const cov = G.lowCovers, seg = G.coverSegs;
  ok(seg.length === cov.length * 4, mapName(id) + ': coverSegs(' + seg.length + ') === lowCovers(' + cov.length + ') × 4');
}

// --- 2. 行为验证: 家具内部的子弹不得穿出家具 ---
// 逐图从"实际家具列表"里挑一块最大的家具作为靶, 避免写死坐标随地图重做而失效
function pickLargestCover(minW, minH) {
  let best = null;
  for (const c of G.lowCovers) {
    if (c.w < minW || c.h < minH) continue;
    if (!best || c.w * c.h > best.w * best.h) best = c;
  }
  return best;
}
function spawnBulletInside(c) {
  G.bullets.length = 0;
  G.bullets.push({
    x: c.x + c.w / 2, y: c.y + c.h / 2,
    vx: 900, vy: 0, dmg: 1, owner: G.player, life: 5, fire: false
  });
}
function bulletFurthestX() {
  let mx = -1e9;
  for (const b of G.bullets) if (!b.dead) mx = Math.max(mx, b.x);
  return mx;
}

for (const id of MAP_IDS) {
  G.selectMap(id);
  const c = pickLargestCover(40, 30);
  if (!c) { ok(false, mapName(id) + ': 找不到可用于测试的家具'); continue; }
  // 冻结蓝方, 避免 AI 行为干扰(子弹不与单位判定, 但视野/渲染会走不同分支)
  for (const u of G.units) if (u.team === 'blue') { u.blind = 999; u.speed = 0; }
  spawnBulletInside(c);
  const insideX = c.x + c.w / 2, rightEdge = c.x + c.w;
  t = step(20, t);              // 20 帧 × 16ms = 320ms → 无阻挡会前进 288px, 足以穿出家具
  const far = bulletFurthestX();
  const crossed = far > rightEdge + 2;
  ok(!crossed, mapName(id) + ': 家具(' + c.kind + ' ' + c.w + '×' + c.h + ') 挡住内部生成的子弹' +
    (crossed ? '  ← 穿出到 x=' + far.toFixed(0) + '(右边界 ' + rightEdge.toFixed(0) + ')' : ''));
}

// --- 3. 户型图专项: 全部 5 张战役图都必须是"家具挡子弹"的(修复前 house 是唯一反例) ---
G.selectMap('house');
t = step(2, t);
ok(G.coverSegs.length > 0, '户型图(默认图): coverSegs 非空(修复前为 0 → 家具不挡子弹)');

// --- 4. 亚像素窄缝不变量(P0-2) ---
// 项目自定的摆法规则: 家具与墙/家具之间要么贴死(≤几 px, 单位挤不进), 要么留 ≥44px 过道。
// 早期那次一次性扫描用的是 **8px 点阵**, 看不见 5px 缝 —— 而 wall_test 的穿透案例
// 恰恰发生在"电视柜底面距南外墙 5px"处。这里改用 **1px 步长**, 并且只统计
// **真正封闭的窄空腔**: 从窄缝做像素洪水, 若洪泛能在 400px 预算内"逃出地图"或扩散成大空间,
// 说明它只是墙角/门洞的形状缺口(单位进不去也出得来), 不计; 只有小体积封闭空腔才是
// "身体挤得进、碰撞又推不出来"的陷阱。
{
  const RX = 11;                 // 单位半径(见 makeUnit)
  const MIN_GAP = 1, MAX_GAP = RX * 2 - 1;   // 21 = 路网判不可走的上界
  const CAP = 400000;            // 洪泛上限(远大于任何房间), 达到上限即视为开放空间
  const VOID_MAX = 600;          // 封闭空腔体积上限: 小于此值且四面封闭 = 真正的"挤进去出不来"
  const W = G.mapW, H = 1000;
  const blocked = new Uint8Array(W * H);
  const seen = new Int32Array(W * H);
  const queue = new Int32Array(W * H);
  const mark = (x0, y0, x1, y1) => {
    const xa = Math.max(0, Math.floor(x0)), xb = Math.min(W - 1, Math.ceil(x1));
    const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.ceil(y1));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) blocked[x + y * W] = 1;
  };
  // 从 (sx,sy) 洪泛: 返回 { escaped, size }。escaped=触到地图边界(说明是开放空间)
  function flood(sx, sy) {
    let qn = 0, qi = 0, size = 0, escaped = false;
    queue[qn++] = sx + sy * W;
    seen[sx + sy * W] = 1;
    while (qi < qn && size <= CAP && !escaped) {      const cur = queue[qi++];
      const x = cur % W, y = (cur / W) | 0;
      size++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { escaped = true; break; }
      for (let k = 0; k < 4; k++) {
        const nx2 = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny2 = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        const ni = nx2 + ny2 * W;
        if (blocked[ni] || seen[ni]) continue;
        seen[ni] = 1; queue[qn++] = ni;
      }
    }
    if (size > CAP) escaped = true;   // 触到预算上限 = 大空间, 非封闭空腔
    return { escaped, size };
  }
  const results = {};
  function scanMap(id) {
    G.selectMap(id);
    blocked.fill(0); seen.fill(0);
    for (const s of G.solidSegs) mark(Math.min(s.x1, s.x2) - 1, Math.min(s.y1, s.y2) - 1, Math.max(s.x1, s.x2) + 1, Math.max(s.y1, s.y2) + 1);
    for (const c of G.lowCovers) mark(c.x, c.y, c.x + c.w, c.y + c.h);
    const traps = [];
    const consider = (sx, sy) => {
      if (blocked[sx + sy * W] || seen[sx + sy * W]) return;
      const r = flood(sx, sy);
      if (!r.escaped && r.size > 0 && r.size <= VOID_MAX) traps.push('(' + sx + ',' + sy + ') ' + r.size + 'px²');
    };
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let x = 0;
      while (x < W) {
        if (blocked[row + x]) { x++; continue; }
        let x2 = x; while (x2 + 1 < W && !blocked[row + x2 + 1]) x2++;
        const w = x2 - x + 1;
        if (w >= MIN_GAP && w <= MAX_GAP && x > 0 && x2 < W - 1) consider(x, y);
        x = x2 + 1;
      }
    }
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (blocked[x + y * W]) { y++; continue; }
        let y2 = y; while (y2 + 1 < H && !blocked[x + (y2 + 1) * W]) y2++;
        const h = y2 - y + 1;
        if (h >= MIN_GAP && h <= MAX_GAP && y > 0 && y2 < H - 1) consider(x, y);
        y = y2 + 1;
      }
    }
    results[id] = traps;
  }
  for (const id of MAP_IDS) scanMap(id);
  const summary = Object.keys(results).map(k => k + '=' + results[k].length).join(', ');
  console.log('ok: 亚像素封闭窄空腔(1~' + MAX_GAP + 'px, 洪泛预算 ' + CAP + 'px²)统计 — ' + summary);
  // 守护口径: 数量不得随地图改动增长(改图后若新增窄空腔, 这条会立刻指出具体坐标)
  const BUDGET = { house: 0, warehouse: 0, factory: 0, office: 0, parking: 0, range: 0 };
  for (const id of MAP_IDS) {
    const n = results[id].length;
    ok(n <= (BUDGET[id] || 0), mapName(id) + ': 无新增封闭窄空腔 (' + n + ' ≤ ' + (BUDGET[id] || 0) + ')' +
      (n ? ' → ' + results[id].slice(0, 6).join(' | ') : ''));
  }
}

console.log(fails ? '\n' + fails + ' 项失败 / ' + passes + ' 项通过' : '\nFURNITURE BLOCK TEST PASSED: ' + passes + ' 项通过, 0 失败');
process.exit(fails ? 1 : 0);
