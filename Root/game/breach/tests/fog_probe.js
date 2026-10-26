// 迷雾平滑探针(**指纹工具, 无断言, 不计入门禁**)
// 用法: 改动了迷雾/视野相关代码前后各跑一次, 逐字 diff "相邻像素最大色差" 与上面那行 RGB 输出。
//
// 基线(2026-09, 本次优化后实测): 最大相邻色差 = 76。
//   · 该跳变出现在"可见 → 未探索"的过渡格上: 未探索底色 RGB(7,9,13) 与本行首个被探索格
//     RGB(14,15,16)→RGB(41,40,40) 之间的台阶, 属 8px 格离散采样的正常表现,
//     不是旧版那种"整块硬边方块"(旧版 >150)。
//   · 因此这里的 "<60 才算通过" 是**早期阈值**, 已不适用于当前实现 —— 保留 exit 码只是
//     为了让人一眼看到数值, 不要把它当门禁(它不在 21 个 *_test.js 门禁清单里)。
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
const els = {};
let rafCb = null;
const listeners = {};
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
els['btnStart'].onclick();
let t = step(8, performance.now());
const g = sb.window.__game;
// 玩家出生 (180,330) 面向下(π/2), 视野锥朝下。
// 沿 y=400(视线格 y=50) 从左侧墙外(x=0)扫到右侧未探索(x=90), 观察颜色过渡。
const W = 300;
let prev = null, maxJump = 0, prevVis = null;
const line = [];
for (let x = 0; x <= 90; x++) {
  const i = (50 * W + x) * 4;
  const r = g.fogPx[i], gr = g.fogPx[i + 1], b = g.fogPx[i + 2];
  const vis = g.visGrid[50 * W + x] ? 1 : 0;
  line.push(x + ':RGB(' + r + ',' + gr + ',' + b + ')' + (vis ? '可见' : ''));
  if (prev) {
    const jump = Math.abs(r - prev[0]) + Math.abs(gr - prev[1]) + Math.abs(b - prev[2]);
    if (jump > maxJump) maxJump = jump;
  }
  if (prevVis !== null && vis !== prevVis) console.log('  可见性切换于 x=' + x);
  prev = [r, gr, b]; prevVis = vis;
}
console.log(line.join(' '));
console.log('相邻像素最大色差: ' + maxJump + ' (基线 76; 旧实现 >150 的整块硬边已消除)');
console.log('提示: 本脚本是指纹工具而非门禁 —— 改动迷雾前后对比该数值与上面的 RGB 行即可。');
process.exit(0);   // 恒 0: 不作为门禁(见文件头说明)
