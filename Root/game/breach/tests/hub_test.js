// 联动测试: 游戏页装备/升级应用 + 战绩存档 + 战前准备页交互
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = path.join(__dirname, '..');   // 项目根目录(本文件位于 tests/ 子目录)
function readHtml(name) {
  const h = fs.readFileSync(path.join(DIR, name), 'utf8');
  return h.match(/<script>([\s\S]*?)<\/script>/)[1];
}
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
function makeSandbox(store, location) {
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
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: location || { href: '' },
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox; sandbox.window.window = sandbox.window;
  sandbox._els = els; sandbox._rafCb = () => rafCb; sandbox._listeners = listeners;
  return sandbox;
}
function step(sb, n, t0) {
  let t = t0;
  for (let i = 0; i < n; i++) { t += 16; sb._rafCb()(t); }
  return t;
}
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }

// ============ A. 游戏页: 应用准备页配置 ============
{
  const store = {};
  store['breach_game_cfg'] = JSON.stringify({
    diff: 'hard', weapon: 'shotgun', map: 'warehouse',
    upgrades: { hp: 3, speed: 2, aim: 3, vision: 3, ammo: 2, frag: 2, flash: 1, robHp: 3, robDmg: 3 }
  });
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html'), sb);
  sb._els['btnStart'].onclick();
  const g = sb.window.__game;
  const p = g.player;
  assert(g.mapId === 'warehouse', '准备页地图配置生效 (warehouse)');
  assert(Math.abs(p.x - 560) < 5 && Math.abs(p.y - 300) < 5, '仓库地图红方出生点 (560,300) (' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ')');
  assert(p.maxHp === 175, '生命强化3级 → 生命上限 175 (' + p.maxHp + ')');
  assert(p.frags === 5 && p.flashes === 4, '手雷×5 闪光×4 (' + p.frags + '/' + p.flashes + ')');
  assert(p.weapon.magSize === 8 && p.weapon.reserve === 116, '霰弹枪 8发/备弹116 (' + p.weapon.magSize + '/' + p.weapon.reserve + ')');
  assert(p.speed === 226, '机动强化2级 → 速度 226 (' + p.speed + ')');
  assert(p.visionDist === 818, '视野扩展3级 → 818 (' + p.visionDist + ')');
  const rA = g.units.find(u => u.name === '红·机A');
  assert(rA.maxHp === 115, '队友装甲3级 → 机器人生命 115 (' + rA.maxHp + ')');
  assert(rA.weapon.dmg === 16, '队友火力3级 → 机器人伤害 16 (' + rA.weapon.dmg + ')');
  const blues = g.units.filter(u => u.team === 'blue');
  assert(blues.length === 6, '困难难度 6 台蓝机 (' + blues.length + ')');
  assert(g.units.find(u => u.name === '蓝·机6') !== undefined, '困难难度有客厅守卫蓝·机6');
  assert(sb._els['loadoutInfo'].textContent.indexOf('霰弹枪') >= 0, '开始界面显示装备信息 (' + sb._els['loadoutInfo'].textContent + ')');

  // 胜利 → 存档军功点
  let t = performance.now();
  for (const u of g.units) if (u.team === 'blue') u.dead = true;
  t = step(sb, 200, t);   // 慢动作0.7s + 结算延迟1.3s
  assert(g.result() === 'win', '红队胜利 (' + g.result() + ')');
  const sv = JSON.parse(store['breach_game_save']);
  assert(sv.points === 6, '胜利获得军功点 3+3星 (' + sv.points + ')');
  assert(sv.stats.wins === 1 && sv.stats.losses === 0, '战绩记录胜利 (' + JSON.stringify(sv.stats) + ')');
  console.log('ok: 游戏页装备/升级/存档联动全部生效');
}

// ============ B. 战前准备页: 升级/选装/难度/开始行动 ============
{
  const store = {};
  store['breach_game_save'] = JSON.stringify({ points: 10, stats: { wins: 3, losses: 1, kills: 12, damage: 900, bestStars: 2 } });
  const sb = makeSandbox(store, { href: '' });
  vm.runInNewContext(readHtml('game/hub.html'), sb);
  const E = sb._els;
  // 初始渲染
  assert(String(E['stWins'].textContent) === '3', '战绩胜利数显示 3 (' + E['stWins'].textContent + ')');
  assert(String(E['pts'].textContent).indexOf('10') >= 0, '军功点显示 10');
  assert(E['upBtn_hp'].disabled === false, '升级按钮可用(点数充足)');
  // 购买升级
  E['upBtn_hp'].onclick();
  const cfg1 = JSON.parse(store['breach_game_cfg']);
  assert(cfg1.upgrades.hp === 1, '购买生命强化后 cfg.upgrades.hp=1');
  const sv1 = JSON.parse(store['breach_game_save']);
  assert(sv1.points === 9, '军功点 10→9');
  // 连买两级的成本验证(第2级2点)
  E['upBtn_hp'].onclick();
  const sv2 = JSON.parse(store['breach_game_save']);
  assert(sv2.points === 7, '第二级花费2点, 剩 7 (' + sv2.points + ')');
  // 选武器/难度
  E['btnWSmg'].onclick();
  const cfg2 = JSON.parse(store['breach_game_cfg']);
  assert(cfg2.weapon === 'smg', '选择冲锋枪写入配置');
  assert(String(E['weaponInfo'].innerHTML).indexOf('冲锋枪') >= 0, '武器信息面板更新为冲锋枪');
  E['diffHard'].onclick();
  const cfg3 = JSON.parse(store['breach_game_cfg']);
  assert(cfg3.diff === 'hard', '选择困难难度写入配置');
  E['btnMapWarehouse'].onclick();
  const cfgMap = JSON.parse(store['breach_game_cfg']);
  assert(cfgMap.map === 'warehouse', '选择仓库地图写入配置');
  E['btnMapFactory'].onclick();
  assert(JSON.parse(store['breach_game_cfg']).map === 'factory', '选择工厂地图写入配置');
  // 开始行动 → 跳转游戏页
  E['btnGo'].onclick();
  assert(sb.location.href === 'breach.html', '开始行动跳转游戏页 (' + sb.location.href + ')');
  // 重置进度
  E['btnReset'].onclick();
  assert(store['breach_game_cfg'] === undefined && store['breach_game_save'] === undefined, '重置进度清空存档');
  console.log('ok: 战前准备页交互全部生效');
}

console.log('HUB TEST PASSED');
