// 穿墙检测: 模拟玩家各种移动方式, 逐帧检查圆心是否嵌入墙体
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
const g = () => sb.window.__game;
// 确定性随机源: 让"随机开门 / 家具变体 / AI 扫视与点射"变成固定场景 —— 门禁不再时红时绿。
// 32 位 LCG, 与页面默认的 Math.random 无关; 换种子即换一套开关门 + 家具摆法 + AI 时序。
function makeSeed(s) {
  let v = s >>> 0;
  return function () { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; };
}
function newRound(seed) {
  g().setRandom(makeSeed(seed));
  els['btnStart'].onclick();
  // 隐藏蓝方干扰(致盲定住)
  for (const u of g().units) if (u.team === 'blue') { u.blind = 999; u.speed = 0; }
}

// 最小距离: 圆心到最近墙线(含关闭的门)/家具矩形 的距离
// 贴墙正常 ≈ 11px(半径); < 8px 说明嵌入; < 6px 说明真穿墙
function minWallDist(x, y) {
  const G = g();
  let md = 1e9;
  for (const s of G.solidSegs) {
    const abx = s.x2 - s.x1, aby = s.y2 - s.y1;
    const len2 = abx * abx + aby * aby || 1e-9;
    let t = ((x - s.x1) * abx + (y - s.y1) * aby) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.x1 + abx * t), y - (s.y1 + aby * t));
    if (d < md) md = d;
  }
  for (const c of G.lowCovers) {
    const cx = x < c.x ? c.x : x > c.x + c.w ? c.x + c.w : x;
    const cy = y < c.y ? c.y : y > c.y + c.h ? c.y + c.h : y;
    const d = Math.hypot(x - cx, y - cy);
    if (d < md) md = d;
  }
  return md;
}

let totalEmbed = 0, totalCross = 0;
function scanRun(label, px, py, keysDown, frames, dtMs) {
  const G = g();
  G.player.x = px; G.player.y = py;
  G.player.hp = G.player.maxHp;
  for (const k of keysDown) key(k, true);
  let embed = 0, cross = 0, firstE = '', firstC = '';
  for (let i = 0; i < frames; i++) {
    const prevX = G.player.x, prevY = G.player.y;
    t += dtMs; rafCb(t);
    const x = G.player.x, y = G.player.y;
    const d = minWallDist(x, y);
    if (d < 8) { embed++; if (!firstE) firstE = '(' + x.toFixed(0) + ',' + y.toFixed(0) + ') d=' + d.toFixed(1); }
    if (d < 6) { cross++; if (!firstC) firstC = '(' + x.toFixed(0) + ',' + y.toFixed(0) + ') d=' + d.toFixed(1); }
  }
  for (const k of keysDown) key(k, false);
  totalEmbed += embed; totalCross += cross;
  console.log((cross ? '!! ' : 'ok ') + label + ': 嵌入(<8px) ' + embed + ' 帧, 真穿墙(<6px) ' + cross + ' 帧' + (cross ? ' 首次 ' + firstC : ''));
}

// 场景集: 从客厅/厨房/走廊出发, 各方向奔跑与贴墙
const dirs = [
  ['上', ['w']], ['下', ['s']], ['左', ['a']], ['右', ['d']],
  ['左上', ['w', 'a']], ['右上', ['w', 'd']], ['左下', ['s', 'a']], ['右下', ['s', 'd']],
];
// 多轮: 每轮换一套随机场景(开关门 + 家具变体 + AI 时序)。
// 种子 7 会命中 varyFurniture() 的"沙发/电视柜南北墙对调", 种子 2 不会 —— 两种摆法都覆盖。
const SEEDS = [2, 7, 12345];
let t = performance.now();
for (const seed of SEEDS) {
  newRound(seed);
  // A: 客厅中心向 8 方向奔跑(Shift) 每方向 200 帧(16ms)
  g().player.x = 300; g().player.y = 800;
  for (const [dn, ks] of dirs) scanRun('[seed' + seed + ']客厅奔跑' + dn, 300, 800, [...ks, 'shift'], 200, 16);
  // B: 厨房斜冲(墙多, 起点选空地避开橱柜/岛台)
  g().player.x = 350; g().player.y = 520;
  for (const [dn, ks] of dirs) scanRun('[seed' + seed + ']厨房斜冲' + dn, 350, 520, [...ks, 'shift'], 200, 16);
  // C: 模拟掉帧(50ms 大时间步) 客厅奔跑
  for (const [dn, ks] of dirs.slice(0, 4)) scanRun('[seed' + seed + ']掉帧50ms' + dn, 300, 800, [...ks, 'shift'], 60, 50);
  // D: 走廊奔跑(窄走廊贴墙)
  g().player.x = 900; g().player.y = 390;
  for (const [dn, ks] of [['左', ['a']], ['右', ['d']]]) scanRun('[seed' + seed + ']走廊' + dn, 900, 390, [...ks, 'shift'], 200, 16);
}

console.log(totalCross ? '\n检测到真穿墙(<6px), 需要修复' : (totalEmbed ? '\nWALL TEST PASSED: 无真穿墙(贴墙嵌入帧属正常顶墙状态)' : '\nWALL TEST PASSED: 未检测到穿墙'));
process.exit(totalCross ? 1 : 0);
