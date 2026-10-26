// 冒烟测试:在 Node 沙箱中运行游戏脚本,模拟开始游戏并步进若干帧
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('NO SCRIPT'); process.exit(1); }
const code = m[1];

// ---- DOM/Canvas 桩 ----
function makeCtx() {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(t, {
    get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; },
    set(ta, p, v) { ta[p] = v; return true; }
  });
}
const ctxStub = makeCtx();
function makeEl() {
  return {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => ctxStub, onclick: null
  };
}
const els = {};
let rafCb = null;
const listeners = {};
const sandbox = {
  console,
  performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: {
    innerWidth: 1280, innerHeight: 800,
    addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); },
    AudioContext: undefined, webkitAudioContext: undefined
  },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window.window = sandbox.window;

let loadErr = null;
try {
  vm.runInNewContext(code, sandbox, { filename: 'game.js' });
  console.log('LOAD OK');
} catch (e) {
  console.log('LOAD ERROR: ' + e.stack);
  process.exit(1);
}

function dispatch(ev, obj) {
  for (const fn of listeners['doc:' + ev] || []) fn(obj);
}
function step(n, t0) {
  let t = t0;
  for (let i = 0; i < n; i++) {
    t += 16;
    rafCb(t);
  }
  return t;
}

const g = sandbox.window.__game;
console.log('hook:', !!g);
// 开始游戏
els['btnStart'].onclick();
console.log('started, units=' + g.units.length);
// 走 60 帧(1秒)
let t = step(60, performance.now());
console.log('after 60 frames ok, result=' + g.result());

// 模拟扔手雷:按住 G -> 移动鼠标 -> 松开 G
dispatch('keydown', { key: 'g', repeat: false, preventDefault() {} });
const p0 = g.player;
p0.frags = 1;
t = step(10, t);
dispatch('keyup', { key: 'g' });
console.log('after throw, grenades=' + g.grenades.length);

// 继续跑 4 秒,手雷应该爆炸
t = step(250, t);
console.log('after explosion sim, grenades=' + g.grenades.length + ' result=' + g.result());

// 让蓝队全部阵亡 -> 应该红队胜利
for (const u of g.units) if (u.team === 'blue') u.dead = true;
t = step(5, t);
console.log('all blue dead, result=' + g.result());
t = step(120, t);
console.log('end shown? endOverlay hidden-class removed? overlay=' + JSON.stringify(els['endOverlay'].classList));

// 测试暂停
pausedTest: {
  t = step(2, t);
  dispatch('keydown', { key: ' ', repeat: false, preventDefault() {} });
  t = step(2, t);
  dispatch('keydown', { key: ' ', repeat: false, preventDefault() {} });
  t = step(2, t);
  console.log('pause toggles ok');
}

// 重新开始
els['btnRestart'].onclick();
t = step(30, t);
console.log('restart ok, units=' + g.units.length);
console.log('SMOKE TEST PASSED');
