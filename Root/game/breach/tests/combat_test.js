// 实战模拟测试:交火、击杀、闪光弹致盲、AI、数值稳定性
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
function redTeamKills() { return sandbox.window.__game.units.filter(u => u.team === 'red').reduce((s, u) => s + u.kills, 0); }
// 用与游戏相同的逆变换把鼠标对准某个世界坐标(地图 2400×1000, 视口 1280×800)
function aimAt(wx, wy) {
  const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500;
  els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 });
}
function mouseDown() { els['cv']._fire('mousedown', { button: 0 }); }
function mouseUp() { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); }
const g = () => sandbox.window.__game;

els['btnStart'].onclick();
const G = g();
let t = performance.now();
const byName = n => G.units.find(u => u.name === n);
const p = G.player;
// 全局隔离:红方机器人致盲(不抢击杀);蓝方全部致盲并挪到远处角落(致盲会原地游走)
for (const u of G.units) if (u.team === 'red' && u.kind === 'robot') { u.blind = 999; u.speed = 0; }
const cornerPos = { '蓝·机1': [620, 880], '蓝·机2': [320, 330], '蓝·机3': [1000, 610], '蓝·机4': [60, 950], '蓝·机5': [660, 330] };
for (const u of G.units) if (u.team === 'blue') { u.blind = 999; u.speed = 0; const c = cornerPos[u.name]; if (c) { u.x = c[0]; u.y = c[1]; } }

// --- 测试1: 玩家交火(左户客厅, 无掩体遮挡;蓝机1 致盲+高血量, 不还击不闪避不死亡) ---
const b1 = byName('蓝·机1');
b1.hp = 500;                         // 拉高血量确保测试1不死(2秒连射≈210伤害)
b1.x = 620; b1.y = 880;
p.x = 250; p.y = 880; p.face = 0;
aimAt(620, 880);
mouseDown();
t = step(120, t);                    // 2 秒连射
mouseUp();
assert(b1.hp > 0 && b1.hp < 500, '玩家射击命中,蓝机1 掉血且存活 (' + b1.hp + ')');
assert(isFinite(b1.x) && isFinite(b1.y), '蓝机1 位置数值正常');

// --- 测试2: 击杀与红方击杀计数 ---
const killsBefore = redTeamKills();
b1.hp = 1;
mouseDown();
t = step(90, t);
mouseUp();
assert(b1.dead, '蓝机1 被击杀');
assert(redTeamKills() === killsBefore + 1, '红方击杀数 +1 (' + killsBefore + '->' + redTeamKills() + ')');

// --- 测试3: 闪光弹致盲 ---
const b2 = byName('蓝·机2');
b2.blind = 0; b2.speed = 0;
b2.x = 500; b2.y = 880; b2.face = Math.PI; // 面向左(面向玩家方向)
p.x = 250; p.y = 880; p.face = 0;
G.grenades.push({ x: b2.x - 60, y: b2.y, vx: 0, vy: 0, type: 'flash', fuse: 0.05, t: 0 });
t = step(10, t);
assert(b2.blind > 0, '蓝机2 被闪光弹致盲 (' + b2.blind.toFixed(2) + 's)');
assert(!b2.dead, '蓝机2 存活(闪光不伤人)');

// --- 测试4: 致盲期间蓝机2 无法反击 ---
const r1 = byName('红·机A');
const r1hp = r1.hp;
t = step(60, t);
assert(r1.hp >= r1hp - 5, '致盲期间红·机A 未被蓝机2 重创 (hp ' + r1hp + '->' + r1.hp + ')');

// --- 测试5: AI 移动正常(解除蓝机3致盲, 放在左户餐厅走动) ---
const b3 = byName('蓝·机3');
b3.blind = 0; b3.speed = 178;
b3.x = 900; b3.y = 540; b3.face = 0;
t = step(60, t);
assert(isFinite(b3.x) && isFinite(b3.y), '蓝·机3 坐标有限 (' + b3.x.toFixed(0) + ',' + b3.y.toFixed(0) + ')');

// --- 测试6: 手雷爆炸伤害 ---
const b4 = byName('蓝·机4');
b4.blind = 0; b4.speed = 0;
b4.x = 900; b4.y = 540;
G.grenades.push({ x: 900, y: 540, vx: 0, vy: 0, type: 'frag', fuse: 0.05, t: 0 });
t = step(12, t);
assert(b4.dead || b4.hp < b4.maxHp, '蓝·机4 被手雷杀伤 (' + b4.hp + ')');

// --- 测试7: 长期模拟无 NaN / 无崩溃 ---
t = step(600, t);
let bad = 0;
for (const u of G.units) if (!isFinite(u.x) || !isFinite(u.y)) bad++;
assert(bad === 0, '所有单位坐标有限 (' + bad + ' bad)');
const r = G.result();
assert(r === null || r === 'win' || r === 'lose', '游戏状态正常 result=' + r);

console.log('COMBAT TEST PASSED');
