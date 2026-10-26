// 霰弹枪: 多弹丸扇形 + 贴脸伤害 + 点击即射(扳机延迟回归) + 连点不能绕过射速
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
  // 预设配置: 霰弹枪(必须在 vm 创建前注入, 游戏内 typeof localStorage 判定)
  localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl()),
    createElement: () => makeEl(),
    addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
  },
  location: { href: '' }, setTimeout, clearTimeout
};
store['breach_game_cfg'] = JSON.stringify({ diff: 'norm', weapon: 'shotgun', upgrades: {} });
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);

function aimAt(wx, wy) { const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500; els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); }
let t = performance.now();
function frames(n) { for (let i = 0; i < n; i++) { t += 16; rafCb(t); } }
function mouseDown() { els['cv']._fire('mousedown', { button: 0 }); }
function mouseUp() { for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 }); }
els['btnStart'].onclick();
const G = sb.window.__game;
const p = G.player;
// 冻结两名红方机器人(训练靶模式, 不移动不射击): 否则它们会顺手打靶/走动挡枪线, 伤害归因就混了
for (const u of G.units) if (u.team === 'red' && u !== p) u.train = true;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

ok(p.weapon.magSize === 8 && p.weapon.mag === 8, '霰弹枪弹匣 8');
ok(G.weaponName === '霰弹枪', '配置读取为霰弹枪');
ok(p.weapon.pellets === 8, 'pellets=8');

// 靶子: 高血蓝机放在玩家面前 60px(无家具的过道), 玩家开一枪
const target = G.units.find(u => u.team === 'blue');
target.x = p.x + 60; target.y = p.y;
target.hp = 9999; target.maxHp = 9999;
target.train = true;   // 固定为训练靶: 无 AI 完全静止, 否则交战中移动会让弹丸偶发落空
aimAt(target.x, target.y);
// --- 扳机延迟回归: 点击当帧就该出膛(旧实现要按住 1/1.7 ≈ 0.59s, 快点一下完全没反应) ---
const magBefore = p.weapon.mag;
mouseDown();
frames(1);
ok(p.weapon.mag === magBefore - 1, '点击即射: 按下当帧出膛 (mag ' + magBefore + '→' + p.weapon.mag + ')');
mouseUp();   // 只按一帧 = 点一下(不按住, 否则泵动会连续出弹)
const hp0 = target.hp;
let peakPellets = 0, peakAngs = null;
for (let f = 0; f < 60; f++) {
  const mine = G.bullets.filter(b => b.owner === p);
  if (mine.length > peakPellets) {
    peakPellets = mine.length;
    peakAngs = mine.map(b => Math.atan2(b.y - p.y, b.x - p.x)).sort((a, b) => a - b);
  }
  frames(1);
}

ok(peakPellets === p.weapon.pellets, '一枪生成 ' + p.weapon.pellets + ' 颗弹丸 (峰值 ' + peakPellets + ')');
if (peakAngs && peakAngs.length === p.weapon.pellets) {
  const span = peakAngs[peakAngs.length - 1] - peakAngs[0];
  ok(span > 0.05 && span < 0.2, '弹丸扇形展开合理 (' + span.toFixed(3) + ' rad)');
} else ok(false, '扇形检查需 ' + p.weapon.pellets + ' 颗弹丸');
ok(p.weapon.mag === magBefore - 1, '点一下只出 1 发 (剩余 ' + p.weapon.mag + ')');
// 单颗实际伤害 = 11 × 随机 0.85~1.15 × (8% 暴击 1.6) → 8 颗全中落在 74.8~161.9 之间
const dmgTaken = hp0 - target.hp;
ok(dmgTaken >= 70, '贴脸 8 颗全中 = 88 伤(单发随伤害浮动, 实际 ' + dmgTaken.toFixed(1) + ')');

// 弹丸全部消失(飞行 1.1s 内)
for (let f = 0; f < 120 && G.bullets.filter(b => b.owner === p).length > 0; f++) frames(1);
ok(G.bullets.filter(b => b.owner === p).length === 0, '弹丸飞行结束全部消失');

// --- 远距离: 0.1rad 固定扇面散开(500px 处弹丸间距约 7px) → 只可能中 4 颗以内,
//     永远打不出贴脸的 88 伤(天然衰减, 不是"远近通吃的步枪")。取户型图里唯一的 500px 通视向 ---
{
  const far = G.units.filter(u => u.team === 'blue' && u !== target && !u.dead && !u.down)[0];
  if (far) {
    target.x = p.x - 120; target.y = p.y - 120;   // 近靶挪开, 别挡枪线
    far.x = p.x + 483; far.y = p.y + 129;         // 户型图 (783,949): 500px 外通视、无家具拦截
    far.hp = 9999; far.maxHp = 9999; far.train = true;
    aimAt(far.x, far.y);
    const mag0 = p.weapon.mag;
    p.weapon.fireAcc = 0; frames(Math.ceil(0.7 / 0.016));   // 等一个泵动周期, 重新上膛
    mouseDown(); frames(1); mouseUp();
    ok(p.weapon.mag === mag0 - 1, '远距离那一发也当帧出膛 (mag ' + mag0 + '→' + p.weapon.mag + ')');
    const farHp0 = far.hp;
    frames(90);   // 让弹丸飞完 500px(1200px/s ≈ 0.42s)
    const farDmg = farHp0 - far.hp;
    // 8 颗弹丸间距 7.1px、扇面全宽 50px > 靶子直径 22px → 最多同时命中 4 颗;
    // 单颗最多 11 × 1.15 × 1.6 ≈ 20.24, 所以 4 颗上限约 81(贴脸全中是 74.8 起)
    ok(farDmg <= 81, '500px 处最多中 4 颗(实际 ' + farDmg.toFixed(1) + ' ≤ 81, 远距离天然衰减)');
  } else ok(false, '找到一具远处的蓝机做衰减检查');
}

// --- 连点不能绕过射速: 5 次快点(每次间隔约 96ms, 合计 < 1 个泵动周期 0.5s)只该出 1 发 ---
{
  const w = p.weapon;
  w.mag = w.magSize;
  w.fireAcc = 0;
  frames(Math.ceil(0.7 / 0.016));   // 待机回充: 攒满 1 发
  const before = w.mag;
  for (let i = 0; i < 5; i++) { mouseDown(); frames(2); mouseUp(); frames(4); }
  const shots = before - w.mag;
  ok(shots === 1, '连点 5 次只出 1 发(射速上限不被点击绕过, 实际 ' + shots + ' 发)');
  frames(90);   // 清理飞行中的弹丸
}

console.log(pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
