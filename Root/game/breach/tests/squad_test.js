// 战术指令系统验证: 选人(1/2/3) / 指令模式(X+左键移动) / 跟随(C) / 固守(V) / 集火(B)
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
    appendChild() {}, className: '', disabled: false, checked: false,
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
function mouseUp() { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); }
els['btnStart'].onclick();
const G = sb.window.__game;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }
let t = performance.now();
function frames(n) { for (let i = 0; i < n; i++) { t += 16; rafCb(t); } }

const rA = G.units.find(u => u.name === '红·机A');
const rB = G.units.find(u => u.name === '红·机B');
const p = G.player;
ok(!!rA && !!rB, '红方机器人 A/B 存在');
ok(G.selMask === 3, '默认全选 selMask=3 (' + G.selMask + ')');

// 1) 键盘 1 → 只选 A
key('1');
ok(G.selMask === 1 && G.isSelected(rA) && !G.isSelected(rB), '按 1 只选 红·机A');
// 2) 键盘 3 → 全选
key('3');
ok(G.selMask === 3, '按 3 全选');

// 3) X 进入指令模式(初始 false → true)
key('x');
ok(G.orderMode === true, '按 X 进入指令模式');
ok(p.weapon.mag === 30, '指令模式本身不开火 (mag=30)');

// 3b) 指令模式下按 1 → 只选 A(此时对空地点命令只影响 A)
key('1');
ok(G.selMask === 1, '指令模式下按 1 只选 A');

frames(12);   // 让出生碰撞解析把压在桌上的机器人推出到地面

// 4) 指令模式下左键点地面 → 给选中红机下移动命令(不开火)
// 容错: 从机器人当前位置沿 +x 找最近的可行走可达点作为命令目标
const moveGrid2 = G.moveGrid;
const walk2 = (x, y) => { const cx = Math.floor(x / 16), cy = Math.floor(y / 16); return cx >= 0 && cy >= 0 && cx < 150 && cy < 62 && moveGrid2[cx + cy * 150] === 1; };
let tx = rA.x, ty = rA.y, reachable = false;
for (let d = 120; d <= 900 && !reachable; d += 60) {
  const cand = rA.x + d;
  for (const yy of [rA.y, rA.y - 80, rA.y + 80]) {
    if (yy < 60 || yy > 920 || cand < 60 || cand > 2300) continue;
    if (walk2(cand, yy) && G.findPath(rA.x, rA.y, cand, yy)) { tx = cand; ty = yy; reachable = true; break; }
  }
}
ok(reachable, '命令点对红机A可达 (' + tx.toFixed(0) + ',' + ty.toFixed(0) + ')');
const ammoBefore = p.weapon.mag;
aimAt(tx, ty);
els['cv']._fire('mousedown', { button: 0 });
mouseUp();
ok(G.mouseDown === false, '指令模式下左键不进入开火状态');
ok(p.weapon.mag === ammoBefore, '指令模式下点击不耗弹');
ok(rA.ai.cmd && rA.ai.cmd.type === 'move', '红机A 收到移动命令 (' + (rA.ai.cmd && rA.ai.cmd.type) + ')');
ok(Math.abs(rA.ai.cmd.x - tx) < 30 && Math.abs(rA.ai.cmd.y - ty) < 30, '命令点坐标正确');
ok(!rB.ai.cmd, '未选中红机B 不收命令');

// 5) 红机A 朝命令点移动并到达后就地固守
const d0 = Math.hypot(rA.x - tx, rA.y - ty);
frames(300);   // ~4.8s, 足够走过数百 px
const d1 = Math.hypot(rA.x - tx, rA.y - ty);
ok(d1 < d0 - 40, '红机A 朝命令点移动 (d0=' + d0.toFixed(0) + ' → d1=' + d1.toFixed(0) + ')');
ok(rA.ai.cmd && rA.ai.cmd.type === 'hold', '到达后红机A 转固守待命 (' + (rA.ai.cmd && rA.ai.cmd.type) + ')');

// 6) X 再次按下 → 退出指令模式
key('x');
ok(G.orderMode === false, '再次按 X 退出指令模式');

// 7) V 固守原地 / C 跟随我(清除命令回默认跟随)
key('3');
key('v');
ok(rB.ai.cmd && rB.ai.cmd.type === 'hold', '按 V 红机B 固守原地');
key('c');
ok(rB.ai.cmd === null, '按 C 红机B 恢复跟随(命令清除)');

// 8) B 集火: 把一台蓝机放到红方视野内(可见) → 按 B 应下发 attack 命令
{
  const blue = G.units.find(u => u.team === 'blue');
  blue.x = 640; blue.y = 820; blue.vx = 0; blue.vy = 0;   // 与玩家同客厅, 直接可见
  frames(10);                                            // 让团队视野标记 vis
  ok(blue.vis === true, '蓝机已被红方看见 (vis=' + blue.vis + ')');
  aimAt(blue.x, blue.y);
  key('3');
  key('b');
  ok(rA.ai.cmd && rA.ai.cmd.type === 'attack' && rA.ai.cmd.tgtId === blue.id, '按 B 红机A 收到集火命令');
  ok(rB.ai.cmd && rB.ai.cmd.type === 'attack' && rB.ai.cmd.tgtId === blue.id, '按 B 红机B 收到集火命令');
  key('c');   // 清理, 避免影响后续
}

// 9) 指令模式下右键应退出指令模式(而非开镜)
key('x');
ok(G.orderMode === true, '再次进入指令模式');
els['cv']._fire('mousedown', { button: 2 });
ok(G.orderMode === false, '指令模式下按右键退出指令模式');

// 10) 开火在退出指令模式后恢复正常
const mag0 = p.weapon.mag;
aimAt(600, 540);
els['cv']._fire('mousedown', { button: 0 });
frames(25);
mouseUp();
ok(p.weapon.mag < mag0, '退出指令模式后左键恢复开火 (mag ' + mag0 + '→' + p.weapon.mag + ')');

console.log(pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
