// 验证: 失焦/暂停后不会"幽灵连射"打空弹匣
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
const store = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  location: { href: '' }, setTimeout, clearTimeout
};
store['breach_game_cfg'] = JSON.stringify({ diff: 'norm', weapon: 'ar', upgrades: {} });
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);

function aimAt(wx, wy) { const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500; els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); }
function key(k) { for (const fn of listeners['doc:keydown'] || []) fn({ key: k, toLowerCase: () => k, repeat: false, preventDefault() {} }); for (const fn of listeners['doc:keyup'] || []) fn({ key: k, toLowerCase: () => k, repeat: false, preventDefault() {} }); }
// 鼠标松开: 游戏监听在 window 上, 必须触发 window:mouseup 才生效
function mouseUp() { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); }
els['btnStart'].onclick();
const G = sb.window.__game;
const p = G.player;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

let t = performance.now();
function frames(n) { for (let i = 0; i < n; i++) { t += 16; rafCb(t); } }

// 1) 按住开火 30 帧(正常射击)
aimAt(600, 540);
els['cv']._fire('mousedown', { button: 0 });
frames(30);
ok(G.mouseDown === true, '按住时 mouse.down=true');
const magAfterShoot = p.weapon.mag;
ok(magAfterShoot < 30, '按住期间正常射击 (mag=' + magAfterShoot + ')');

// 2) 窗口失焦(松开事件丢失: 不触发 mouseup)
for (const fn of listeners['window:blur'] || []) fn({});
ok(G.mouseDown === false, '失焦后 mouse.down 被清空');
frames(30);
const magAfterBlur = p.weapon.mag;
ok(magAfterBlur === magAfterShoot, '失焦期间(已暂停)不再消耗弹药');

// 3) 切回恢复(空格取消暂停), 此时没有按住鼠标 → 不应自动开火
key(' ');
frames(60);
ok(p.weapon.mag === magAfterBlur, '恢复后无幽灵连射 (mag 保持 ' + p.weapon.mag + ')');

// 4) 暂停菜单打开时按住 → 恢复后松开 → 松开即停(不再连射)
els['cv']._fire('mousedown', { button: 0 });
key(' ');   // 暂停(进入暂停时输入被清空)
els['cv']._fire('mousedown', { button: 0 }); // 暂停菜单里"按住"
frames(10);
mouseUp();  // 在菜单上松开 → window mouseup 正常触发
key(' ');   // 恢复
frames(30);
ok(G.mouseDown === false && p.weapon.mag === magAfterBlur, '恢复后松开即停 (mag 保持 ' + p.weapon.mag + ')');

// 5) 正常按住仍可射击(未破坏开火)
els['cv']._fire('mousedown', { button: 0 });
frames(40);
mouseUp();
const magFinal = p.weapon.mag;
ok(magFinal < magAfterBlur, '正常按住仍可射击 (mag=' + magFinal + ')');
// 松开后不再消耗
const magIdle = magFinal;
frames(40);
ok(p.weapon.mag === magIdle, '松开后停止射击 (mag 保持 ' + p.weapon.mag + ')');

console.log(pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
