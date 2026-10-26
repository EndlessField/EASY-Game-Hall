// 多地图连通性回归检查: 各图寻路可达 + 出生点可走 + 房间可达 + 无 NaN
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() {} }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeEl() {
  const ls = {};
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); }, _fire(ev, o) { for (const fn of ls[ev] || []) fn(o); }, textContent: '', innerHTML: '', width: 0, height: 0, getContext: () => makeCtx(), onclick: null };
}
const els = {}; let rafCb = null; const listeners = {}; const store = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: { getElementById: (id) => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); } },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  location: { href: '' }, setTimeout, clearTimeout
};
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }
const g = () => sb.window.__game;
const maps = ['house', 'warehouse', 'factory', 'office', 'parking'];
let t = performance.now();
for (const mid of maps) {
  g().selectMap(mid);
  els['btnStart'].onclick();
  const G = g();
  assert(G.mapId === mid, '地图切换 ' + mid + ' (' + G.mapId + ')');
  assert(G.rooms.length > 0, mid + ' 房间数据存在 (rooms=' + G.rooms.length + ')');   // 回归断言: buildMapHouse 房间曾被死代码覆盖为空
  const mg = G.moveGrid;
  const walk = (x, y) => { const cx = Math.floor(x / 16), cy = Math.floor(y / 16); return cx >= 0 && cy >= 0 && cx < 150 && cy < 62 && mg[cx + cy * 150] === 1; };
  // 出生点附近 ±80px 内找可走点(户型图个别出生点历史上就在家具正中, 首帧碰撞自动推出)
  const nearWalk = (x, y) => { for (let k = 0; k < 9; k++) { const ox = (k % 3 - 1) * 80, oy = Math.floor(k / 3 - 1) * 80; if (walk(x + ox, y + oy)) return [x + ox, y + oy]; } return null; };
  assert(walk(G.player.x, G.player.y), mid + ' 玩家出生点可走 (' + G.player.x.toFixed(0) + ',' + G.player.y.toFixed(0) + ')');
  const blues = G.units.filter(u => u.team === 'blue');
  assert(blues.length === 5, mid + ' 标准难度蓝方 5 台 (' + blues.length + ')');
  for (const b of blues) {
    const bp = nearWalk(b.x, b.y);
    assert(bp !== null, mid + ' ' + b.name + ' 出生点附近可走 (' + b.x.toFixed(0) + ',' + b.y.toFixed(0) + ')');
    b._check = bp;
  }
  // 玩家 → 每个蓝方出生点 可寻路
  for (const b of blues) {
    const p = g().findPath(G.player.x, G.player.y, b._check[0], b._check[1]);
    assert(p !== null && p.length > 0, mid + ' 玩家→' + b.name + ' 可寻路');
  }
  // 蓝方两两可达
  for (let i = 0; i < blues.length; i++) for (let j = i + 1; j < blues.length; j++) {
    assert(g().findPath(blues[i]._check[0], blues[i]._check[1], blues[j]._check[0], blues[j]._check[1]) !== null, mid + ' ' + blues[i].name + '→' + blues[j].name + ' 可寻路');
  }
  // 每个房间至少一个可达点(采样范围 ±160/40px 步进, 避开房间内家具与 13px 净空 —— 家具恢复后中心点可能落在家具上)
  for (const r of G.rooms) {
    let ok = false;
    outer: for (let oy = -160; oy <= 160 && !ok; oy += 40) {
      for (let ox = -160; ox <= 160 && !ok; ox += 40) {
        const px = r.x + r.w / 2 + ox, py = r.y + r.h / 2 + oy;
        if (!walk(px, py)) continue;
        const p = g().findPath(G.player.x, G.player.y, px, py);
        if (p !== null) { ok = true; break outer; }
      }
    }
    assert(ok, mid + ' 房间「' + r.name + '」可达');
  }
  // 长跑 120 帧无 NaN
  t = step(120, t);
  let bad = 0;
  for (const u of G.units) if (!isFinite(u.x) || !isFinite(u.y)) bad++;
  assert(bad === 0, mid + ' 120 帧无 NaN (' + bad + ')');
}
// 训练场(B5): ?range=1 独立训练模式 —— 靶子数量/弹药充足/不判胜负/靶子自动重置
els['btnRange'].onclick();
const GR = g();
assert(GR.range === true, '训练场模式已开启');
assert(GR.mapId === 'range', '训练场地图已载入 (' + GR.mapId + ')');
const targets = GR.units.filter(u => u.train && u.team === 'blue');
assert(targets.length === 7, '训练场靶子 7 个 (' + targets.length + ')');
assert(GR.player.weapon.reserve >= 999, '训练场弹药充足 (' + GR.player.weapon.reserve + ')');
assert(GR.doors.every(d => d.open), '训练场门全开(关着的门会挡子弹) (' + GR.doors.length + ' 扇)');
GR.rangeGiveWeapon('sniper');
assert(g().weaponName === '狙击枪', '训练场可切换主武器 (' + g().weaponName + ')');
for (const u of targets) u.dead = true;
t = step(140, t);
assert(g().units.filter(u => u.train && !u.dead).length === 7, '靶子被清空后自动重置');
assert(g().result() === null, '训练场不判胜负 (result=' + g().result() + ')');
// 回到户型图, 经典路径仍可用
g().selectMap('house');
els['btnStart'].onclick();
const G2 = g();
assert(g().findPath(300, 820, 1840, 620) !== null, '切回户型图: 左户客厅→右户餐厅 可寻路');
console.log('MAP CHECK PASSED');
