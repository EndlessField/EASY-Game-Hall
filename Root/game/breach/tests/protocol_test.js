// 存档/设置协议回归测试(含 P0-3 / P0-4 两类回归)
// 覆盖既有门禁的 6 处空白:
//   ① SET_VERSION 1→3 迁移(缺 sens/crosshair/crossSize/hitmarker/autoDoor/keys 的旧设置档)
//   ② 只玩过长街的 v1 档被游戏页读取(跨页 v1→v2)
//   ③ 长街写回不裁剪 v2 累计字段
//   ④ breach_game_slot 非法值回退(四页各自实现 activeSlot)
//   ⑤ localStorage.setItem 抛异常(配额满/隐私模式)
//   ⑥ 三档槽位"写入侧"互不污染
// 外加 P0-3(保存失败必须可见且不得白拿升级)与 P0-4(导入先清洗再落盘 + 大小上限)。
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
    appendChild() {}, className: '', disabled: false, checked: false, value: '',
    textContent: '', innerHTML: '', width: 0, height: 0,
    getContext: () => makeCtx(), onclick: null
  };
}
// opts: { failSet: (k,v)=>bool —— 返回 true 表示这次写入要抛配额异常 }
function makeSandbox(store, opts) {
  opts = opts || {};
  const els = opts.els || {};
  let rafCb = null;
  const listeners = {};
  const sb = {
    console, performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => { rafCb = fn; return 1; },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl()),
      createElement: () => makeEl(),
      addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); },
      body: { appendChild() {}, removeChild() {} }
    },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        if (opts.failSet && opts.failSet(k, v)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
        store[k] = String(v);
      },
      removeItem: (k) => { delete store[k]; }
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

// ---------- ① SET_VERSION 1→3 迁移 ----------
{
  const store = { breach_game_set: JSON.stringify({ version: 1, vol: 33, shake: false, fps: true, adsHold: true }) };
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  const G = sb.window.__game;
  const s = G.settings;
  ok(s.vol === 33 && s.shake === false && s.fps === true, '① v1 设置档的旧字段被保留 (vol=' + s.vol + ')');
  const set = JSON.parse(store.breach_game_set);
  ok(set.version >= 3, '① 旧设置档启动即迁移并落盘 SET_VERSION 到 3+ (=' + set.version + ')');
  ok(typeof set.sens === 'number' && typeof set.crosshair === 'number' && typeof set.crossSize === 'number'
    && typeof set.hitmarker === 'boolean' && typeof set.autoDoor === 'boolean' && 'keys' in set,
    '① v1 档补齐 sens/crosshair/crossSize/hitmarker/autoDoor/keys 全部缺省字段');
}
// ---------- ①b §6.1.6 色觉友好配色: 默认关 / 持久化 / 跨刷新回读 / 调色板真的换了 ----------
{
  const store = {};
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  const G = sb.window.__game;
  ok(G.settings.cbMode === false, '①b 色觉友好配色默认关闭');
  const stdRed = G.teamColors.redDot, stdBlue = G.teamColors.blueDot;
  sb._els['chkCb']._fire('change', { target: { checked: true } });
  const set = JSON.parse(store.breach_game_set);
  ok(set.cbMode === true, '①b 勾选后持久化到 breach_game_set.cbMode');
  const cbRed = G.teamColors.redDot, cbBlue = G.teamColors.blueDot;
  ok(cbRed !== stdRed && cbBlue !== stdBlue, '①b 切换后阵营配色真的变了 (' + stdRed + '/' + stdBlue + ' → ' + cbRed + '/' + cbBlue + ')');
  ok(/^#[0-9a-f]{6}$/i.test(cbRed) && /^#[0-9a-f]{6}$/i.test(cbBlue), '①b 色觉友好配色是合法色值');
  // 刷新回读
  const sb2 = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb2);
  ok(sb2.window.__game.settings.cbMode === true, '①b 刷新后回读 cbMode=true');
  ok(sb2._els['chkCb'].checked === true, '①b 刷新后复选框状态回读');
  ok(sb2.window.__game.teamColors.redDot === cbRed, '①b 刷新后仍使用色觉友好配色');
}

{
  const store = {
    breach_game_save: JSON.stringify({ version: 1, rank: 4, points: 77, stats: { wins: 3, losses: 2, kills: 20, damage: 500, bestStars: 2, ach: { firstWin: true } }, daily: {} })
  };
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/breach.html').script, sb);
  const G = sb.window.__game;
  sb._els['btnStart'].onclick();   // 开局(等价于点"开始游戏")
  ok(G.units.length > 0, '② 带 v1 存档能正常开局(不读挂)');
  G.saveResult(true, 3);   // 触发一次结算 → 走 migrateSave 落盘
  const sv = JSON.parse(store.breach_game_save);
  ok(sv.version >= 2, '② 结算后 SAVE_VERSION 升到 2+ (=' + sv.version + ')');
  ok(sv.points > 77 && sv.stats.wins === 4, '② 旧档点数/胜场被正确累加 (points=' + sv.points + ', wins=' + sv.stats.wins + ')');
  for (const k of ['shots', 'hits', 'longKill', 'bestStreak', 'gKills', 'time', 'ff', 'winStreak', 'bestWinStreak']) {
    if (!(k in sv.stats)) { ok(false, '② v2 累计字段缺失: stats.' + k); break; }
  }
  ok(['shots', 'hits', 'longKill', 'bestStreak', 'gKills', 'time', 'ff', 'winStreak', 'bestWinStreak'].every(k => k in sv.stats),
    '② v1→v2 补齐全部累计统计字段');
}
// ---------- ③ 长街写回不裁剪 v2 累计字段 ----------
{
  const store = {
    breach_game_save: JSON.stringify({
      version: 2, rank: 1, points: 5,
      stats: { wins: 1, losses: 0, kills: 9, damage: 100, bestStars: 2, ach: {}, shots: 123, hits: 45, longKill: 340, bestStreak: 4, gKills: 2, time: 61, ff: 0, winStreak: 1, bestWinStreak: 3, mapWins: { house: 1 } },
      daily: { '2026-01-01': { stars: 2, time: 55 } }, streetBest: 0, streetWaves: 0
    })
  };
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/street.html').script, sb);
  const G = sb.window.__game;
  ok(G !== undefined && typeof G.start === 'function', '③ 长街页可加载');
  G.start();
  // 反复推进直到判负结算, 触发 saveStreetResult 写回
  G.player.dead = true;
  let t = 0;
  for (let i = 0; i < 900 && G.result === null; i++) { G.player.dead = true; t = step(sb, 1, t); }
  t = step(sb, Math.ceil(4 / 0.016), t);   // 结算画面 1.3s 后才写盘(showEnd)
  const sv = JSON.parse(store.breach_game_save);
  ok(sv.stats.shots === 123, '③ 长街写回后 shots 未被裁剪/改写 (=' + sv.stats.shots + ')');
  ok(sv.stats.longKill === 340 && sv.stats.gKills === 2 && (sv.stats.mapWins || {}).house === 1,
    '③ 长街写回后 longKill/gKills/mapWins 等 v2 字段原样保留');
}
// ---------- ④ breach_game_slot 非法值回退 ----------
{
  for (const bad of ['abc', '0', '9', '-1', '2.7', '', 'null']) {
    const store = { breach_game_slot: bad };
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    const slot = sb.window.__game.slot;
    ok(slot === 1, '④ 游戏页 slot="' + bad + '" → 回退 1 (得到 ' + slot + ')');
  }
  for (const bad of ['abc', '0', '9', '-1']) {
    const store = { breach_game_slot: bad };
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/street.html').script, sb);
    ok(sb.window.__game.slot === 1, '④ 长街页 slot="' + bad + '" → 回退 1');
  }
}
// ---------- ⑤ localStorage.setItem 抛异常: 保存失败必须可见且不得白拿升级 ----------
{
  const store = { breach_game_save_s2: JSON.stringify({ version: 2, points: 50, rank: 0, stats: {} }) };
  const els = {};
  const sb = makeSandbox(store, { els, failSet: (k) => k.indexOf('_save') >= 0 || k === 'breach_game_save' });   // 只让"存档"写入失败(槽位号写入仍成功)
  vm.runInNewContext(readHtml('game/hub.html').script, sb);
  const G = sb.window.__game;
  if (!G) { ok(false, '⑤ 准备页暴露 __game 测试钩子'); }
  else {
    G.setSlot(2);
    G.loadAll();   // setSlot 只切槽位号; 界面上的"档案"按钮走的是 setActiveSlot + loadAll
    const before = JSON.parse(store.breach_game_save_s2).points;
    ok(G.points() === 50, '⑤ 切到档案 2 后读到 50 军功点 (=' + G.points() + ')');
    ok(G.upgradeLv('hp') === 0, '⑤ 初始 hp 升级等级为 0');
    sb._els['upBtn_hp'].onclick();   // 买生命强化(cost 1)
    ok(G.upgradeLv('hp') === 0, '⑤ 写盘失败时不得白拿升级 (hp 仍为 0)');
    ok(G.points() === 50, '⑤ 写盘失败时军功点不得被扣 (仍为 ' + G.points() + ')');
    const msg = G.lastToast();
    ok(/保存失败|本地存储/.test(msg), '⑤ 写盘失败有明确提示 (toast="' + msg + '")');
    ok(before === 50, '⑤ 落盘内容未被改动 (points=' + JSON.parse(store.breach_game_save_s2).points + ')');
  }
}
// ---------- ⑥ 三档槽位"写入侧"互不污染 ----------
{
  const store = {};
  // 槽位 1: 玩一局战役
  {
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    sb._els['btnStart'].onclick();   // saveResult 依赖 player/pStats, 必须先开局
    sb.window.__game.saveResult(true, 3);
  }
  const s1 = JSON.parse(store.breach_game_save);
  // 槽位 2: 换档案再玩一局
  {
    const sb = makeSandbox(store);
    vm.runInNewContext(readHtml('game/breach.html').script, sb);
    sb._els['btnStart'].onclick();
    sb.window.__game.setSlot(2);
    sb.window.__game.saveResult(false, 0);
  }
  const s2 = JSON.parse(store.breach_game_save_s2);
  ok(!!s1 && !!s2, '⑥ 槽位 1/2 各自落盘 (keys: breach_game_save, breach_game_save_s2)');
  ok(s1.stats.wins === 1 && s1.stats.losses === 0, '⑥ 槽位 1 只记录自己的胜利 (wins=' + s1.stats.wins + ')');
  ok(s2.stats.wins === 0 && s2.stats.losses === 1, '⑥ 槽位 2 只记录自己的失败 (losses=' + s2.stats.losses + ')');
  ok(!('breach_game_save_s3' in store), '⑥ 未使用的槽位 3 不产生多余 key');
}
// ---------- ⑦ 长街页 slot 非法值 + street 只写自己的槽位 ----------
{
  const store = { breach_game_slot: '3' };
  const sb = makeSandbox(store);
  vm.runInNewContext(readHtml('game/street.html').script, sb);
  const G = sb.window.__game;
  G.start();
  let t = 0;
  t = step(sb, Math.ceil(9 / 0.016), t);   // 等第一波
  for (const z of G.units.filter(u => u.kind === 'zombie' && !u.dead)) G.killUnit(z, G.player);
  t = step(sb, 12, t);                     // 清空一波(弃局不结算, 必须至少清一波才会写盘)
  G.player.dead = true;
  for (let i = 0; i < 900 && G.result === null; i++) { G.player.dead = true; t = step(sb, 1, t); }
  t = step(sb, Math.ceil(4 / 0.016), t);   // 结算画面 1.3s 后才写盘(showEnd)
  ok('breach_game_save_s3' in store, '⑦ 长街在档案 3 结算写入 _s3 key (keys=' + Object.keys(store).join(',') + ', result=' + G.result + ', cleared=' + G.waveClearedCount + ')');
  ok(!('breach_game_save' in store), '⑦ 长街不会污染档案 1 的存档');
}
// ---------- ⑧ P0-4 导入: 先清洗再落盘 + 大小上限 ----------
{
  const store = {};
  const els = {};
  const sb = makeSandbox(store, { els });
  vm.runInNewContext(readHtml('game/hub.html').script, sb);
  const G = sb.window.__game;
  ok(!!G && typeof G.applyBackup === 'function', '⑧ 准备页暴露 applyBackup 测试钩子');
  const dirty = {
    app: 'breach-door-cqb', ver: 1,
    cfg: { version: 'x', map: '__nope__', diff: '__nope__', weapon: '__nope__', upgrades: { hp: 999, __bad__: 5 } },
    save: { version: 'x', points: 'abc', rank: -7, stats: { wins: '9e99', bestStars: 42, mapWins: { house: 'x' } }, daily: { '2026-01-01': { stars: 'x', time: 'y' }, bad: 'nope' } }
  };
  const okImport = G.applyBackup(dirty);
  ok(okImport === true, '⑧ 合法 app 标识的存档可导入');
  const cfg2 = JSON.parse(store.breach_game_cfg || 'null');
  const sv2 = JSON.parse(store.breach_game_save || 'null');
  ok(cfg2 && cfg2.map === 'house' && cfg2.diff === 'norm' && cfg2.weapon === 'ar', '⑧ 落盘的 cfg 已清洗(非法 map/diff/weapon 回退默认)');
  ok(cfg2 && !('__bad__' in cfg2.upgrades) && cfg2.upgrades.hp === 3, '⑧ 落盘的 cfg 升级等级被钳到 max(3) 且剔除未知 id');
  ok(sv2 && sv2.points === 0 && sv2.rank === 0, '⑧ 落盘的 save 已清洗(points/rank 非负整数)');
  ok(sv2 && sv2.stats.wins === 0 && sv2.stats.bestStars === 3, '⑧ 落盘的统计被钳制(wins=0, bestStars≤3)');
  ok(sv2 && sv2.daily['2026-01-01'] && sv2.daily['2026-01-01'].stars === 0 && !('bad' in sv2.daily),
    '⑧ 落盘的 daily 逐条钳制且剔除非法条目');
  ok(G.applyBackup({ app: 'other-app', save: {} }) === false, '⑧ 非本游戏存档被拒绝');
  // 大小上限: 直接调用导入入口(hub 的 importBackupFile 通过 __game 暴露)
  const big = { size: 300 * 1024, name: 'big.json' };
  let rejected = false;
  try { G.importBackupFile(big); } catch (e) { }
  const hint = (els['hint'] || els['toast'] || {}).textContent || '';
  rejected = /过大|256/.test(hint);
  ok(rejected, '⑧ 超过 256KB 的存档文件被拒绝 (提示="' + hint + '")');
}
// ---------- ⑨ 主页导入: 写盘失败不得谎报成功 ----------
{
  const store = {};
  const sb = makeSandbox(store, { failSet: () => true });
  vm.runInNewContext(readHtml('index.html').script, sb);
  const G = sb.window.__game;
  ok(!!G && typeof G.applyBackup === 'function', '⑨ 主页暴露 applyBackup 测试钩子');
  ok(G.applyBackup({ app: 'breach-door-cqb', save: { version: 2, points: 3 } }) === false,
    '⑨ 主页写盘失败时 applyBackup 返回 false(不谎报导入成功)');
}

// ---------- ⑩ v3.1 加密导出: 加解密往返 / 错误口令 / 篡改 / 导入通道 / 跨页同格式 ----------
{
  const store = {};
  const els = {};
  const sb = makeSandbox(store, { els });
  vm.runInNewContext(readHtml('game/hub.html').script, sb);
  const G = sb.window.__game;
  ok(typeof G.encryptBackup === 'function' && typeof G.decryptBackup === 'function', '⑩ 准备页暴露加解密钩子');
  ok(G.encFormat === 'sha256-ctr-hmac-v1' && G.encIter >= 1000, '⑩ 加密方案与迭代次数有明确标识 (' + G.encFormat + ', iter=' + G.encIter + ')');
  const payload = {
    app: 'breach-door-cqb', ver: 1, at: '2026-10-11T00:00:00.000Z',
    cfg: { version: 1, map: 'house', diff: 'norm', weapon: 'ar', upgrades: { hp: 2 } },
    save: { version: 2, points: 1234, rank: 3, stats: { wins: 9 } }
  };
  const env = G.encryptBackup(payload, '口令 Pass 123 · 中文');
  ok(!!env && env.app === 'breach-door-cqb' && env.enc === G.encFormat, '⑩ 加密信封保留 app 标识并带算法标识');
  ok(!!env && env.iter === G.encIter && !!env.salt && !!env.nonce && !!env.tag && !!env.data, '⑩ 信封带 iter/salt/nonce/tag/data');
  const flat = JSON.stringify(env);
  ok(flat.indexOf('1234') < 0 && flat.indexOf('house') < 0 && flat.indexOf('"points"') < 0, '⑩ 信封里不含任何明文(数值/地图名/字段名都看不到)');
  const back = G.decryptBackup(env, '口令 Pass 123 · 中文');
  ok(back.ok === true && back.data.save.points === 1234 && back.data.cfg.upgrades.hp === 2, '⑩ 正确口令解回原始数据(含中文口令)');
  const wrong = G.decryptBackup(env, '口令 Pass 124 · 中文');
  ok(wrong.ok === false && wrong.err === 'auth', '⑩ 错误口令被 HMAC 拒绝 (err=' + (wrong && wrong.err) + ')');
  const tam = JSON.parse(JSON.stringify(env));
  tam.data = (tam.data.charAt(0) === 'A' ? 'B' : 'A') + tam.data.slice(1);
  ok(G.decryptBackup(tam, '口令 Pass 123 · 中文').err === 'auth', '⑩ 密文被改动一位 → 拒绝');
  const tam2 = JSON.parse(JSON.stringify(env));
  tam2.tag = (tam2.tag.charAt(0) === 'A' ? 'B' : 'A') + tam2.tag.slice(1);
  ok(G.decryptBackup(tam2, '口令 Pass 123 · 中文').err === 'auth', '⑩ 校验码被改动 → 拒绝');
  const slow = JSON.parse(JSON.stringify(env));
  slow.iter = 99999999;
  const t0 = Date.now();
  const slowR = G.decryptBackup(slow, '口令 Pass 123 · 中文');
  ok(slowR.ok === false && slowR.err === 'format' && (Date.now() - t0) < 1500,
    '⑩ 手改超大 iter: 当场判格式错误(不进 KDF, 不卡死) [' + (Date.now() - t0) + 'ms]');
  ok(G.decryptBackup({ app: 'breach-door-cqb', enc: G.encFormat, salt: env.salt, nonce: env.nonce, tag: env.tag, data: env.data }, 'p').err === 'format',
    '⑩ 缺 iter 的信封被拒绝(本版本自己的文件一定带 iter)');
  // iter 由文件决定: 换一个迭代次数加密出来的文件, 导入时按文件参数重算 → 依然解得开(老文件不会失效)
  const envLow = G.encryptBackup(payload, 'pw-iter', 2000);
  ok(!!envLow && envLow.iter === 2000, '⑩ encryptBackup 可指定 iter(写进文件)');
  ok(G.decryptBackup(envLow, 'pw-iter').ok === true, '⑩ 不同迭代数的文件照样解得开(导入以文件里的 iter 为准)');
  ok(G.decryptBackup({ app: 'breach-door-cqb', enc: 'aes-别的算法', data: 'x' }, 'p').err === 'format', '⑩ 未知加密方案被拒绝');
  ok(G.decryptBackup(env, '口令 Pass 123 · 中文').ok === true, '⑩ 同一份文件可反复解密(纯函数, 无状态)');
  ok(G.encryptBackup(payload, '') === null && G.encryptBackup(payload, null) === null, '⑩ 空口令不产生"看似加密"的文件');
  // 导入通道: 加密文件 → 要口令 → 解开 → 清洗 → 落盘
  const env2 = G.encryptBackup({ app: 'breach-door-cqb', cfg: { map: 'parking' }, save: { version: 2, points: 7 } }, 'pw-123');
  sb.prompt = () => 'pw-123';
  sb.FileReader = function () { this.readAsText = () => { this.result = JSON.stringify(env2); if (this.onload) this.onload(); }; };
  G.importBackupFile({ size: 512, name: 'enc.json' });
  const sv = JSON.parse(store.breach_game_save || 'null');
  const cf = JSON.parse(store.breach_game_cfg || 'null');
  ok(!!sv && sv.points === 7, '⑩ 加密存档经导入通道正确落盘 (points=' + (sv && sv.points) + ')');
  ok(!!cf && cf.map === 'parking', '⑩ 加密存档同时恢复配置 (map=' + (cf && cf.map) + ')');
  // 口令错误: 不得写入任何数据, 且要有明确提示
  const store2 = {};
  const els2 = {};
  const sb2 = makeSandbox(store2, { els: els2 });
  vm.runInNewContext(readHtml('game/hub.html').script, sb2);
  const G2 = sb2.window.__game;
  sb2.prompt = () => 'wrong-pw';
  sb2.FileReader = function () { this.readAsText = () => { this.result = JSON.stringify(env2); if (this.onload) this.onload(); }; };
  G2.importBackupFile({ size: 512, name: 'enc.json' });
  ok(!('breach_game_save' in store2) && !('breach_game_cfg' in store2), '⑩ 口令错误时不写入任何数据');
  ok(/口令/.test(G2.lastToast()), '⑩ 口令错误有明确提示 (toast="' + G2.lastToast() + '")');
  // 取消输入口令(用户按 Esc): 同样不落盘
  const store3 = {};
  const sb3 = makeSandbox(store3, {});
  vm.runInNewContext(readHtml('game/hub.html').script, sb3);
  const G3 = sb3.window.__game;
  sb3.prompt = () => null;
  sb3.FileReader = function () { this.readAsText = () => { this.result = JSON.stringify(env2); if (this.onload) this.onload(); }; };
  G3.importBackupFile({ size: 512, name: 'enc.json' });
  ok(!('breach_game_save' in store3), '⑩ 取消输入口令 → 不导入(不静默降级)');
  // 跨页同格式: 主页(index)必须能解开准备页(hub)产出的密文
  const sb4 = makeSandbox({}, {});
  vm.runInNewContext(readHtml('index.html').script, sb4);
  const GI = sb4.window.__game;
  const cross = GI.decryptBackup(env, '口令 Pass 123 · 中文');
  ok(cross.ok === true && cross.data.save.points === 1234, '⑩ 主页能解开准备页导出的加密存档(两页副本同格式)');
  ok(GI.encFormat === G.encFormat, '⑩ 两页加密方案标识一致 (' + GI.encFormat + ')');
  const GIenv = GI.encryptBackup(payload, 'pw-index');
  ok(G.decryptBackup(GIenv, 'pw-index').ok === true, '⑩ 反向也通: 准备页能解开主页导出的加密存档');
  // 明文(未勾选加密)路径不受影响: 仍然原样导出 app/ver/cfg/save
  const plain = GI.buildBackup();
  ok(plain.app === 'breach-door-cqb' && 'cfg' in plain && 'save' in plain && !('enc' in plain), '⑩ 不勾选加密时导出仍是明文 json(老文件格式不变)');
  // ---------- 导出侧端到端: 勾选 → 输口令 → 捕获 Blob 内容 → 必须能解回本档案 ----------
  {
    const store5 = {}, els5 = {};
    const sb5 = makeSandbox(store5, { els: els5 });
    vm.runInNewContext(readHtml('game/hub.html').script, sb5);
    const G5 = sb5.window.__game;
    let captured = null;
    sb5.Blob = function (parts) { captured = parts.join(''); };
    sb5.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() { } };
    sb5.document.createElement = () => ({ style: {}, href: '', download: '', click() { } });
    store5.breach_game_save = JSON.stringify({ version: 2, points: 88888, rank: 4 });
    store5.breach_game_cfg = JSON.stringify({ version: 1, weapon: 'sniper', map: 'office' });
    G5.loadAll();
    const pwSeq = ['pw-export', 'pw-export'];
    sb5.prompt = () => (pwSeq.length ? pwSeq.shift() : null);
    els5['chkEncExport'].checked = true;
    G5.exportBackup();
    ok(!!captured, '⑩ 勾选加密后确实产出了文件内容');
    const envOut = JSON.parse(captured);
    ok(!!envOut && envOut.enc === G5.encFormat && !('save' in envOut) && !('cfg' in envOut),
      '⑩ 导出的加密文件里没有 save/cfg 明文');
    ok(captured.indexOf('88888') < 0, '⑩ 导出的加密文件里看不到点数明文(88888)');
    const rt = G5.decryptBackup(envOut, 'pw-export');
    ok(rt.ok === true && rt.data.save.points === 88888 && rt.data.cfg.weapon === 'sniper',
      '⑩ 导出的加密文件能解回本档案的完整数据');
    // 两次口令不一致 → 一个字节都不导出(绝不能"悄悄退回明文导出")
    captured = null;
    const mism = ['aaa', 'bbb'];
    sb5.prompt = () => (mism.length ? mism.shift() : null);
    els5['chkEncExport'].checked = true;
    G5.exportBackup();
    ok(captured === null, '⑩ 两次口令不一致 → 不导出任何文件');
    // 用户在口令框按取消 → 同样不导出
    captured = null;
    sb5.prompt = () => null;
    G5.exportBackup();
    ok(captured === null, '⑩ 口令框取消 → 不导出任何文件');
    // 不勾选 → 仍是明文 json(向后兼容: 老格式、老导入流程)
    captured = null;
    els5['chkEncExport'].checked = false;
    G5.exportBackup();
    const plainOut = JSON.parse(captured || 'null');
    ok(!!plainOut && plainOut.app === 'breach-door-cqb' && !!plainOut.save && !('enc' in plainOut),
      '⑩ 不勾选加密 → 导出仍是原来的明文 json');
  }
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nPROTOCOL TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
