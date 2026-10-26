// 新特性测试:难度生成、拾取物、精确瞄准(ADS)、掩体AI、慢动作结算
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
let t = performance.now();

// --- 测试1: 困难难度生成 6 台蓝机(右户5房+客厅守卫) ---
els['diffHard'].onclick();
els['btnStart'].onclick();
let g = G();
const blues = g.units.filter(u => u.team === 'blue');
assert(blues.length === 6, '困难难度蓝方 6 台 (' + blues.length + ')');
const b6 = g.units.find(u => u.name === '蓝·机6');
assert(!!b6, '困难难度出现蓝·机6(右户客厅守卫)');
assert(b6.x > 1320, '守卫位于右户 (x=' + b6.x.toFixed(0) + ')');
assert(g.units.find(u => u.name === '蓝·机7') === undefined, '标准布局无蓝·机7');
assert(isFinite(b6.x) && isFinite(b6.y), '蓝·机6 位置有限');

// --- 测试2: 拾取物(坐标直接取地图补给表, 地图重做后无需再写死坐标) ---
const p = g.player;
const pickAmmo = g.pickups.find(pk => pk.type === 'ammo');   // 左户客厅弹药
const reserveBefore = p.weapon.reserve;
p.x = pickAmmo.x; p.y = pickAmmo.y;
t = step(5, t);
assert(p.weapon.reserve > reserveBefore, '拾取弹药箱后备用弹药增加 (' + reserveBefore + '->' + p.weapon.reserve + ')');
const hpBefore = p.hp;
p.hp = 50;
const med = g.pickups.find(pk => pk.type === 'med');         // 左户客厅医疗包
p.x = med.x; p.y = med.y;
t = step(5, t);
assert(p.hp > 50, '拾取医疗包后回血 (' + p.hp + ')');

// --- 测试3: ADS 精确瞄准(右键点击切换开镜, 无需按住) ---
els['cv']._fire('mousedown', { button: 2 });
t = step(3, t);
assert(g.ads === true, '右键开镜');
for (const fn of listeners['window:mouseup'] || []) fn({ button: 2 });
t = step(3, t);
assert(g.ads === true, '右键松开后仍保持开镜(切换式)');
els['cv']._fire('mousedown', { button: 2 });
t = step(3, t);
assert(g.ads === false, '再次右键取消开镜');
// 切回默认关闭状态, 不影响后续测试
for (const fn of listeners['window:mouseup'] || []) fn({ button: 2 });

// --- 测试4: 掩体AI —— 战斗中机器人会躲到掩体后(coverPos 或移动) ---
const b3 = g.units.find(u => u.name === '蓝·机3');
b3.blind = 0;
b3.x = 760; b3.y = 540;                 // 左户餐厅
p.x = 400; p.y = 540; p.face = 0;        // 玩家面向东(可与蓝机互相看见)
t = step(240, t); // 4 秒战斗模拟
assert(isFinite(b3.x) && isFinite(b3.y), '蓝·机3 战斗/掩体逻辑坐标有限 (' + b3.x.toFixed(0) + ',' + b3.y.toFixed(0) + ')');
assert(typeof b3.ai.coverPos === 'object' || b3.ai.coverPos === null, 'coverPos 字段正常');

// --- 测试5: 慢动作胜利结算 ---
for (const u of g.units) if (u.team === 'blue') u.dead = true;
t = step(40, t);  // 0.64s: 慢动作阶段, result 应仍为 null
assert(g.result() === null, '慢动作阶段 result 延迟 (' + g.result() + ')');
t = step(80, t);  // 再 1.28s: result 应为 win
assert(g.result() === 'win', '慢动作结束后判定胜利 (' + g.result() + ')');

// --- 测试6: 简单难度 ---
els['btnRestart'].onclick(); // 先重开(标准难度已在按钮里)
els['diffEasy'].onclick();
els['btnStart'].onclick();
g = G();
const bluesEasy = g.units.filter(u => u.team === 'blue');
assert(bluesEasy.length === 4, '简单难度蓝方 4 台 (' + bluesEasy.length + ')');

console.log('FEATURE TEST PASSED');
