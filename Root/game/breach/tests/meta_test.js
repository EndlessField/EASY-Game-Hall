// 元数据完善验证: 设置持久化 / 成就墙 / 每日挑战历史 / 写字楼地图联动 / 开局人数文案
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = path.join(__dirname, '..');
function readHtml(name) {
  const h = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { raw: h, script: h.match(/<script>([\s\S]*?)<\/script>/)[1] };
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
    appendChild() {}, className: '', disabled: false, checked: false,
    textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => makeCtx(), onclick: null
  };
}
function makeSandbox(store, elsShared) {
  const els = elsShared || {};
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
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { href: '' }, setTimeout, clearTimeout
  };
  sb.globalThis = sb; sb.window.window = sb.window;
  sb._els = els; sb._rafCb = () => rafCb; sb._listeners = listeners;
  return sb;
}
function step(sb, n, t0) { let t = t0; for (let i = 0; i < n; i++) { t += 16; sb._rafCb()(t); } return t; }
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// ============ A. 游戏页: 设置持久化 ============
{
  const store = {};
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  // 修改设置: 音量 60 / 关屏幕震动 / 开FPS / 按住式开镜
  sb._els['volRange']._fire('input', { target: { value: 60 } });
  sb._els['chkShake']._fire('change', { target: { checked: false } });
  sb._els['chkFps']._fire('change', { target: { checked: true } });
  sb._els['chkAdsHold']._fire('change', { target: { checked: true } });
  const set = JSON.parse(store['breach_game_set']);
  ok(set.vol === 60 && set.shake === false && set.fps === true && set.adsHold === true, '设置写入 localStorage (' + JSON.stringify(set) + ')');
  // 模拟刷新: 复用同一 store, 新沙箱加载 → 应回读并应用到开关
  const sb2 = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb2);
  ok(sb2._els['volRange'].value === 60, '刷新后音量回读 vol=60');
  ok(sb2._els['chkShake'].checked === false && sb2._els['chkFps'].checked === true && sb2._els['chkAdsHold'].checked === true, '刷新后开关状态回读');
  ok(sb2._els['chkShake'].checked === false, '屏幕震动默认 false 已应用');
  // 无设置存档时默认值正常(第三个沙箱空 store)
  const store3 = {};
  const sb3 = makeSandbox(store3);
  vm.runInNewContext(readHtml('game/breach.html').script, sb3);
  ok(sb3._els['volRange'].value === 100 && sb3._els['chkShake'].checked === true && sb3._els['chkAdsHold'].checked === false, '无存档默认设置 (vol100/shake/fps off)');
  ok(store3['breach_game_set'] === undefined, '无改动时不写设置存档');
}

// ============ B. 游戏页: 写字楼地图联动 + 开局人数文案 ============
{
  const raw = readHtml('game/breach.html').raw;
  ok(raw.indexOf('蓝方5人') >= 0 && raw.indexOf('蓝方6人') >= 0, '开局界面难度文案 标准5人/困难6人');
  ok(raw.indexOf('蓝方7人') < 0 && raw.indexOf('蓝方8人') < 0, '旧版 7/8 人文案已移除');
  const store = {};
  store['breach_game_cfg'] = JSON.stringify({ diff: 'norm', weapon: 'smg', map: 'office', upgrades: {} });
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  sb._els['btnStart'].onclick();
  const G = sb.window.__game;
  ok(G.mapId === 'office', 'cfg.map=office 生效 (' + G.mapId + ')');
  ok(G.player.x > 0, '写字楼地图开局正常 (玩家 x=' + G.player.x.toFixed(0) + ')');
}

// ============ C. 准备页: 成就墙 + 每日挑战历史 ============
{
  const store = {};
  const yesterday = new Date(Date.now() - 86400000);
  const yKey = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
  const today = new Date();
  const tKey = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  store['breach_game_save'] = JSON.stringify({
    points: 12, stats: { wins: 4, losses: 1, kills: 20, damage: 1500, bestStars: 3, ach: { firstWin: true, triple: true } },
    daily: { [yKey]: { stars: 2, time: 190 }, [tKey]: { stars: 3, time: 150 } }
  });
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/hub.html').script, sb);
  ok(String(sb._els['achCount'].textContent).indexOf('2/15') >= 0, '成就墙计数 2/15 (' + sb._els['achCount'].textContent + ')');
  const achHtml = sb._els['achList'].innerHTML;
  ok(achHtml.indexOf('首战告捷') >= 0 && achHtml.indexOf('已解锁') >= 0, '成就墙渲染已解锁成就');
  ok(achHtml.indexOf('闪电行动') >= 0, '成就墙渲染未解锁成就(灰显)');
  const dlHtml = sb._els['dailyList'].innerHTML;
  // v3.2: 星级改用 FontAwesome 图标(实心=拿到 / 空心=没拿到), 不再断言 ★/☆ 字符
  const three = '<i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>';
  ok(dlHtml.indexOf(three) >= 0, '每日挑战历史含今天 3 星记录(FA 三星)');
  ok(dlHtml.indexOf('<b><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="far fa-star dim"></i></b>') >= 0,
    '每日挑战历史含昨天 2 星记录(FA 两实心一空心)');
  ok(dlHtml.indexOf('未挑战') >= 0, '每日挑战历史含空档日');
}

// ============ D. 游戏页: HUD 防遮挡(单位进左上面板区域 → 面板淡出) ============
{
  const store = {};
  const sb = makeSandbox(store);
  // p1 用可记录 classList 的假元素, 便于断言 panelhide 开关
  const rec = { hide: null, n: 0 };
  const p1El = makeEl();
  p1El.classList = {
    add(cls) { if (cls === 'panelhide') { rec.hide = true; rec.n++; } },
    remove(cls) { if (cls === 'panelhide') { rec.hide = false; rec.n++; } },
    toggle(cls, on) { if (cls === 'panelhide') { rec.hide = !!on; rec.n++; } }
  };
  sb._els['p1'] = p1El;
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  sb._els['btnStart'].onclick();
  const G = sb.window.__game;
  const rA = G.units.find(u => u.name === '红·机A');
  ok(!!rA, '红机A 存在');
  // 光标移到屏幕中央(避开面板判定), 出生单位都在中部 → p1 应正常显示
  const aimAt = (wx, wy) => { const z = G.cam.z, camx = G.cam.x, camy = G.cam.y; sb._els['cv']._fire('mousemove', { clientX: (wx - camx) * z + 640, clientY: (wy - camy) * z + 400 }); };
  aimAt(1200, 500);
  let t = performance.now();
  t = step(sb, 6, t);
  ok(rec.hide === false, '开局 p1 正常显示 (hide=' + rec.hide + ')');
  // 把红机A 放到"#p1 面板矩形"的中心(反算世界坐标) —— 面板几何以后再精简, 这段测试不用跟着改
  // (沙箱里没有布局, 所以这里拿到的就是代码里的 PANEL_FALLBACK 回退几何)
  const pr = G.panelRects.find(r => r.elId === 'p1');
  const psx = (pr.x == null ? 1280 - 14 - pr.w : pr.x) + pr.w / 2;
  const psy = pr.y + pr.h / 2;
  rA.x = (psx - 640) / G.cam.z + G.cam.x;
  rA.y = (psy - 400) / G.cam.z + G.cam.y;
  rA.ai.cmd = { type: 'hold', x: rA.x, y: rA.y };   // 固守, 避免 AI 跑开干扰断言
  t = step(sb, 6, t);
  ok(rec.hide === true, '单位进入左上角面板区域后面板淡出 (hide=' + rec.hide + ')');
  // 移回中部 → 恢复显示
  rA.x = 300; rA.y = 820;
  t = step(sb, 6, t);
  ok(rec.hide === false, '单位离开后 p1 恢复 (hide=' + rec.hide + ')');
}

// ============ E. 新升级(伤害/射速/换弹/医疗/队友机动/护甲)接线 ============
{
  const store = {};
  store['breach_game_cfg'] = JSON.stringify({
    diff: 'norm', weapon: 'ar', map: 'house',
    upgrades: { hp: 1, dmg: 2, rate: 1, reload: 3, med: 2, robSpd: 2, robHp: 1, robDmg: 1 }
  });
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  sb._els['btnStart'].onclick();
  const G = sb.window.__game;
  const p = G.player;
  ok(p.weapon.dmg === 12, '伤害强化2级: AR 11→12 (' + p.weapon.dmg + ')');
  ok(Math.abs(p.weapon.fireRate - 10.07) < 0.01, '射速强化1级: 9.5→10.07 (' + p.weapon.fireRate + ')');
  ok(Math.abs(p.weapon.reloadT - 0.96) < 0.01, '换弹加速3级: 1.5→0.96s (' + p.weapon.reloadT + ')');
  const rA = G.units.find(u => u.name === '红·机A');
  ok(rA.speed === 202, '队友机动2级: 180→202 (' + rA.speed + ')');
  ok(rA.maxHp === 85, '队友装甲1级 + 生命上限 85 (' + rA.maxHp + ')');
  // 医疗强化: 打低血后站到医疗包上, 回复应为 35×1.4 ≈ 49(受生命上限约束)
  p.hp = 40;
  const medPk = G.pickups.find(pk => pk.type === 'med');   // 户型图里的第一个 med 补给点
  p.x = medPk.x; p.y = medPk.y;
  let t2 = performance.now();
  for (let i = 0; i < 40; i++) { t2 += 16; sb._rafCb()(t2); }
  ok(p.hp === 89, '医疗强化2级: 40→89 (+49) (' + p.hp + ')');
}

// ============ F. 军衔: 晋升扣点 / 涨价 / 持久化 / 首页展示 ============
{
  // 准备页晋升
  const store = {};
  store['breach_game_save'] = JSON.stringify({ points: 30, stats: { wins: 5, bestStars: 3 }, rank: 0 });
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/hub.html').script, sb);
  ok(String(sb._els['stRank'].textContent) === '列兵', '军衔初始 列兵 (' + sb._els['stRank'].textContent + ')');
  sb._els['btnRankUp'].onclick();
  let sv = JSON.parse(store['breach_game_save']);
  ok(sv.rank === 1 && sv.points === 26, '晋升1级: 扣4点 rank=1 (' + sv.rank + ',' + sv.points + ')');
  ok(String(sb._els['stRank'].textContent) === '上等兵', '晋升后显示 上等兵 (' + sb._els['stRank'].textContent + ')');
  sb._els['btnRankUp'].onclick();
  sv = JSON.parse(store['breach_game_save']);
  ok(sv.rank === 2 && sv.points === 19, '晋升2级: 扣7点(涨价) rank=2 (' + sv.rank + ',' + sv.points + ')');
  // 首页战绩栏显示军衔
  const store2 = {};
  store2['breach_game_save'] = JSON.stringify({ points: 1, stats: {}, rank: 5 });
  const sb2 = makeSandbox(store2);
  vm.runInNewContext(readHtml('index.html').script, sb2);
  ok(String(sb2._els['stRank'].textContent) === '军士长', '首页军衔 rank5=军士长 (' + sb2._els['stRank'].textContent + ')');
  // 旧档无 rank 字段 → 迁移默认 列兵, 不读挂
  const store3 = {};
  store3['breach_game_save'] = JSON.stringify({ points: 2, stats: { wins: 1 } });
  const sb3 = makeSandbox(store3);
  vm.runInNewContext(readHtml('index.html').script, sb3);
  ok(String(sb3._els['stRank'].textContent) === '列兵', '旧档无rank → 默认列兵 (' + sb3._els['stRank'].textContent + ')');
}

// ============ G. 存档备份/导入(json 迁移分享) ============
{
  // 玩家 A 在准备页有配置与进度
  const storeA = {};
  storeA['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'hard', weapon: 'sniper', map: 'office', upgrades: { hp: 3, dmg: 2 } });
  storeA['breach_game_save'] = JSON.stringify({ version: 1, points: 42, rank: 5, stats: { wins: 9, losses: 2, kills: 40, damage: 4000, bestStars: 3, ach: { firstWin: true } }, daily: {} });
  const sbA = makeSandbox(storeA);
  vm.runInNewContext(readHtml('game/hub.html').script, sbA);
  // 导出: buildBackup 应把两个 key 的原始对象原样带出
  const backup = sbA.buildBackup();
  ok(backup && backup.app === 'breach-door-cqb', '备份含应用标识');
  ok(backup.cfg && backup.cfg.weapon === 'sniper' && backup.cfg.map === 'office' && backup.cfg.upgrades.hp === 3, '备份含配置(武器/地图/升级)');
  ok(backup.save && backup.save.points === 42 && backup.save.rank === 5 && backup.save.stats.wins === 9, '备份含进度(点数/军衔/战绩)');
  ok(backup.cfg.upgrades.dmg === 2, '备份保留新升级字段');

  // 玩家 B 是空存档: 导入同一备份 → 恢复成 A 的配置与进度
  const storeB = {};
  const sbB = makeSandbox(storeB);
  vm.runInNewContext(readHtml('game/hub.html').script, sbB);
  ok(sbB.applyBackup(backup) === true, 'B 导入备份成功');
  sbB.loadAll(); sbB.renderAll();   // 与文件导入流程一致: 写库后刷新页面
  const bCfg = JSON.parse(storeB['breach_game_cfg']);
  const bSave = JSON.parse(storeB['breach_game_save']);
  ok(bCfg.weapon === 'sniper' && bCfg.map === 'office' && bSave.rank === 5 && bSave.points === 42, 'B 导入后配置/进度一致');
  // 导入后页面渲染同步(武器选中/军衔显示)
  ok(sbB._els['stRank'].textContent === '军士长', 'B 导入后页面军衔刷新 (' + sbB._els['stRank'].textContent + ')');
  ok(sbB._els['weaponInfo'].innerHTML.indexOf('狙击枪') >= 0, 'B 导入后武器面板为狙击枪');
  // 无效/损坏输入不写坏存档
  const storeC = {};
  const sbC = makeSandbox(storeC);
  vm.runInNewContext(readHtml('game/hub.html').script, sbC);
  ok(sbC.applyBackup(null) === false && sbC.applyBackup({ foo: 1 }) === false, '无效备份返回失败且不写入');
  ok(storeC['breach_game_cfg'] === undefined && storeC['breach_game_save'] === undefined, '无效备份不污染本地存档');
  // 主页同样提供备份接口(分享入口)
  const storeD = {};
  storeD['breach_game_save'] = JSON.stringify({ version: 1, points: 7, rank: 1, stats: { wins: 1 } });
  const sbD = makeSandbox(storeD);
  vm.runInNewContext(readHtml('index.html').script, sbD);
  const bkHome = sbD.buildBackup();
  ok(bkHome.save && bkHome.save.rank === 1 && bkHome.save.points === 7, '主页 buildBackup 读取进度');
}

// ============ H. 导入 sanitize + 四页常量一致性(回归: hub 导入入口曾无钳制, 常量四处复制) ============
{
  // H1 脏档导入: hub 启动时必须清洗而不崩溃(负军衔/越界星级/越界升级等级/NaN 点数/非法武器)
  const storeH = {};
  storeH['breach_game_cfg'] = JSON.stringify({ version: 9, weapon: 'rocket', map: 'void', diff: 'insane', upgrades: { hp: 7, dmg: -2, ammo: 'x' } });
  storeH['breach_game_save'] = JSON.stringify({ version: 9, points: 'abc', rank: -5, stats: { wins: '3', bestStars: 9, damage: -1 } });
  const sbH = makeSandbox(storeH);
  vm.runInNewContext(readHtml('game/hub.html').script, sbH);   // 启动即 loadAll+sanitizeAll+renderAll, 不应抛错
  // 内存态已被清洗 → UI 显示默认/钳制后的值
  ok(sbH._els['weaponInfo'].innerHTML.indexOf('突击步枪') >= 0, 'H 非法武器回落 ar (显示突击步枪)');
  ok(String(sbH._els['stRank'].textContent) === '列兵', 'H 负军衔回落 0=列兵 (' + sbH._els['stRank'].textContent + ')');
  // v3.2: 星级是 FA 图标 → 数实心星数量(越界 bestStars 必须被钳到 3)
  const starHtml = String(sbH._els['stStars'].innerHTML);
  ok((starHtml.match(/fas fa-star/g) || []).length === 3 && starHtml.indexOf('far fa-star') < 0,
    'H 越界 bestStars 钳制为 3 (显示三颗实心 FA 星)');
  // 持久化(模拟任意一次购买)后, 落盘内容同样被清洗
  sbH.persistCfg(); sbH.persistSave();
  const hCfg = JSON.parse(storeH['breach_game_cfg']);
  const hSave = JSON.parse(storeH['breach_game_save']);
  ok(hCfg.weapon === 'ar' && hCfg.map === 'house' && hCfg.diff === 'norm', 'H 脏档 weapon/map/diff 回落默认 (' + hCfg.weapon + '/' + hCfg.map + '/' + hCfg.diff + ')');
  ok(hCfg.upgrades.hp === 3 && hCfg.upgrades.dmg === undefined && hCfg.upgrades.ammo === undefined, 'H 脏档升级等级钳制 0..max');
  ok(hSave.points === 0 && hSave.rank === 0, 'H 脏档 points/rank 非负化 (points=' + hSave.points + ', rank=' + hSave.rank + ')');
  ok(hSave.stats.bestStars === 3 && hSave.stats.wins === 3 && hSave.stats.damage === 0, 'H 脏档 bestStars≤3 / 战绩非负');
  ok(Number(hCfg.version) === 9 && Number(hSave.version) === 9, 'H 持久化不降级高版本号 (cfg=' + hCfg.version + ', save=' + hSave.version + ')');
  const badBak = { cfg: { weapon: 'ar' }, save: { points: 1 } };   // 无 app 标识(旧格式/别的游戏)
  ok(sbH.applyBackup(badBak) === false && storeH['breach_game_cfg'].indexOf('rocket') < 0 && storeH['breach_game_cfg'].indexOf('"ar"') >= 0, 'H 无 app 标识的 JSON 拒绝导入, 本地档未被覆盖');
  // H2 常量一致性
  const raw4 = ['index.html', 'game/hub.html', 'game/breach.html', 'game/street.html'].map(n => readHtml(n).raw);
  const blockOf = (h, key) => { const i = h.indexOf('const ' + key + ' = ['); if (i < 0) return null; const j = h.indexOf('\n];', i); return h.slice(i, j); };
  const norm = s => s.replace(/\s+/g, '');
  const ranks = raw4.map(h => norm(blockOf(h, 'RANK_TITLES') || ''));
  ok(ranks.every(r => r && r === ranks[0]), 'H 四页 RANK_TITLES 文本一致');
  const upsOf = h => {
    const b = blockOf(h, 'UPGRADE_DEFS') || '';
    // §3.2-A: 比对字段从 id/max/cost 扩到 **id/name/max/cost** —— 改显示名漏同步页面同样算事故,
    // 且顺序必须一致(数组顺序即 UI 顺序)。长街页是有意精简表(只有 id/max), 故 name 可选。
    return [...b.matchAll(/\{ id: '(\w+)',[^{}]*?max: (\d+)(?:, cost: \[([^\]]+)\])?[^{}]*?\}/g)]
      .map(m => { const nm = m[0].match(/name: '([^']*)'/); return m[1] + ':' + (nm ? nm[1] : '-') + ':' + m[2] + (m[3] !== undefined ? ':[' + m[3] + ']' : ''); });
  };
  const hubU = upsOf(raw4[1]), brU = upsOf(raw4[2]), stU = upsOf(raw4[3]);
  ok(hubU.length === brU.length && hubU.every((v, i) => v === brU[i]), 'H hub 与 breach 的 UPGRADE_DEFS(id/name/max/cost)逐项一致 (' + hubU.length + ' 项)');
  ok(hubU.length > 0, 'H UPGRADE_DEFS 解析成功(字段扩展后正则仍匹配, 共 ' + hubU.length + ' 项)');
  const brIds = brU.map(u => u.split(':')[0]);
  // 长街页有意缺 2 项: vision(无视野系统) 与 med(本页不投放医疗包, 点击将无任何效果)
  const stMissing = ['vision', 'med'];
  const idOf = (u) => u.split(':')[0];
  const wantSt = brIds.filter(id => stMissing.indexOf(id) < 0);   // 长街应有的升级 id(有序)
  const gotSt = stU.map(idOf);
  ok(gotSt.length === wantSt.length && gotSt.every((id, i) => id === wantSt[i]),
    'H street UPGRADE_DEFS 仅缺 vision 与 med 且**顺序**与主游戏一致 (street=' + gotSt.join(',') + ')');
  // H3 v2 复制型常量一致性: 地图清单与每日规则名在 hub 的"只读预览"里也必须与游戏页同源
  const hubRaw = raw4[1], brRaw = raw4[2];
  const hubMaps = (hubRaw.match(/const MAP_KEYS = \[([^\]]+)\]/) || [, ''])[1];
  ok(['house', 'warehouse', 'factory', 'office', 'parking'].every(m => hubMaps.indexOf("'" + m + "'") >= 0), 'H hub MAP_KEYS 含全部 5 张战役地图');
  const brRulesBlock = (brRaw.match(/const DAILY_RULES = \[([\s\S]*?)\n\];/) || [, ''])[1];
  const brRuleNames = [...brRulesBlock.matchAll(/name: '([^']+)'/g)].map(m => m[1]);
  const hubRules = (hubRaw.match(/const RULES = \[([^\]]+)\]/) || [, ''])[1];
  const hubRuleNames = [...hubRules.matchAll(/'([^']+)'/g)].map(m => m[1]);
  // §3.2-A: 从"集合包含"升级为 **有序数组相等** —— 顺序不同会让"今日规则"与游戏页选到不同条目
  ok(brRuleNames.length === 7 && hubRuleNames.length === brRuleNames.length
    && brRuleNames.every((n, i) => n === hubRuleNames[i]),
    'H hub「今日规则」预览与 breach DAILY_RULES 同序同源 (' + brRuleNames.join('/') + ' vs ' + hubRuleNames.join('/') + ')');
  // §3.2-A: 长街页的升级"短名表"必须覆盖主游戏全部升级 id(漏项会在强化日志里显示 undefined)
  const stNames = (raw4[3].match(/const names = \{([^}]*)\}/) || [, ''])[1];
  const stNameIds = [...stNames.matchAll(/(\w+): '/g)].map(m => m[1]);
  ok(brIds.every(id => stMissing.indexOf(id) >= 0 || stNameIds.indexOf(id) >= 0),
    'H street 升级短名表覆盖全部 breach 升级 id(有意子集除外; 缺: ' + brIds.filter(id => stMissing.indexOf(id) < 0 && stNameIds.indexOf(id) < 0).join(',') + ')');
  // H4 成就清单同源: hub ACH_LIST 的 id 必须与 breach ACHIEVEMENT_DEFS 完全一致
  const brAchBlock = (brRaw.match(/const ACHIEVEMENT_DEFS = \[([\s\S]*?)\n\];/) || [, ''])[1];
  const brAchIds = [...brAchBlock.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1]);
  const hubAchBlock = (hubRaw.match(/const ACH_LIST = \[([\s\S]*?)\n\];/) || [, ''])[1];
  const hubAchIds = [...hubAchBlock.matchAll(/\{ id: '(\w+)'/g)].map(m => m[1]);
  ok(brAchIds.length === 15 && hubAchIds.length === brAchIds.length && brAchIds.every((v, i) => v === hubAchIds[i]),
    'H hub ACH_LIST 与 breach ACHIEVEMENT_DEFS 逐项一致 (' + brAchIds.length + ' 项)');
  // §3.2-A: 成就名与说明也必须一致(此前只比 id, 改文案漏同步不会失败)
  const achTextOf = (block) => [...block.matchAll(/\{ id: '(\w+)', name: '([^']*)', desc: '([^']*)'/g)].map(m => m[1] + ':' + m[2] + ':' + m[3]);
  const brAchTxt = achTextOf(brAchBlock), hubAchTxt = achTextOf(hubAchBlock);
  ok(brAchTxt.length === brAchIds.length && hubAchTxt.length === brAchTxt.length && brAchTxt.every((v, i) => v === hubAchTxt[i]),
    'H 成就 name/desc 逐项一致 (' + brAchTxt.length + '/' + hubAchTxt.length + ' 项可解析)');
  // H5 武器面板必须覆盖全部武器(回归: 新增武器后 hub 硬编码按钮漏加 → 有钱买不到)
  const brWeaponBlock = (brRaw.match(/const WEAPON_DEFS = \{([\s\S]*?)\n\};/) || [, ''])[1];
  const brWeaponIds = [...brWeaponBlock.matchAll(/^\s{2}(\w+): \{ name:/gm)].map(m => m[1]);
  ok(brWeaponIds.length === 6 && brWeaponIds.every(w => hubRaw.indexOf("setWeapon('" + w + "')") >= 0),
    'H hub 装备面板覆盖全部 ' + brWeaponIds.length + ' 把武器 (' + brWeaponIds.join(',') + ')');
  // H5b 武器表同源: street.html 的 WEAPON_DEFS 必须与 breach.html 同 id 同数值
  //   (回归: v2 新增轻机枪/精确射手步枪时漏改长街页 → 准备页选了机枪, 进尸潮静默退回突击步枪)
  const stRaw = raw4[3];
  const stWeaponBlock = (stRaw.match(/const WEAPON_DEFS = \{([\s\S]*?)\n\};/) || [, ''])[1];
  const wnumsOf = (block, id) => {
    const m = block.match(new RegExp('\\n\\s{2}' + id + ': \\{([^}]*)\\}'));
    if (!m) return null;
    // §3.2-A: 字段名单从"手写清单"改为 **从 breach 定义推导的键并集** —— 以后新增字段自动纳入比对
    const keys = [...m[1].matchAll(/(?:^|[,{]\s*)(\w+):/g)].map(x => x[1]);
    return keys.map(f => { const mm = m[1].match(new RegExp('(?:^|[ ,])' + f + ': ([^,}]+)')); return f + '=' + (mm ? mm[1].trim() : '-'); }).join('|');
  };
  const stWeaponIds = [...stWeaponBlock.matchAll(/^\s{2}(\w+): \{ name:/gm)].map(m => m[1]);
  ok(brWeaponIds.length === stWeaponIds.length
    && brWeaponIds.every((id, i) => id === stWeaponIds[i] && wnumsOf(stWeaponBlock, id) === wnumsOf(brWeaponBlock, id)),
    'H5b street 与 breach 的 WEAPON_DEFS 同 id 同数值 (' + stWeaponIds.join(',') + ')');
}

// ============ I. v2 功能(A1 设置扩充 / A3 改键 / A4 槽位 / A5 累计统计 / A6 每日 / A7 成就 / B2 武器 / B3 升级) ============
{
  // I1 A1: 设置项扩充 —— 灵敏度/准星样式与大小/命中提示 持久化, 且版本号升到 2
  {
    const store = {};
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    sb._els['sensRange']._fire('input', { target: { value: 150 } });
    sb._els['btnCross'].onclick();
    sb._els['crossRange']._fire('input', { target: { value: 140 } });
    sb._els['chkHit']._fire('change', { target: { checked: false } });
    const set = JSON.parse(store['breach_game_set']);
    ok(Number(set.version) === 3, 'I A1 设置协议版本升到 3 (v=' + set.version + ')');
    ok(Math.abs(set.sens - 1.5) < 1e-6 && set.crosshair === 1 && Math.abs(set.crossSize - 1.4) < 1e-6 && set.hitmarker === false,
      'I A1 新设置项写入 (sens=' + set.sens + ', cross=' + set.crosshair + ', size=' + set.crossSize + ', hit=' + set.hitmarker + ')');
    // 刷新回读: 新沙箱应从同一 store 还原
    const sb2 = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb2);
    const s2 = sb2.window.__game.settings;
    ok(Math.abs(s2.sens - 1.5) < 1e-6 && s2.crosshair === 1 && s2.hitmarker === false, 'I A1 设置刷新后回读生效');
    ok(String(sb2._els['btnCross'].textContent).indexOf('纯十字') >= 0, 'I A1 准星样式按钮文案同步 (' + sb2._els['btnCross'].textContent + ')');
    ok(String(sb2._els['sensVal'].textContent).indexOf('1.50') >= 0, 'I A1 灵敏度数值显示同步 (' + sb2._els['sensVal'].textContent + ')');
  }
  // I2 A3: 改键 —— 键位表持久化 + 实际按键行为跟随绑定
  {
    const store = {};
    store['breach_game_set'] = JSON.stringify({ version: 2, vol: 100, shake: true, fps: false, adsHold: false, sens: 1, crosshair: 0, crossSize: 1, hitmarker: true, keys: { frag: 'h' } });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    ok(G.keyBinds.frag === 'h', 'I A3 自定义键位从设置读回 (frag=' + G.keyBinds.frag + ')');
    // v3: 新增两个可改键动作(声源诱饵 noise='z' / 破墙锤 breach='h') → 20 → 22
    ok(Object.keys(G.defKeys).length === 22, 'I A3 可改键动作 22 个 (' + Object.keys(G.defKeys).length + ')');
    ok(G.defKeys.noise === 'z' && G.defKeys.breach === 'h', 'I A3 新增动作默认键位 (noise=' + G.defKeys.noise + ', breach=' + G.defKeys.breach + ')');
    sb._els['btnStart'].onclick();   // 开局(started=true 才允许起手投掷)
    const key = (k) => { for (const fn of sb._listeners['doc:keydown'] || []) fn({ key: k, repeat: false, preventDefault() {} }); };
    key('h');
    ok(G.pendingThrow && G.pendingThrow.type === 'frag', 'I A3 绑定键 h 触发手雷蓄力');
    for (const fn of sb._listeners['doc:keyup'] || []) fn({ key: 'h' });
    key('g');
    ok(!G.pendingThrow, 'I A3 原键 g 已解绑, 不再触发手雷');
    // v3: 新增动作同样走改键表(默认 Z = 声源诱饵)
    key('z');
    ok(G.pendingThrow && G.pendingThrow.type === 'noise', 'I A3 声源诱饵键触发投掷蓄力');
    for (const fn of sb._listeners['doc:keyup'] || []) fn({ key: 'z' });
    // 恢复默认键位
    sb._els['btnKeyReset'].onclick();
    ok(G.keyBinds.frag === 'g', 'I A3 恢复默认键位');
    ok(JSON.parse(store['breach_game_set']).keys.frag === 'g', 'I A3 恢复默认后已落盘');
  }
  // I3 A4: 存档槽位 —— 槽位 1 沿用历史 key, 槽位 2 走 _s2 后缀
  {
    const store = {};
    store['breach_game_save'] = JSON.stringify({ version: 2, points: 11, rank: 2, stats: { wins: 3 } });
    store['breach_game_save_s2'] = JSON.stringify({ version: 2, points: 99, rank: 7, stats: { wins: 30 } });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    ok(G.slot === 1 && G.saveKeyFor(1) === 'breach_game_save', 'I A4 默认槽位 1 且沿用历史 key');
    ok(G.saveKeyFor(2) === 'breach_game_save_s2' && G.cfgKeyFor(3) === 'breach_game_cfg_s3', 'I A4 槽位 2/3 key 规则正确');
    G.setSlot(2);
    ok(G.slot === 2 && store['breach_game_slot'] === '2', 'I A4 切换槽位并落盘 (slot=' + store['breach_game_slot'] + ')');
    sb._els['btnStart'].onclick();   // 需要 player 存在才能结算
    G.saveResult(true, 3);   // 结算应写入槽位 2, 不动槽位 1
    ok(JSON.parse(store['breach_game_save']).points === 11, 'I A4 槽位 2 结算不污染槽位 1 (仍为 11)');
    ok(JSON.parse(store['breach_game_save_s2']).points === 105, 'I A4 槽位 2 结算写入 _s2 (' + JSON.parse(store['breach_game_save_s2']).points + ', 99+3星=105)');
    // hub 也按同一槽位协议读取
    const sbH = makeSandbox(store);
    vm.runInNewContext(readHtml('game/hub.html').script, sbH);
    ok(String(sbH._els['stPts'].textContent) === '105', 'I A4 hub 读取当前槽位(2) 的军功点 (' + sbH._els['stPts'].textContent + ')');
    ok(String(sbH._els['stRank'].textContent) === '中尉', 'I A4 hub 读取当前槽位(2) 的军衔 (' + sbH._els['stRank'].textContent + ')');
  }
  // I4 A5: 累计统计 —— 结算累加, 且旧档缺失字段自动补 0
  {
    const store = {};
    store['breach_game_save'] = JSON.stringify({ version: 1, points: 0, rank: 0, stats: { wins: 1, losses: 0, kills: 2, damage: 30, bestStars: 3, ach: {} }, daily: {} });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    sb._els['btnStart'].onclick();
    const before = JSON.parse(store['breach_game_save']);
    ok(before.stats.shots === undefined, 'I A5 v1 旧档初始无累计字段');
    G.saveResult(true, 3);
    const after = JSON.parse(store['breach_game_save']);
    const keys = ['shots', 'hits', 'longKill', 'bestStreak', 'gKills', 'time', 'ff', 'winStreak', 'bestWinStreak', 'mapWins'];
    ok(keys.every(k => after.stats[k] !== undefined), 'I A5 结算补齐全部累计字段 (' + keys.join('/') + ')');
    ok(Number(after.version) === 2, 'I A5 存档版本升到 2 (v=' + after.version + ')');
    ok(after.stats.winStreak === 1 && after.stats.bestWinStreak === 1, 'I A5 连胜计数 (' + after.stats.winStreak + '/' + after.stats.bestWinStreak + ')');
    ok(after.stats.mapWins.house === 1, 'I A5 地图胜场记录 (house=' + after.stats.mapWins.house + ')');
    G.saveResult(false, 1);
    const after2 = JSON.parse(store['breach_game_save']);
    ok(after2.stats.winStreak === 0 && after2.stats.bestWinStreak === 1, 'I A5 失败清零当前连胜, 保留最高连胜');
  }
  // I5 A6/A7/B2/B3: 定义表规模与新增条目
  {
    const store = {};
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    const ruleIds = G.dailyRules.map(r => r.id);
    ok(ruleIds.length === 7 && ['nopick', 'sidearm', 'night'].every(id => ruleIds.indexOf(id) >= 0),
      'I A6 每日挑战规则 4 → 7 (' + ruleIds.join(',') + ')');
    ok(G.achDefs.length === 15, 'I A7 成就 9 → 15 (' + G.achDefs.length + ')');
    const achIds = G.achDefs.map(a => a.id);
    ok(['streak5', 'fastWin3', 'longKill500', 'purist', 'sidearmWin', 'cartograph'].every(id => achIds.indexOf(id) >= 0),
      'I A7 新增六项成就 id 齐全');
    ok(G.achDefs.every(a => typeof a.check === 'function'), 'I A7 每项成就都有判定函数');
    const wk = Object.keys(G.weaponDefs);
    ok(wk.length === 6 && wk.indexOf('lmg') >= 0 && wk.indexOf('dmr') >= 0, 'I B2 武器 4 → 6 把 (' + wk.join(',') + ')');
    ok(G.weaponDefs.lmg.magSize === 75 && G.weaponDefs.dmr.dmg === 30, 'I B2 新武器数值生效 (lmg 弹匣=' + G.weaponDefs.lmg.magSize + ', dmr 伤害=' + G.weaponDefs.dmr.dmg + ')');
    ok(G.upgradeDefs.length === 18, 'I B3 升级 15 → 18 (' + G.upgradeDefs.length + ')');
    const upIds = G.upgradeDefs.map(d => d.id);
    ok(['throwRng', 'quiet', 'scavenge'].every(id => upIds.indexOf(id) >= 0), 'I B3 新增三项升级 id 齐全');
    ok(G.upgradeDefs.every(d => d.max >= 1 && Array.isArray(d.cost) && d.cost.length === d.max), 'I B3 新增升级 max/cost 结构正确');
  }
  // I6 A7: 成就墙筛选按钮渲染
  {
    const store = {};
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/hub.html').script, sb);
    const fh = String(sb._els['achFilter'].innerHTML);
    ok(fh.indexOf('全部') >= 0 && fh.indexOf('已解锁') >= 0 && fh.indexOf('未解锁') >= 0, 'I A7 成就墙筛选按钮渲染');
    ok(String(sb._els['achCount'].textContent) === '0/15', 'I A7 成就墙计数 0/15 (' + sb._els['achCount'].textContent + ')');
  }
  // I7 B2/B3: 新武器与新升级**实际生效**(不只是定义存在)
  {
    // 装备轻机枪开局
    const store = {};
    store['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'norm', weapon: 'lmg', map: 'house', upgrades: {} });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    sb._els['btnStart'].onclick();
    ok(sb.window.__game.player.weapon.magSize === 75, 'I B2 轻机枪可装备 (弹匣=' + sb.window.__game.player.weapon.magSize + ')');
  }
  // 投掷强化: 同样的准星距离下, 2 级投掷物初速更高
  const throwSpeed = (up) => {
    const store = {};
    store['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'norm', weapon: 'ar', map: 'house', upgrades: up });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    sb._els['btnStart'].onclick();
    G.mouseW.x = G.player.x + 600; G.mouseW.y = G.player.y;
    for (const fn of sb._listeners['doc:keydown'] || []) fn({ key: 'g', repeat: false, preventDefault() {} });
    for (const fn of sb._listeners['doc:keyup'] || []) fn({ key: 'g' });
    const g = G.grenades[0];
    return g ? Math.hypot(g.vx, g.vy) : 0;
  };
  {
    const v0 = throwSpeed({}), v2 = throwSpeed({ throwRng: 2 });
    ok(v0 > 0 && v2 > v0 * 1.4, 'I B3 投掷强化提升投掷距离 (' + v0.toFixed(0) + ' → ' + v2.toFixed(0) + ')');
  }
  // 消音步伐: 玩家枪声暴露半径随等级下降
  const shotNoise = (up) => {
    const store = {};
    store['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'norm', weapon: 'ar', map: 'house', upgrades: up });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    sb._els['btnStart'].onclick();
    G.mouseW.x = G.player.x + 300; G.mouseW.y = G.player.y;
    sb._els['cv']._fire('mousedown', { button: 0, preventDefault() {} });
    step(sb, 24, performance.now());
    const rs = G.noises.map(n => n.r);
    return rs.length ? Math.max(...rs) : 0;
  };
  {
    const r0 = shotNoise({}), r2 = shotNoise({ quiet: 2 });
    ok(r0 > 0 && r2 < r0 * 0.5, 'I B3 消音步伐降低枪声暴露半径 (' + r0.toFixed(0) + ' → ' + r2.toFixed(0) + ')');
  }
  // 搜刮效率: 同一弹药补给拾取量随等级提升
  const ammoPickup = (up) => {
    const store = {};
    store['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'norm', weapon: 'ar', map: 'house', upgrades: up });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    sb._els['btnStart'].onclick();
    const pk = G.pickups.find(p => p.type === 'ammo');
    G.player.x = pk.x; G.player.y = pk.y;
    step(sb, 3, performance.now());
    return G.player.primary.reserve;
  };
  {
    const a0 = ammoPickup({}), a2 = ammoPickup({ scavenge: 2 });
    ok(a2 - a0 === 30, 'I B3 搜刮效率提升拾取量 (+' + (a2 - a0) + ' 弹药)');
  }
  // I8 A2/A3/A4: 长街页同样遵循"只读设置 + 当前槽位 + 自定义键位"协议
  {
    const store = {};
    store['breach_game_slot'] = '2';
    store['breach_game_save'] = JSON.stringify({ version: 2, points: 1, streetBest: 11, streetWaves: 2, stats: {} });
    store['breach_game_save_s2'] = JSON.stringify({ version: 2, points: 5, streetBest: 123, streetWaves: 9, streetBosses: 2, stats: {} });
    const setRaw = JSON.stringify({ version: 2, vol: 40, shake: false, fps: true, adsHold: false, keys: { frag: 'h' } });
    store['breach_game_set'] = setRaw;
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/street.html').script, sb);
    const G = sb.window.__game;
    const st = G.settings;
    ok(st.vol === 40 && st.shake === false && st.fps === true, 'I A2 长街页读取主设置(音量/震动/FPS)');
    ok(store['breach_game_set'] === setRaw, 'I A2 长街页只读 breach_game_set(未改写)');
    ok(String(sb._els['volRange'].value) === '40', 'I A2 长街页音量滑块同步设置值 (' + sb._els['volRange'].value + ')');
    ok(G.slot === 2 && G.saveKey() === 'breach_game_save_s2' && G.cfgKey() === 'breach_game_cfg_s2', 'I A4 长街页使用同一槽位协议');
    const best = G.readBest();
    ok(best.score === 123 && best.waves === 9 && best.bosses === 2, 'I A4 长街页读取当前槽位成绩 (' + JSON.stringify(best) + ')');
    ok(G.keyBinds.frag === 'h', 'I A3 长街页读取自定义键位 (frag=' + G.keyBinds.frag + ')');
    const store2 = {};
    store2['breach_game_set'] = '{bad json';
    const sb2 = makeSandbox(store2);
    vm.runInNewContext(readHtml('game/street.html').script, sb2);
    ok(sb2.window.__game.settings.vol === 100, 'I A2 损坏设置回退默认音量 (v=' + sb2.window.__game.settings.vol + ')');
  }
  // I8b B2 回归: 长街(尸潮)页必须支持全部 6 把主武器 —— 选轻机枪/精确射手步枪要真的带进去
  //   (曾漏: street 页自带一份 WEAPON_DEFS, 扩武器时没同步 → 静默退回突击步枪, 玩家以为"机枪用不了")
  for (const [wid, wname, wmag] of [['lmg', '轻机枪', 75], ['dmr', '精确射手步枪', 12], ['sniper', '狙击枪', 5]]) {
    const store = {};
    store['breach_game_cfg'] = JSON.stringify({ version: 1, diff: 'norm', weapon: wid, map: 'house', upgrades: {} });
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/street.html').script, sb);
    sb._els['btnStart'].onclick();
    const g2 = sb.window.__game;
    ok(g2.weaponName === wname && g2.player.primary.magSize === wmag,
      'I B2 长街页装备「' + wname + '」生效 (' + g2.weaponName + ' / 弹匣 ' + g2.player.primary.magSize + ')');
  }
  // I9 A6 回归: 准备页「今日规则」必须与游戏页当天实际生效的规则一致
  // (曾错位: hub 用 raw%规则数, 游戏页用 (raw%1000)%规则数 —— 规则数=4 时 1000 可整除而恰好等价,
  //  扩到 7 条后两页选出不同规则; 这条断言锁死该坑, 且每天换规则都会重新覆盖一次)
  {
    const store = {};
    const sbG = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sbG);
    sbG._els['btnDaily'].onclick();   // 进入每日挑战 → dailyRule 按当天种子选出
    const rule = sbG.window.__game.dailyRule;
    ok(!!rule && !!rule.name, 'I A6 游戏页每日挑战规则已选出 (' + (rule && rule.name) + ')');
    const sbH = makeSandbox(store);
    vm.runInNewContext(readHtml('game/hub.html').script, sbH);
    const txt = String(sbH._els['dlToday'].textContent);
    ok(rule && txt.indexOf(rule.name) >= 0,
      'I A6 准备页「今日规则」与游戏页一致 (hub="' + txt.replace(/（.*$/, '') + '" ｜ 游戏="' + (rule && rule.name) + '")');
  }
  // I10 自动开门(A1+): 工具条按钮切换 + 持久化 + 实际生效 + 不破坏"关门战术" + 教程强制关闭
  {
    const store = {};
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const G = sb.window.__game;
    ok(G.settings.autoDoor === false, 'I A1+ 自动开门默认关闭');
    sb._els['btnAutoDoor'].onclick();
    ok(G.settings.autoDoor === true, 'I A1+ 点击工具条按钮开启自动开门');
    const set = JSON.parse(store['breach_game_set']);
    ok(set.autoDoor === true && Number(set.version) === 3, 'I A1+ 自动开门持久化, 设置版本升到 3 (v=' + set.version + ')');
    ok(String(sb._els['btnAutoDoor'].innerHTML).indexOf('自动开门：开') >= 0, 'I A1+ 按钮文案同步 (' + sb._els['btnAutoDoor'].innerHTML + ')');
    // 刷新回读
    const sbR = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sbR);
    ok(sbR.window.__game.settings.autoDoor === true, 'I A1+ 刷新后回读自动开门=开');
    // 行为: 开局后站到一扇关着的门旁 → 下一帧自动打开
    sb._els['btnStart'].onclick();
    const door = G.doors.find(d => !d.open);
    ok(!!door, 'I A1+ 存在初始关闭的门 (' + G.doors.length + ' 扇)');
    G.player.x = door.cx; G.player.y = door.cy;
    step(sb, 3, performance.now());
    ok(door.open === true, 'I A1+ 开启后靠近关闭的门会自动打开');
    // 只开不关: 玩家按 E 关上的门(manual)不会被自动弹开 —— 关门战术仍然有效
    door.open = false; door.manual = true;
    step(sb, 3, performance.now());
    ok(door.open === false, 'I A1+ 玩家刻意关上的门不会被自动打开(关门战术保留)');
  }
  // 教程模式: 即使设置里开着, 也必须手动按 E(否则教程第 4 步无法完成)
  {
    const store = {};
    store['breach_game_set'] = JSON.stringify({ version: 3, vol: 100, shake: true, fps: false, adsHold: false, autoDoor: true });
    const sb = makeSandbox(store);
    sb.location.search = '?tutorial=1';
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    ok(sb.window.__game.settings.autoDoor === false, 'I A1+ 教程模式强制关闭自动开门(必须手动按 E)');
  }
}

console.log(pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
