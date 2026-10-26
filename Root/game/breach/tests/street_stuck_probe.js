// 探针(非门禁): 《长街尸潮》"卡死"体检 —— 玩家会不会被尸群/载具/自建工事顶死
//   A 开阔地接近   丧尸从 520px 外能不能真的贴到玩家(分流/绕行有没有把 AI 变成"绕圈不打人")
//   B 绕过障碍     玩家贴载具时, 另一侧的丧尸能不能绕过来
//   C 被围         玩家四周一圈贴身丧尸时, 还能不能横向走开
//   D 队友         跟随时会不会压成一团不动
//   F 整波         30 只两端出发, 是否全部能摸到玩家(波次能不能清空)
//   H/I 定点       载具夹缝等已知死角: 各方向一步位移 + 多半径可走性 + 网格 ASCII
//   G 模糊         90 秒随机走位: 统计"按着方向却推不动"的时长(强化面板这类正常暂停会被排除)
// 用法: node street_stuck_probe.js   (不参与门禁, 恒退出 0)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'game', 'street.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() { } }),
  };
  return new Proxy(t, {
    get(ta, p) { if (!(p in ta)) ta[p] = () => { }; return ta[p]; },
    set(ta, p, v) { ta[p] = v; return true; }
  });
}
const ctxStub = makeCtx();
function makeEl() {
  const ls = {};
  const el = {
    style: {}, classList: { add() { }, remove() { }, toggle() { } },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    appendChild(c) { el.children.push(c); return c; }, disabled: false, className: '', textContent: '', innerHTML: '',
    width: 0, height: 0, getContext: () => ctxStub, onclick: null, children: [],
  };
  return el;
}
let listeners = {}, store = {}, S = null, els = null, sb = null, rafCb = null;
function makeSandbox() {
  const e = {};
  let raf = null;
  const box = {
    console,
    performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
    window: {
      innerWidth: 1280, innerHeight: 800,
      addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); },
      AudioContext: undefined, webkitAudioContext: undefined
    },
    document: {
      getElementById: (id) => e[id] || (e[id] = makeEl()),
      createElement: () => makeEl(),
      addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); }
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    location: { href: '' }, setTimeout, clearTimeout
  };
  box.globalThis = box;
  box.window.window = box.window;
  return { sb: box, els: e, raf: () => raf };
}
function boot() {
  listeners = {}; store = {}; rafCb = null;
  S = makeSandbox(); els = S.els; sb = S.sb;
  vm.runInNewContext(code, sb, { filename: 'street.js' });
  rafCb = S.raf();
  els['btnStart'].onclick();
  return sb.window.__game;
}
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function key(k, down) {
  const ev = { key: k, repeat: false, preventDefault() { } };
  for (const fn of (listeners['doc:' + (down ? 'keydown' : 'keyup')] || [])) fn(ev);
}
const D = (u, x, y) => Math.hypot(u.x - x, u.y - y);
function killAllZombies(G) { for (const u of G.units.slice()) if (u.kind === 'zombie' && !u.dead) G.killUnit(u, G.player); }

let problems = 0;
function report(name, bad, detail) {
  if (bad) problems++;
  console.log((bad ? '  ⚠ ' : '  ✓ ') + name + (detail ? ' — ' + detail : ''));
}

function approach(G, zs, px, py, seconds) {
  const minD = zs.map(z => D(z, px, py));
  let t = step(Math.round(seconds / 0.016), performance.now());
  const mx = zs.map(z => z.x), my = zs.map(z => z.y);
  t = step(Math.round(3 / 0.016), t);
  let reached = 0, frozen = 0;
  zs.forEach((z, i) => {
    minD[i] = Math.min(minD[i], D(z, px, py));
    if (minD[i] <= 40) reached++;
    if (!z.dead && D(z, px, py) > 40 && Math.hypot(z.x - mx[i], z.y - my[i]) < 25) frozen++;
  });
  return { reached, frozen, n: zs.length, avg: minD.reduce((a, b) => a + b, 0) / zs.length, t };
}

function run() {
  console.log('《长街尸潮》卡死体检\n');
  // A. 开阔地: 8 只沿街面从 520px 外接近(只落在真正可走的位置, 免得刷进建筑里背锅)
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9; p.x = 720; p.y = 300;
    for (const b of G.units.filter(u => u.kind === 'robot' && !u.dead)) G.killUnit(b, null);   // 队友会把远处目标点掉, 本项只看"能不能走到"
    const zs = [];
    for (let i = 0; zs.length < 8 && i < 120; i++) {
      const side = zs.length % 2 ? 1 : -1;
      const zx = p.x + side * (380 + (zs.length >> 1) * 34);
      const zy = p.y + ((i % 5) - 2) * 18;          // 沿街面多试几排(车位/人行道会挡掉一部分)
      const z = G.makeZombie('normal', Math.max(60, Math.min(2340, zx)), Math.max(80, Math.min(920, zy)));
      if (!G.probeFree(z, z.x, z.y)) { G.killUnit(z, null); continue; }
      z.blind = 0; zs.push(z);
    }
    if (zs.length < 6) console.log('  · A 开阔地接近 — 跳过(只找到 ' + zs.length + ' 个空位刷怪)');
    else {
      const r = approach(G, zs, p.x, p.y, 10);
      report('A 开阔地接近', r.reached < r.n - 2, `${r.reached}/${r.n} 只贴到脸, 最近距离均值 ${r.avg.toFixed(0)}px`);
    }
  }
  // B. 绕过障碍: 玩家贴在载具一侧
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9;
    const car = G.covers.filter(c => c.w >= 36 && c.h >= 30).sort((a, b) => Math.abs(a.y - 300) - Math.abs(b.y - 300))[0];
    p.x = car.x - 26; p.y = car.y + car.h / 2;
    const zs = [];
    for (let i = 0; i < 8; i++) {
      const z = G.makeZombie('normal', car.x + car.w + 40 + (i % 3) * 26, car.y - 40 + Math.floor(i / 3) * 34);
      z.blind = 0; zs.push(z);
    }
    const r = approach(G, zs, p.x, p.y, 10);
    report('B 绕过障碍', r.reached < r.n - 2 || r.frozen > 0, `${r.reached}/${r.n} 只绕过载具贴到脸, 原地不动 ${r.frozen}`);
  }
  // C. 被围: 6 只贴身一圈, 对比空场
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9; p.x = 720; p.y = 300;
    t = step(30, t);
    const x0 = p.x;
    key('d', true); t = step(120, t); key('d', false);
    const free = p.x - x0;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const z = G.makeZombie('normal', p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30);
      z.blind = 0;
    }
    t = step(30, t);
    const x1 = p.x;
    key('d', true); t = step(120, t); key('d', false);
    const pinned = p.x - x1;
    report('C 被围仍能走', pinned < free * 0.35, `空场 2s 走 ${free.toFixed(0)}px → 被 6 只围住 ${pinned.toFixed(0)}px`);
  }
  // D. 队友跟随
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9; p.x = 720; p.y = 300;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const z = G.makeZombie('normal', p.x + 120 + Math.cos(a) * 30, p.y + Math.sin(a) * 30);
      z.blind = 0;
    }
    t = step(30, t);
    const bots = G.units.filter(u => u.kind === 'robot');
    const bx = bots.map(b => b.x);
    key('a', true); t = step(120, t); key('a', false);
    t = step(60, t);
    const moved = bots.map((b, i) => Math.abs(b.x - bx[i]));
    report('D 队友跟随不粘死', !moved.every(m => m > 60), `位移 ${moved.map(m => m.toFixed(0)).join('/')}px`);
  }
  // F. 整波 30 只
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9; p.x = 720; p.y = 300;
    const zs = [];
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      const z = G.makeZombie('normal', side > 0 ? 2320 - (i % 5) * 24 : 80 + (i % 5) * 24, 250 + (i % 7) * 40);
      z.blind = 0; zs.push(z);
    }
    t = step(Math.round(30 / 0.016), t);
    const mx = zs.map(z => z.x), my = zs.map(z => z.y);
    t = step(Math.round(5 / 0.016), t);
    let alive = 0, stuck = 0;
    zs.forEach((z, i) => {
      if (z.dead) return;
      alive++;
      if (D(z, p.x, p.y) > 40 && Math.hypot(z.x - mx[i], z.y - my[i]) < 25) stuck++;   // 未贴脸却 5 秒零推进 = 真卡住
    });
    report('F 整波都能摸到玩家', stuck > 0, `35s 后存活 ${alive} 只, 其中"未贴脸且 5s 零推进" ${stuck} 只`);
  }
  // H/I. 已知死角定点复查
  {
    const G = boot();
    let t = step(20, performance.now());
    killAllZombies(G);
    const p = G.player; p.hp = p.maxHp = 1e9;
    for (const spot of [{ x: 479, y: 210, name: '载具夹缝' }]) {
      p.x = spot.x; p.y = spot.y;
      t = step(4, t);
      const x0 = p.x, y0 = p.y;
      key('d', true); t = step(120, t); key('d', false);
      const escaped = Math.hypot(p.x - x0, p.y - y0);
      report('H ' + spot.name + '能脱身', escaped < 100, `按 D 两秒位移 ${escaped.toFixed(0)}px → (${p.x.toFixed(0)},${p.y.toFixed(0)})`);
    }
  }
  // G. 随机走位模糊测试(排除强化面板暂停帧)
  {
    const G = boot();
    let t = step(20, performance.now());
    const p = G.player; p.hp = p.maxHp = 1e9;
    const dirs = [['w'], ['a'], ['s'], ['d'], ['w', 'd'], ['w', 'a'], ['s', 'd'], ['s', 'a']];
    let cur = dirs[0], held = 0, wedge = 0, worst = 0, worstAt = null, blocks = 0;
    const nominal = p.speed;
    for (let sec = 0; sec < 90; sec++) {
      for (let k = 0; k < 37; k++) {
        if (held <= 0) { cur.forEach(c => key(c, false)); cur = dirs[(Math.random() * dirs.length) | 0]; cur.forEach(c => key(c, true)); held = 24; }
        held--;
        const x0 = p.x, y0 = p.y;
        t = step(1, t);
        if (G.boostOpen || p.dead || G.result) { blocks++; wedge = 0; continue; }   // 正常暂停/结算: 不算卡死
        const moved = Math.hypot(p.x - x0, p.y - y0);
        if (moved < nominal * 0.016 * 0.2) {
          wedge += 1 / 60;
          if (wedge > worst) { worst = wedge; worstAt = { x: Math.round(p.x), y: Math.round(p.y) }; }
        } else wedge = 0;
      }
    }
    cur.forEach(c => key(c, false));
    // 阈值 1.2s: 随机方向每 0.4s 换一次, 顶着墙按住同一个方向最多也就 0.8s 推不动, 属于正常"撞墙"
    report('G 90s 随机走位不卡死', worst > 1.2, `最长"推不动" ${worst.toFixed(1)}s${worstAt ? ' @' + worstAt.x + ',' + worstAt.y : ''}（面板/结算暂停帧 ${blocks} 已排除）`);
  }
  console.log(problems ? `\n体检结果: ${problems} 项需要复查` : '\n体检结果: 全部通过');
}
run();
