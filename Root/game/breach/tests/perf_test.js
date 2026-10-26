// 性能回归测试: 持续开枪不累积变慢、移动速度恒定、战斗资源不膨胀
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
// 画布调用计数 Proxy: stub canvas 让"渲染优化"在耗时上看不出来,
// 但每帧 draw call 次数是可自动断言的硬指标。按画布 id 归类, 因此能精确断言
// "小地图迷雾层不再逐格 fillRect"与"径向渐变已 sprite 化"。
const cvCounts = {};
const CV_METHODS = { createRadialGradient: 1, fillRect: 1, stroke: 1, fill: 1, fillText: 1, putImageData: 1, drawImage: 1, beginPath: 1 };
function makeCountCtx(label) {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
    putImageData() { },
    drawImage() { },
  };
  return new Proxy(t, {
    get(ta, p) {
      if (p in ta) {
        const f = ta[p];
        if (typeof f === 'function' && CV_METHODS[p]) {
          return function () { const k = label + '.' + p; cvCounts[k] = (cvCounts[k] || 0) + 1; return f.apply(ta, arguments); };
        }
        return f;
      }
      ta[p] = function () { if (CV_METHODS[p]) { const k = label + '.' + p; cvCounts[k] = (cvCounts[k] || 0) + 1; } };
      return ta[p];
    },
    set(ta, p, v) { ta[p] = v; return true; }
  });
}
function makeEl() {
  const ls = {};
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    _fire(ev, obj) { for (const fn of ls[ev] || []) fn(obj); },
    appendChild() {}, className: '', disabled: false,
    textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => makeCountCtx(this._ctxLabel || '?'), onclick: null, _ctxLabel: '?'
  };
}
const els = {}; let rafCb = null; const listeners = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = (function () { const e = makeEl(); e._ctxLabel = id; return e; })()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  location: { href: '' }, setTimeout, clearTimeout
};
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }
function aimAt(wx, wy) { const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500; els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); }
function mouseDown() { els['cv']._fire('mousedown', { button: 0 }); }
function mouseUp() { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); }
function key(k, down) { for (const fn of listeners['doc:keydown'] || []) if (down) fn({ key: k, repeat: false, preventDefault() {} }); for (const fn of listeners['doc:keyup'] || []) if (!down) fn({ key: k }); }
const g = () => sb.window.__game;

els['btnStart'].onclick();
const G = g();
let t = performance.now();

// --- 阶段1: 持续连射 300 帧(约 300 发), 分段测每帧耗时是否稳定(无累积) ---
aimAt(900, 540);
mouseDown();
const seg1 = [];
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  t = step(100, t);
  seg1.push(performance.now() - t0);
}
mouseUp();
const avgSeg1 = (seg1[0] + seg1[1] + seg1[2]) / 3;
assert(seg1[2] < avgSeg1 * 2.2 + 15, '持续连射不累积变慢 (分段耗时 ' + seg1.map(v => v.toFixed(1)).join('/') + 'ms)');
console.log('ok: 300 发连射总耗时 ' + seg1.reduce((a, b) => a + b, 0).toFixed(1) + 'ms, 平均每100帧 ' + avgSeg1.toFixed(1) + 'ms');

// --- 阶段2: 交火场景(蓝机解除致盲同房对射, 全体超高血量确保400帧内无人阵亡) 400 帧 ---
// 注意: 同时清掉 down/bleed —— 高血量只防"被打死", 不防"早先被打倒后按 10s 失血计时阵亡"
for (const u of G.units) { u.blind = 0; u.maxHp = 99999; u.hp = 99999; u.down = false; u.bleed = 0; }
for (const u of G.units) if (u.team === 'blue') { u.x = 520; u.y = 540; }
G.player.x = 300; G.player.y = 540;
aimAt(520, 540);
mouseDown();
for (let k in cvCounts) delete cvCounts[k];
const t0 = performance.now();
t = step(400, t);
mouseUp();
const combatCost = performance.now() - t0;
const perFrameCombat = combatCost / 400, perFrameShoot = avgSeg1 / 100;
assert(perFrameCombat < perFrameShoot * 2 + 5, '激烈交火每帧耗时不超过连射的2倍 (' + perFrameCombat.toFixed(2) + ' vs ' + perFrameShoot.toFixed(2) + 'ms)');
assert(G.particles.length <= 420, '粒子有上限 (' + G.particles.length + ')');
assert(G.bullets.length < 150, '子弹数量受控 (' + G.bullets.length + ')');
assert(G.decals.length <= 60, '弹痕有上限 (' + G.decals.length + ')');
// 每帧 draw call 硬指标(400 帧交火): 见 makeCountCtx 注释
{
  const sum = (m) => { let s = 0; for (const k in cvCounts) if (k.endsWith('.' + m)) s += cvCounts[k]; return s; };
  const per = (k) => (cvCounts[k] || 0) / 400;
  console.log('ok: 交火每帧 draw call — createRadialGradient ' + (sum('createRadialGradient') / 400).toFixed(2)
    + ', fillRect ' + (sum('fillRect') / 400).toFixed(0) + ', stroke ' + (sum('stroke') / 400).toFixed(0)
    + ', fillText ' + (sum('fillText') / 400).toFixed(0) + ', drawImage ' + (sum('drawImage') / 400).toFixed(1)
    + ', putImageData ' + (sum('putImageData') / 400).toFixed(1));
  assert(sum('createRadialGradient') / 400 <= 2.5,
    '径向渐变已 sprite 化: 每帧 createRadialGradient ≤2.5 (实测 ' + (sum('createRadialGradient') / 400).toFixed(2) + ')');
  assert(per('mmFog.fillRect') === 0,
    '小地图迷雾层不再逐格 fillRect(改为 ImageData + putImageData): mmFog.fillRect=' + per('mmFog.fillRect'));
  assert(sum('fillRect') / 400 <= 120,
    '主画布每帧 fillRect 已回落 ≤120 (实测 ' + (sum('fillRect') / 400).toFixed(0) + ')');
}

// --- 阶段3: 移动速度恒定(按住 D 沿走廊无障碍横线走 120 帧, 逐帧位移方差小) ---
G.player.x = 60; G.player.y = 400;    // 左户内走廊(y360..440 的 0.8m 走道, 全程无家具无门)
key('d', true);
const moves = [];
for (let i = 0; i < 120; i++) {
  const px = G.player.x, py = G.player.y;
  t = step(1, t);
  moves.push(Math.hypot(G.player.x - px, G.player.y - py));
}
key('d', false);
const mean = moves.reduce((a, b) => a + b, 0) / moves.length;
const std = Math.sqrt(moves.reduce((a, b) => a + (b - mean) * (b - mean), 0) / moves.length);
assert(mean > 2.5 && std / mean < 0.3, '移动速度恒定 (均 ' + mean.toFixed(2) + 'px/帧, 标准差 ' + (std / mean * 100).toFixed(0) + '%)');
assert(G.player.x > 300, '玩家确实向前移动 (' + G.player.x.toFixed(0) + ')');

// --- 阶段4: 机器人墙角脱困(把队友挤进墙角, 应能自行走出) ---
const rA = G.units.find(u => u.name === '红·机A');
rA.blind = 0; rA.speed = 180;
rA.down = false; rA.bleed = 0; rA.dead = false; rA.hp = rA.maxHp;   // 确保可行动(阶段2 对射可能把它打倒过)
// 左户内走廊西北角(两面贴墙: 寻路网格里该格本身不可走) → 应能自行脱困走向餐厅
rA.x = 25; rA.y = 365; rA.ai.state = 'investigate'; rA.ai.tgt = { x: 600, y: 500 };
const startX = rA.x, startY = rA.y;
for (let i = 0; i < 900; i++) t = step(1, t);   // 给足 ~14 秒: 脱困后还要沿走廊走到餐厅
assert(isFinite(rA.x) && isFinite(rA.y), '机器人坐标有限');
assert(Math.hypot(rA.x - startX, rA.y - startY) > 40, '机器人已从墙角脱困移动 (' + rA.x.toFixed(0) + ',' + rA.y.toFixed(0) + ')');

// --- 阶段5: 掉帧(40ms/帧)下射速不降低 —— 时间步放宽的关键验证 ---
// 2.4 秒(60帧×40ms)内应射出 ≈ fireRate×2.4 ≈ 23 发;
// 若时间步被截断到 0.035(旧值)则只有 ~20 发, 断言 ≥21 可区分
G.player.x = 300; G.player.y = 800;
G.player.hp = G.player.maxHp;
G.player.weapon.mag = 30; G.player.weapon.reloading = 0;
G.player.weapon.fireAcc = 0;   // 清空射速积分器残留
aimAt(620, 880);
mouseDown();
for (let i = 0; i < 60; i++) { t += 40; rafCb(t); }
mouseUp();
const fired = 30 - G.player.weapon.mag;
assert(fired >= 21, '掉帧40ms下2.4秒射速正常 (' + fired + ' 发, 期望 ~23)');
console.log('ok: 掉帧时射速不掉 (' + fired + ' 发/2.4秒)');

console.log('PERF & CORNER TEST PASSED');
