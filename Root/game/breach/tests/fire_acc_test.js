// fireAcc 上限修复验证: 长时间不开火后按下, 不会瞬间打光弹匣
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
function newEnv() {
  const els = {}; let rafCb = null; const listeners = {}; const store = {};
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
  els['btnStart'].onclick();
  const G = sb.window.__game;
  const aimAt = (wx, wy) => { const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500; els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); };
  const mouseDown = () => els['cv']._fire('mousedown', { button: 0 });
  const mouseUp = () => { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); };
  let t = performance.now();
  const frames = (n, step) => { for (let i = 0; i < n; i++) { t += (step || 16); rafCb(t); } };
  return { G, p: G.player, aimAt, mouseDown, mouseUp, frames };
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// A) 核心回归: 长时间不开枪(搜索 6.4s), 按下瞬间不应清空弹匣
{
  const E = newEnv();
  const { G, p, aimAt, mouseDown, mouseUp, frames } = E;
  aimAt(600, 540);
  frames(400);                       // 6.4s 不开枪(旧代码: fireAcc 攒到 60+)
  const accBefore = p.weapon.fireAcc;
  mouseDown();
  frames(3);                         // 按下后仅 3 帧
  const mag3 = p.weapon.mag;
  frames(30);                        // 再跑 30 帧(约 0.48s, 正常应消耗 ~4 发)
  const mag30 = p.weapon.mag;
  ok(accBefore <= 1.01, '长时间不开火 fireAcc 被限制在 1 (' + accBefore.toFixed(2) + ')');
  ok(mag3 >= 29, '按下瞬间不爆发 (3 帧后 mag=' + mag3 + ', 旧代码会直接 0)');
  ok(mag30 >= 24 && mag30 <= 28, '之后按正常射速消耗 (30帧后 mag=' + mag30 + ', 期望 ~26)');
  mouseUp();
}

// B) 连射射速不变: 按住 200 帧(3.2s)应约打光 30 发
{
  const E = newEnv();
  const { p, aimAt, mouseDown, mouseUp, frames } = E;
  aimAt(600, 540);
  mouseDown();
  frames(200);
  mouseUp();
  const spent = 30 - p.weapon.mag;
  ok(spent >= 26 && spent <= 30, '按住 200 帧(3.2s)消耗 ' + spent + ' 发 (期望 ~30, 射速 9.5/s 不变)');
}

// C) AI 侧: 蓝机巡逻 6.4s 后遭遇玩家, 不应瞬间打光弹匣
{
  const E = newEnv();
  const { G, aimAt, frames } = E;
  const blue = G.units.find(u => u.team === 'blue');
  aimAt(600, 540);
  frames(400);                       // 巡逻期(旧代码: fireAcc 无限攒)
  ok(blue.weapon.fireAcc <= 1.01, 'AI fireAcc 同样受限 (' + blue.weapon.fireAcc.toFixed(2) + ')');
  // 把蓝机放到玩家面前并强制战斗
  blue.x = G.player.x + 150; blue.y = G.player.y;
  blue.ai.state = 'combat'; blue.ai.pending = null;
  blue.ai.lastSee = 999999; blue.ai.lastTarget = G.player;
  blue.ai.burst = 4;
  frames(10);
  const spentAI = blue.weapon.magSize - blue.weapon.mag;
  ok(spentAI <= 2, 'AI 进入战斗 10 帧内最多打 ' + spentAI + ' 发 (旧代码会瞬间清空)');
}

// D) 掉帧补射不受影响: 40ms 大时间步下射速正常
{
  const E = newEnv();
  const { p, aimAt, mouseDown, mouseUp } = E;
  aimAt(600, 540);
  mouseDown();
  E.frames(60, 40);   // 40ms/帧 掉帧, 共 2.4s
  mouseUp();
  const shots = 30 - p.weapon.mag;
  ok(shots >= 19, '40ms 掉帧下 2.4s 打出 ' + shots + ' 发 (期望 ~23, 上限不影响掉帧补射)');
}

console.log(pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
