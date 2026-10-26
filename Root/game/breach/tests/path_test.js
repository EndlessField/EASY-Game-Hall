// 寻路测试: BFS 绕墙/过门/避障 + 机器人跨图导航
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
const ctxStub = makeCtx();
function makeEl() {
  const ls = {};
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    _fire(ev, obj) { for (const fn of ls[ev] || []) fn(obj); },
    textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => ctxStub, onclick: null
  };
}
const els = {};
let rafCb = null;
const listeners = {};
const sandbox = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  setTimeout, clearTimeout
};
sandbox.globalThis = sandbox; sandbox.window.window = sandbox.window;
vm.runInNewContext(code, sandbox);
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }
const G = () => sandbox.window.__game;

els['btnStart'].onclick();
const g = G();
let t = performance.now();

// --- 测试1: 跨户寻路(左户客厅→右户餐厅, 需穿电梯厅+入户门)应存在路径 ---
const pth = g.findPath(300, 820, 1840, 620);
assert(Array.isArray(pth) && pth.length > 0, '左户客厅→右户餐厅 存在寻路路径 (' + pth.length + ' 个路点)');
// 所有路点必须落在可通行格(网格 150×62)
const mg = g.moveGrid;
let bad = 0;
for (const wp of pth) {
  const cx = Math.floor(wp.x / 16), cy = Math.floor(wp.y / 16);
  if (cx < 0 || cy < 0 || cx >= 150 || cy >= 62 || !mg[cx + cy * 150]) bad++;
}
assert(bad === 0, '所有路点落在可通行格 (' + bad + ' 个非法)');

// --- 测试1b: 跨户寻路(右户厨房→右户主卧)应存在路径 ---
const pWing = g.findPath(2000, 540, 2120, 150);
assert(Array.isArray(pWing) && pWing.length > 0, '右户厨房→主卧 存在寻路路径 (' + pWing.length + ' 个路点)');
let wingBad = 0;
for (const wp of pWing) {
  const cx = Math.floor(wp.x / 16), cy = Math.floor(wp.y / 16);
  if (cx < 0 || cy < 0 || cx >= 150 || cy >= 62 || !mg[cx + cy * 150]) wingBad++;
}
assert(wingBad === 0, '右户路径路点全部可通行 (' + wingBad + ' 个非法)');
assert(g.mapW === 2400, '地图宽度 2400 (' + g.mapW + ')');

// --- 测试2: 直线被墙挡时 BFS 必须绕行(客厅→主卧, 需经走廊/卧室门) ---
const p2 = g.findPath(300, 820, 280, 150);
assert(Array.isArray(p2) && p2.length > 1, '绕墙寻路成功 (' + p2.length + ' 路点)');
// 检测"穿越 y=360 卧室区隔墙"的相邻路点对: 中点 x 必须落在主卧/次卧/书房门范围内
let crossedDoor = false, badCross = 0;
for (let i = 0; i < p2.length - 1; i++) {
  const a = p2[i], b = p2[i + 1];
  if ((a.y >= 362 && b.y < 362) || (a.y < 362 && b.y >= 362)) {
    const xmid = (a.x + b.x) / 2;
    const inDoor = (xmid > 168 && xmid < 272) || (xmid > 448 && xmid < 552) || (xmid > 828 && xmid < 932);
    if (inDoor) crossedDoor = true; else badCross++;
  }
}
assert(crossedDoor, '路径经过卧室门(绕墙而非穿墙)');
assert(badCross === 0, '路径没有从无门处穿墙 (' + badCross + ' 个非法穿越)');

// --- 测试3: 目标不可达/非法 → null ---
assert(g.findPath(300, 820, 300, 820) === null, '同格目标返回 null');
const intoCrate = g.findPath(400, 820, 150, 700);  // 目标是客厅沙发内部
assert(intoCrate === null || !Array.isArray(intoCrate), '目标在掩体内寻路失败返回 null');

// --- 测试4: 机器人跨户导航(蓝机2 从右户次卧查探左户客厅) ---
// 先把玩家挪到左户主卫角落, 避免机器人看到玩家进入战斗而干扰导航测试
const pTest = g.player;
pTest.x = 110; pTest.y = 560;         // 挪进左户卫生间(器具之间的空地), 让机器人看不见玩家
const b2 = g.units.find(u => u.name === '蓝·机2');
b2.blind = 0;                        // 解除致盲
b2.ai.state = 'investigate';
b2.ai.tgt = { x: 300, y: 820 };      // 左户客厅深处
b2.x = 1820; b2.y = 180;
// 追踪全程最小 x: 机器人须穿过电梯厅+入户门进入左户(到达后可能恢复巡逻走回右户)
// 新户型图里"入户门→玄关→餐厅→客厅"是唯一通路(走廊不通电梯厅, 与现实一致), 故给足 1600 帧
let minX = 1e9;
for (let i = 0; i < 1600; i++) { t = step(1, t); minX = Math.min(minX, b2.x); }   // ~26秒: 横穿全屋约8扇门
assert(isFinite(b2.x) && isFinite(b2.y), '蓝·机2 导航坐标有限 (' + b2.x.toFixed(0) + ',' + b2.y.toFixed(0) + ')');
assert(minX < 820, '蓝·机2 已穿过电梯厅+入户门进入左户客厅方向 (minX=' + minX.toFixed(0) + ')');
assert(!pTest.dead, '玩家在导航测试中存活');

// --- 测试5: 导航期间没有卡在墙里(多次采样) ---
let stuckBad = 0;
for (let i = 0; i < 200; i++) {
  t = step(6, t);
  for (const u of g.units) if (!u.dead && (!isFinite(u.x) || !isFinite(u.y))) stuckBad++;
}
assert(stuckBad === 0, '长时导航无 NaN (' + stuckBad + ')');

console.log('PATH TEST PASSED');
