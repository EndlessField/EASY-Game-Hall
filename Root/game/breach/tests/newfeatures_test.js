// 新玩法功能回归验证: 狙击枪/手枪切换/烟雾弹/炸药包/倒地救援/成就/每日挑战
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() {} }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeEl() {
  const ls = {};
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); }, _fire(ev, obj) { for (const fn of ls[ev] || []) fn(obj); }, textContent: '', innerHTML: '', width: 0, height: 0, getContext: () => makeCtx(), onclick: null };
}
const store = {};
store['breach_game_cfg'] = JSON.stringify({ diff: 'norm', weapon: 'sniper', upgrades: {} });
const els = {}; let rafCb = null; const listeners = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: { getElementById: (id) => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); } },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  location: { href: '' }, setTimeout, clearTimeout
};
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
function step(n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; rafCb(t); } return t; }
function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exit(1); } else console.log('ok: ' + msg); }
function aimAt(wx, wy) { const z = 1280 / 2400 * 0.96, camx = 1200, camy = 500; els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); }
function key(k, down) { for (const fn of listeners['doc:keydown'] || []) if (down) fn({ key: k, repeat: false, preventDefault() {} }); for (const fn of listeners['doc:keyup'] || []) if (!down) fn({ key: k }); }
const g = () => sb.window.__game;

els['btnStart'].onclick();
let G = g(); let t = performance.now();
const p = G.player;

// --- A. 狙击枪配置 + 手枪副武器 + Q 切换 ---
assert(p.weapon.magSize === 5 && p.weapon.dmg === 60, '狙击枪 5发/60伤 (' + p.weapon.magSize + '/' + p.weapon.dmg + ')');
assert(p.weapon.zoom === 2.2, '狙击枪 ADS 放大 2.2× (' + p.weapon.zoom + ')');
assert(p.secondary && p.secondary.name === '手枪', '副武器手枪 (' + (p.secondary && p.secondary.name) + ')');
assert(p.smokes === 1 && p.c4 === 1, '烟雾弹/炸药包各 1 (' + p.smokes + '/' + p.c4 + ')');
key('q', true); key('q', false);
assert(p.weapon.name === '手枪', 'Q 切换到手枪 (' + p.weapon.name + ')');
key('q', true); key('q', false);
assert(p.weapon.name === '狙击枪', 'Q 切回主武器 (' + p.weapon.name + ')');

// --- A2. 点击即射(扳机延迟回归): 距上一发满 1 个射击周期后, 按下当帧就出膛 ---
//     射速积分器待机时回充(封顶 1 发), 所以狙击枪 0.95/s 也不必"按住 1.05 秒才响"。
p.weapon.mag = 5; p.weapon.fireAcc = 0;
t = step(70, t);                    // 待机 1.12s > 1/0.95s → 回充到 1 发
aimAt(600, 540);
els['cv']._fire('mousedown', { button: 0 });
t = step(1, t);
for (const fn of listeners['window:mouseup'] || []) fn({ button: 0 });
assert(p.weapon.mag === 4, '狙击枪点击即射 (5->4, 实际 ' + p.weapon.mag + ')');

// --- A3. 开镜→关镜 镜头回到原位(居中) ---
const cam0 = { x: G.cam.x, y: G.cam.y, z: G.cam.z };
els['cv']._fire('mousedown', { button: 2 });   // 右键开镜(点击切换)
t = step(50, t);                                // 等待缩放过渡完成
assert(G.ads === true, '开镜生效');
assert(G.cam.z > cam0.z * 1.8, '开镜缩放放大 (' + G.cam.z.toFixed(2) + ' vs ' + cam0.z.toFixed(2) + ')');
els['cv']._fire('mousedown', { button: 2 });   // 再次右键关镜
t = step(70, t);
assert(Math.abs(G.cam.x - cam0.x) < 1 && Math.abs(G.cam.y - cam0.y) < 1, '关镜后镜头回到原位 (' + G.cam.x.toFixed(1) + ',' + G.cam.y.toFixed(1) + ')');

// --- B. 烟雾弹: 遮挡视线 + 投掷生成云团 ---
// 左户客厅内开阔视线 (250,880)→(550,880) 无墙无家具遮挡
assert(G.lineBlocked(250, 880, 550, 880) === false, '基线: 客厅视线通畅');
G.smokeClouds.push({ x: 400, y: 880, r: 130, t: 0.3, life: 7 });
assert(G.lineBlocked(250, 880, 550, 880) === true, '烟雾遮挡视线 (lineBlocked=true)');
G.smokeClouds.length = 0;
assert(G.lineBlocked(250, 880, 550, 880) === false, '无烟时视线通畅');
p.x = 300; p.y = 850; p.smokes = 1;
aimAt(600, 850);
key('t', true); t = step(3, t); key('t', false);
t = step(40, t);   // 0.5s 引信
assert(G.smokeClouds.length === 1, '投掷烟雾弹生成云团 (' + G.smokeClouds.length + ')');

// --- C. 炸药包: 大范围爆炸 + 摧毁家具 ---
G.smokeClouds.length = 0;   // 清掉烟雾, 避免干扰后续断言
const coversBefore = G.lowCovers.length;
p.c4 = 1; p.x = 300; p.y = 880;
aimAt(180, 830);   // 左户客厅茶几(120,800,120,60)中心 (180,830)
key('y', true); t = step(3, t); key('y', false);
t = step(220, t);  // 2.4s 引信 + 爆炸 + 重建
assert(G.lowCovers.length < coversBefore, 'C4 摧毁家具 (' + coversBefore + '->' + G.lowCovers.length + ')');
assert(G.lineBlocked(250, 880, 550, 880) === false, '家具重建后碰撞/视线数据正常');

// --- D. 倒地救援: 红·机A 倒地, 红·机B 靠近救起 ---
const rA = G.units.find(u => u.name === '红·机A');
const rB = G.units.find(u => u.name === '红·机B');
for (const u of G.units) if (u.team === 'blue') { u.blind = 999; u.x = 2300; u.y = 950; }
rA.down = true; rA.bleed = 10; rA.hp = 0; rA.x = 400; rA.y = 780;
rB.blind = 0; rB.x = 415; rB.y = 780;
t = step(260, t);   // ~4s: 救援需 2.2s, 失血 10s 未到
assert(!rA.down, '倒地队友被救起');
assert(rA.hp > 0, '救起后恢复生命 (' + rA.hp.toFixed(0) + ')');

// --- E. 成就解锁(胜利结算) ---
for (const u of G.units) if (u.team === 'blue') u.dead = true;
t = step(320, t);   // 慢动作 + 结算
const sv = JSON.parse(store['breach_game_save']);
assert(sv.stats.ach && sv.stats.ach.firstWin === true, '成就: 首战告捷已解锁');
assert(sv.stats.ach && sv.stats.ach.triple === undefined, '成就: 三连杀未解锁(本局无连杀)');

// --- F. 每日挑战 ---
els['btnDaily'].onclick();
G = g();
assert(G.daily === true, '每日挑战模式开启');
assert(!!G.dailyRule && !!G.dailyRule.name, '每日挑战规则生效 (' + (G.dailyRule && G.dailyRule.name) + ')');
if (G.dailyRule && G.dailyRule.id === 'elite') {
  const blues2 = G.units.filter(u => u.team === 'blue').length;
  assert(blues2 === 6, '精英敌人规则: 蓝方 6 台 (' + blues2 + ')');
  assert(G.units.some(u => u.name === '蓝·机6'), '精英敌人规则: 出现客厅守卫蓝·机6');
}

// --- G. 右键失焦不自动暂停(右键菜单/系统手势导致窗口失焦时, 不应误弹暂停) ---
assert(G.paused === false, '开局未暂停');
els['cv']._fire('mousedown', { button: 2 });   // 开镜(ADS)
for (const fn of listeners['window:blur'] || []) fn();
assert(G.paused === false, '开镜时窗口失焦不自动暂停');
assert(G.ads === false, '失焦后鼠标状态被清理');
for (const fn of listeners['window:blur'] || []) fn();   // 未开镜失焦 → 应自动暂停
assert(G.paused === true, '未开镜时窗口失焦自动暂停');
for (const fn of listeners['doc:keydown'] || []) fn({ key: ' ', repeat: false, preventDefault() {} });   // 空格恢复
assert(G.paused === false, '空格取消暂停');

// --- H. v3 新增: 声源诱饵 / 破墙锤 / 配电箱断电 / 小地图批注 / 图签栏 / 事后作业图 ---
// 先开一局干净的户型图战役(上一段的每日挑战会干扰状态)
G.selectMap('house');
els['btnStart'].onclick();
G = g(); t = performance.now();
t = step(30, t);   // 先跑 0.48s: 让战后作业图的采样器(0.25s/帧)攒下至少一帧

// H1. 声源诱饵: 不伤人, 但会让蓝方循声查探(复用既有 investigate 分支)
assert(G.decoys.length === 0, '开局无残留诱饵');
G.spawnDecoy(400, 780);
assert(G.decoys.length === 1, '声源诱饵已布设');
G.updateDecoys(0.2);   // 首次发声延迟 0.15s
const decoyNoise = G.noises.length;
assert(decoyNoise > 0, '诱饵周期性发声 (' + decoyNoise + ' 次噪音事件)');
const bInv = G.units.find(u => u.team === 'blue');
bInv.x = 500; bInv.y = 780; bInv.blind = 0; bInv.visionDist = 10;   // 视野调到看不见玩家, 只测"听声"
bInv.ai.state = 'patrol'; bInv.ai.tgt = null;
t = step(3, t);
assert(bInv.ai.state === 'investigate', '蓝方机器人循诱饵声查探 (' + bInv.ai.state + ')');

// H2. 配电箱断电: 双方视野同时收缩, 玩家(手电)收缩更小
assert(G.powerOn === true, '开局供电正常');
const bPw = G.units.find(u => u.team === 'blue' && !u.train);
const vp0 = G.effVision(G.player), vb0 = G.effVision(bPw);
G.togglePower(G.breakerAt());
assert(G.powerOn === false, '拉闸断电生效');
assert(Math.abs(G.effVision(G.player) - vp0 * 0.78) < 0.01, '断电后玩家视野 ×0.78 (' + G.effVision(G.player).toFixed(0) + ')');
assert(Math.abs(G.effVision(bPw) - vb0 * 0.6) < 0.01, '断电后机器人视野 ×0.6 (' + G.effVision(bPw).toFixed(0) + ')');
assert(G.effVision(G.player) > G.effVision(bPw), '断电对玩家更有利(手电)');
G.togglePower(G.breakerAt());
assert(G.powerOn === true, '合闸恢复供电');

// H3. 破墙锤: 砸开内隔墙 → 墙体一分为二且视线贯通
const brWall = G.walls.find(w => !w.door && w.y1 === 660 && w.y2 === 660 && w.x1 === 20 && w.x2 === 520);
assert(!!brWall, '找到可破坏的内隔墙(厨房/卫生间南墙)');
assert(G.wallBreakable(brWall) === true, '内隔墙可破坏');
assert(G.walls.some(w => w.y1 === 20 && w.y2 === 20) && G.wallBreakable(G.walls.find(w => w.y1 === 20 && w.y2 === 20)) === false, '承重外墙不可破坏');
assert(G.lineBlocked(270, 600, 270, 760) === true, '破墙前 厨房↔客厅 视线被墙挡住');
const wallsBefore = G.walls.length;
G.breachWall(brWall, 270, 660);
assert(G.walls.length === wallsBefore + 1, '破墙后墙段一分为二 (' + wallsBefore + '->' + G.walls.length + ')');
assert(G.lineBlocked(270, 600, 270, 760) === false, '破墙后视线贯通');
t = step(3, t);   // flushMoveGrid: 寻路网格重建
assert(G.moveGrid && G.moveGrid.length > 0, '破墙后寻路网格已重建');

// H3b. 走完整输入链路: 按住 H(默认破墙键) 1.6s → 自动砸开身边那堵内隔墙
// 选走廊南界(y=440, x150..700): 左侧住户纵深里没有蓝方(最近的蓝机在 x1500+), 不会被打断
const brWall2 = G.walls.find(w => !w.door && w.y1 === 440 && w.y2 === 440 && w.x1 === 150 && w.x2 === 700);
assert(!!brWall2, '找到第二堵可破坏内隔墙(走廊南界)');
assert(G.lineBlocked(560, 380, 560, 540) === true, '破墙前 走廊↔餐厅 视线被墙挡住');
const pw = G.player;
pw.x = 560; pw.y = 480;   // 站在墙南侧 40px(在 BREACH_REACH 52px 内)
const wallsBefore2 = G.walls.length;
key('h', true);
for (let i = 0; i < 100; i++) t = step(1, t);   // 1.6s > BREACH_HOLD(1.4s)
key('h', false);
assert(G.walls.length === wallsBefore2 + 1, '按住 H 砸开墙段 (' + wallsBefore2 + '->' + G.walls.length + ')');
assert(G.lineBlocked(560, 380, 560, 540) === false, '按键破墙后视线贯通');

// H5. 小地图批注: 屏幕坐标 → 世界坐标, 提交/撤销/清空
els['mm'].getBoundingClientRect = () => ({ left: 0, top: 0, width: 240, height: 100 });
G.annClear();
assert(G.annStart(60, 25) === true, '批注: 命中索引图区域');
G.annDrag(180, 75);
G.annCommit();
assert(G.mmNotes.length === 1, '批注: 一笔箭头已提交 (' + G.mmNotes.length + ')');
assert(Math.abs(G.mmNotes[0].x1 - 600) < 1 && Math.abs(G.mmNotes[0].y1 - 250) < 1,
  '批注: 换算为世界坐标 (' + G.mmNotes[0].x1.toFixed(0) + ',' + G.mmNotes[0].y1.toFixed(0) + ')');
G.annStart(10, 10); G.annCommit();   // 没拖动 → 撤销上一笔
assert(G.mmNotes.length === 0, '批注: 单击撤销上一笔');
G.annClear();
assert(G.mmNotes.length === 0 && G.annMode === false, '批注: 清空且默认关闭(不拦截瞄准)');

// H6. 图签栏接真数据(图号 / 比例=击杀比 / 张次=档案槽 / 版次=构建版本号)
const tbNodes = [{ k: 'dwg', textContent: '' }, { k: 'scale', textContent: '' }, { k: 'sheet', textContent: '' }, { k: 'rev', textContent: '' }];
sb.document.querySelectorAll = () => tbNodes.map(n => ({
  getAttribute: () => n.k,
  get textContent() { return n.textContent; },
  set textContent(v) { n.textContent = v; },
}));
G.updateTitleBlocks();
assert(/^BR-HOUSE$/.test(tbNodes[0].textContent), '图签栏: 图号接真数据 (' + tbNodes[0].textContent + ')');
assert(/^\d+:\d+$/.test(tbNodes[1].textContent), '图签栏: 比例=本局击杀比 (' + tbNodes[1].textContent + ')');
assert(/^档案 \d$/.test(tbNodes[2].textContent), '图签栏: 张次=当前档案槽 (' + tbNodes[2].textContent + ')');
// 构建版本号只有一个来源: 根目录 VERSION.txt(四页图签栏 / package.json / CHANGELOG 由 version_test 比对)
const BUILD_VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION.txt'), 'utf8').trim();
const tbRev = tbNodes[3].textContent;
assert(tbRev === BUILD_VERSION, '图签栏: 版次=构建版本号(' + tbRev + ', 用于确认浏览器跑的是最新文件)');

// H7. 事后作业图: 回放采样 + 交火点 + 绘制不抛错
assert(G.aar.frames.length > 0, '回放: 已采样 ' + G.aar.frames.length + ' 帧');
// 交火点由 killUnit 里记: 本段自己造一次确定性的击杀, 不依赖前面几段是否恰好打死过人
const victim = G.units.find(u => u.team === 'blue' && !u.dead && !u.train);
assert(!!victim, '回放: 取到一名蓝方用于记录交火点');
G.hitUnit(victim, 9999, G.player, { x: victim.x, y: victim.y });
assert(G.aar.events.some(e => e.type === 'kill'), '回放: 已记录交火点');
els['aarCanvas'].width = 1240; els['aarCanvas'].height = 520;
G.drawAAR();   // 桩 ctx 全为 no-op: 不抛错即通过(真实浏览器里画的是可导出的作业图)
assert(true, '回放: 作业图绘制不抛错');
G.selectMap('house');   // 复位地图, 免得污染后续(本文件到此结束)

// H8. 最后目击残影: 必须画在"团队记忆坐标"上, 不能跟随敌人的实时坐标(否则等于 3 秒透视)
{
  els['btnStart'].onclick();   // 重开一局: 前面几段可能已经把这一局打到结算(result 非空时主循环不再推进)
  G = g(); t = performance.now();
  const gh = G.units.find(u => u.team === 'blue' && !u.dead && !u.train);
  assert(!!gh && G.result() === null, 'H8 残影: 新一局进行中, 找到一名蓝方');
  G.player.x = 300; G.player.y = 820; G.player.face = 0;
  gh.x = 430; gh.y = 820; gh.blind = 0;
  t = step(4, t);
  assert(gh.vis === true, 'H8 残影: 蓝方进入视野 (vis=' + gh.vis + ', d=' + Math.round(Math.hypot(gh.x - G.player.x, gh.y - G.player.y)) + ')');
  const a1 = G.ghostAnchor(gh);
  assert(!!a1 && Math.hypot(a1.x - gh.x, a1.y - gh.y) < 20, 'H8 残影: 可见时锚点=实体位置');
  gh.x = 2000; gh.y = 900;   // 瞬移出视野(红机都跟在玩家附近, 看不到 x=2000)
  t = step(4, t);
  assert(gh.vis === false, 'H8 残影: 目标已脱离视野');
  const a2 = G.ghostAnchor(gh);
  assert(!!a2, 'H8 残影: 3 秒内仍保留最后目击');
  assert(Math.abs(a2.x - a1.x) < 2 && Math.abs(a2.y - a1.y) < 2,
    'H8 残影: 锚点冻结在最后目击点 (' + a2.x.toFixed(0) + ',' + a2.y.toFixed(0) + ')');
  assert(Math.abs(a2.x - gh.x) > 500, 'H8 残影: 没有跟随敌人实时坐标 (实体已到 ' + gh.x.toFixed(0) + ')');
  // 超过 3 秒 → 残影消失(不再返回锚点)
  G.player.x = 300; G.player.y = 820;
  const savedX = gh.x, savedY = gh.y;
  gh.x = 2000; gh.y = 900;
  t = step(200, t);   // ≈3.2s
  gh.x = savedX; gh.y = savedY;
  const a3 = G.ghostAnchor(gh);
  assert(a3 === null || Math.abs(a3.x - 2000) > 1, 'H8 残影: 超过 3 秒后不再绘制 (anchor=' + (a3 ? a3.x.toFixed(0) : 'null') + ')');
}

// H9. 枪口火光不能穿墙: 看不见的敌人隔着墙开火时, 火光不许画出来(原先会漏, 看起来像黑暗里一个灰球)
{
  const bm = G.units.find(u => u.team === 'blue' && !u.dead && !u.train);
  const ally = G.units.find(u => u.team === 'red' && u.kind === 'robot' && !u.dead);
  assert(!!bm && !!ally, 'H9 火光: 取到一名蓝方与一名友军');
  G.player.x = 300; G.player.y = 820; G.player.face = 0; G.player.dead = false;
  bm.vis = false; bm.muzzle = 0.06; bm.face = Math.PI;
  bm.x = 300; bm.y = 900;   // 玩家身旁同房间、无墙遮挡
  assert(G.muzzleVisible(bm) === true, 'H9 火光: 看不见但在同一开阔空间 → 火光可见(暴露位置)');
  bm.x = 1150; bm.y = 1000; // 挪到核心筒另一侧, 中间隔着墙
  assert(G.lineBlocked(G.player.x, G.player.y, bm.x, bm.y) === true, 'H9 火光: 目标确实在墙后');
  assert(G.muzzleVisible(bm) === false, 'H9 火光: 隔墙的敌人开火不再画出火光');
  ally.muzzle = 0.06;
  assert(G.muzzleVisible(ally) === true, 'H9 火光: 自己人的火光始终可见');
  bm.vis = true;
  assert(G.muzzleVisible(bm) === true, 'H9 火光: 一旦被看见, 火光恢复可见');
}

console.log('NEW FEATURES VERIFY PASSED');
