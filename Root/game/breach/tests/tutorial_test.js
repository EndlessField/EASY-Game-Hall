// 教程与主页测试: 互动教程完整通关 + index 主页导航/战绩
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
    appendChild() {}, className: '', disabled: false, scrollIntoView() {},
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
  sandbox._els = els; sandbox._raf = () => rafCb; sandbox._ls = listeners;
  return sandbox;
}
function step(sb, n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; sb._raf()(t); } return t; }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }
function aimAt(sb, wx, wy) {
  const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500;
  sb._els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 });
}
function mouseDown(sb) { sb._els['cv']._fire('mousedown', { button: 0 }); }
function mouseUp(sb) { for (const fn of sb._ls['window:mouseup'] || []) fn({ button: 0 }); }
function pressKey(sb, k) { for (const fn of sb._ls['doc:keydown'] || []) fn({ key: k, repeat: false, preventDefault() {} }); }
function releaseKey(sb, k) { for (const fn of sb._ls['doc:keyup'] || []) fn({ key: k }); }

// ============ A. 游戏互动教程: 完整通关 ============
{
  const store = {};
  const sb = makeSandbox(store, { href: '', search: '?tutorial=1' });
  vm.runInNewContext(readHtml('game/breach.html'), sb);
  const g = sb.window.__game;
  assert(g.tutorial === true, '教程模式已激活 (?tutorial=1)');
  assert(g.units.length === 1, '教程开局只有玩家 (' + g.units.length + ')');
  assert(g.units.filter(u => u.team === 'blue' && !u.train).length === 0, '教程无常规蓝方敌人');
  assert(g.player.maxHp === 100, '教程使用默认配置 (' + g.player.maxHp + ')');
  let t = performance.now();

  // ① 移动
  g.player.x = 450; g.player.y = 820;
  t = step(sb, 5, t);
  assert(g.tut.step === 1, '① 移动完成 → 第2步 (' + g.tut.step + ')');

  // ② 射击: 打掉3个靶子(从正下方垂直射击, 弹道避开家具)
  assert(g.tut.targets.length === 3, '靶子已生成 (' + g.tut.targets.length + ')');
  const shootPos = [[280, 760, 280, 860], [600, 720, 600, 820], [620, 930, 620, 850]];
  for (const [tx, ty, px, py] of shootPos) {
    g.player.x = px; g.player.y = py;
    aimAt(sb, tx, ty);
    mouseDown(sb);
    t = step(sb, 120, t);
    mouseUp(sb);
  }
  assert(g.tut.targets.filter(x => x.dead).length === 3, '3 个靶子全部击毁');
  assert(g.tut.step === 2, '② 射击完成 → 第3步 (' + g.tut.step + ')');

  // ③ 视线: 走到走廊标记
  g.player.x = 280; g.player.y = 400;
  t = step(sb, 5, t);
  assert(g.tut.step === 3, '③ 视线完成 → 第4步 (' + g.tut.step + ')');

  // ④ 门: 站在主卧门前按 E 两次
  assert(!sb._els['cv'] || true, '');
  g.player.x = 220; g.player.y = 410;   // 主卧门(180..260,360) 下方走廊
  pressKey(sb, 'e'); t = step(sb, 3, t); releaseKey(sb, 'e'); t = step(sb, 3, t);
  pressKey(sb, 'e'); t = step(sb, 3, t); releaseKey(sb, 'e'); t = step(sb, 3, t);
  assert(g.tut.ePresses === 2, 'E 键按了 2 次 (' + g.tut.ePresses + ')');
  assert(g.tut.step === 4, '④ 开关门完成 → 第5步 (' + g.tut.step + ')');

  // ⑤ 手雷: 从 (640,780) 向西投 290px 至标记 (350,780)
  assert(g.player.frags >= 5, '手雷补给充足 (' + g.player.frags + ')');
  g.player.x = 640; g.player.y = 780;
  aimAt(sb, 350, 780);
  pressKey(sb, 'g'); t = step(sb, 3, t); releaseKey(sb, 'g');
  t = step(sb, 140, t);
  assert(g.tut.step === 5, '⑤ 手雷完成 → 第6步 (' + g.tut.step + ')');

  // ⑥ 闪光弹: 站在 (372,740) 向西 228px 投至假人 (600,740) 附近
  assert(!!g.tut.dummy, '训练假人已生成');
  g.player.x = 372; g.player.y = 740;
  aimAt(sb, 600, 740);
  pressKey(sb, 'f'); t = step(sb, 3, t); releaseKey(sb, 'f');
  t = step(sb, 100, t);   // 引爆后约0.45s内检查(致盲持续0.9s)
  assert(g.tut.dummy.blind > 0, '训练假人被致盲 (' + g.tut.dummy.blind.toFixed(2) + 's)');
  assert(g.tut.step === 6, '⑥ 闪光弹完成 → 第7步 (' + g.tut.step + ')');

  // ⑦ 实战: 消灭2台训练机(正下方垂直射击, 避开家具)
  assert(g.tut.combat.length === 2, '训练机已生成 (2台)');
  const combatPos = [[280, 760, 280, 860], [620, 760, 620, 860]];   // 训练机B 坐标随地图家具恢复同步调整(原 560,720 落在沙发内)
  for (const [tx, ty, px, py] of combatPos) {
    g.player.x = px; g.player.y = py;
    aimAt(sb, tx, ty);
    mouseDown(sb);
    t = step(sb, 140, t);
    mouseUp(sb);
  }
  assert(g.tut.combat.every(x => x.dead), '2 台训练机全部消灭');
  assert(g.tut.step === 7, '⑦ 实战完成 → 毕业 (' + g.tut.step + ')');

  // 毕业结算
  t = step(sb, 130, t);
  assert(g.result() === 'tutorial', '教程判定完成 (' + g.result() + ')');
  t = step(sb, 110, t);
  assert(String(sb._els['tutAcc'].textContent).indexOf('%') >= 0, '教程结算面板已显示命中率 (' + sb._els['tutAcc'].textContent + ')');
  console.log('ok: 互动教程 7 步完整通关');
}

// ============ A2. 教程面板不被战场"内容"挡住(防遮挡) ============
// 教程面板固定在左上(14/158, 290 宽), 而教程全程都在左户活动 —— 面板正压在左户上。
// 因此它必须和 #p1/#p2 一样: 单位或教程目标圈进到面板矩形里 → .panelhide 淡出, 移开恢复。
{
  const store = {};
  const sb = makeSandbox(store, { href: '', search: '?tutorial=1' });
  const rec = { hide: null, n: 0 };
  const tp = makeEl();
  tp.classList = {
    add(cls) { if (cls === 'panelhide') { rec.hide = true; rec.n++; } },
    remove(cls) { if (cls === 'panelhide') { rec.hide = false; rec.n++; } },
    toggle(cls, on) { if (cls === 'panelhide') { rec.hide = !!on; rec.n++; } }
  };
  sb._els['tutPanel'] = tp;
  vm.runInNewContext(readHtml('game/breach.html'), sb);
  const g = sb.window.__game;
  const recs = g.panelRects;
  const tpr = recs.find(r => r.elId === 'tutPanel');
  assert(!!tpr, '教程面板已纳入防遮挡判定 (rects=' + recs.map(r => r.elId).join('/') + ')');
  assert(tpr.x === 14 && tpr.y === 158 && tpr.w > 250 && tpr.h > 30,
    '教程面板几何确认 (x=' + tpr.x + ' y=' + tpr.y + ' ' + tpr.w + '×' + tpr.h + ')');
  // 准星停在屏幕中上部, 远离面板矩形(面积极小, 避免干扰判定)
  sb._els['cv']._fire('mousemove', { clientX: 900, clientY: 500 });
  let t = performance.now();
  t = step(sb, 5, t);
  assert(rec.hide === false, '开局(单位在中部)教程面板正常显示');
  // 把玩家放到面板矩形中心反算出的世界坐标 —— 教程第 1 步要练的就是走到左侧那片区域
  const psx = tpr.x + tpr.w / 2, psy = tpr.y + tpr.h / 2;
  g.player.x = (psx - 640) / g.cam.z + g.cam.x;
  g.player.y = (psy - 400) / g.cam.z + g.cam.y;
  t = step(sb, 4, t);
  assert(rec.hide === true, '单位走到面板后面时教程面板淡出 (hide=' + rec.hide + ')');
  // 移开 → 恢复(教程面板会回来继续教, 不是一去不回)
  g.player.x = 1200; g.player.y = 820;
  t = step(sb, 4, t);
  assert(rec.hide === false, '单位离开后教程面板恢复显示 (hide=' + rec.hide + ')');
  // 教程第 1 步的"黄圈"世界坐标固定 (450,820): 换算到屏幕 x≈256, 正落在面板 x 区间里
  // (面板 y 区间随相机浮动, 所以不再断言 y)。即面板压住的正是"该看的那个点"——
  // 这就是必须让它随遮挡淡出的原因; 圈被盖住时的那条分支见 updatePanelFade 的 tutPanel 支。
  const tgt = { x: (450 - g.cam.x) * g.cam.z + 640, y: (820 - g.cam.y) * g.cam.z + 400 };
  assert(tgt.x > tpr.x && tgt.x < tpr.x + tpr.w,
    '教程第 1 步的目标圈落在面板 x 区间内(几何前提: ' + tgt.x.toFixed(0) + ',' + tgt.y.toFixed(0) + ')');
  console.log('ok: 教程面板防遮挡(单位进入左上区域自动让位, 离开恢复)');
}

// ============ B. 主页 index.html ============
{
  const store = {};
  store['breach_game_save'] = JSON.stringify({ points: 12, stats: { wins: 2, losses: 1, kills: 9, damage: 600, bestStars: 2 } });
  const sb = makeSandbox(store, { href: '' });
  vm.runInNewContext(readHtml('index.html'), sb);
  const E = sb._els;
  assert(String(E['stWins'].textContent) === '2', '主页战绩·胜利数 2 (' + E['stWins'].textContent + ')');
  assert(String(E['stPts'].textContent) === '12', '主页战绩·军功点 12 (' + E['stPts'].textContent + ')');
  // v3.2: 星级改用 FA 图标 → 断言"两颗实心 + 一颗空心"
  const starHtml = String(E['stStars'].innerHTML);
  assert((starHtml.match(/fas fa-star/g) || []).length === 2 && (starHtml.match(/far fa-star/g) || []).length === 1,
    '主页战绩·最高星级 2/3(FA 两实心一空心)');
  E['btnStart'].onclick();
  assert(sb.location.href === 'game/breach.html', '开始游戏跳转 (' + sb.location.href + ')');
  E['btnPrep'].onclick();
  assert(sb.location.href === 'game/hub.html', '战前准备跳转 (' + sb.location.href + ')');
  E['btnTutGo'].onclick();
  assert(sb.location.href === 'game/breach.html?tutorial=1', '互动教程带参数跳转 (' + sb.location.href + ')');
  E['btnTut'].onclick();   // 滚动到教程区, 不应报错
  console.log('ok: 主页导航与战绩速览正常');
}

console.log('TUTORIAL & INDEX TEST PASSED');
