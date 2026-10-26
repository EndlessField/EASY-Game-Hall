// 独立玩法《丧尸围城·长街尸潮》测试: 长街地图 / 两端+巷口刷尸 / 波后补给 / 每3波强化 / 共用存档结算
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'game', 'street.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.log('NO SCRIPT'); process.exit(1); }
const code = m[1];

function makeCtx() {
  const t = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(t, {
    get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; },
    set(ta, p, v) { ta[p] = v; return true; }
  });
}
const ctxStub = makeCtx();
function makeEl() {
  const ls = {};
  const el = {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); },
    appendChild(c) { el.children.push(c); return c; }, disabled: false, className: '', textContent: '', innerHTML: '',
    width: 0, height: 0, getContext: () => ctxStub, onclick: null,
    children: [],   // B6: 记录 appendChild, 用于验证招募面板/结算名单确实被填充
  };
  return el;
}
const listeners = {};
const store = {};
// B6: 沙箱改为工厂 —— 页面脚本里的顶层 const 在同一 vm 上下文里不能重复声明,
// 因此"再来一局/换场景重开"必须开一个全新的沙箱(测试内多轮 load() 依赖这一点)。
function makeSandbox() {
  const els = {};
  let raf = null;
  const sb = {
    console,
    performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
    window: {
      innerWidth: 1280, innerHeight: 800,
      addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); },
      AudioContext: undefined, webkitAudioContext: undefined
    },
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl()),
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
  sb.globalThis = sb;
  sb.window.window = sb.window;
  return { sb, els, raf: () => raf };
}
let S = makeSandbox();
let els = S.els, sandbox = S.sb;
let rafCb = null;

function step(n, t0) {
  let t = t0;
  for (let i = 0; i < n; i++) { t += 16; rafCb(t); }
  return t;
}
let ok = true;
function expect(cond, msg) {
  if (cond) console.log('PASS ' + msg);
  else { console.log('FAIL ' + msg); ok = false; }
}
// B6: 重开一局 = 全新沙箱 + 全新 rAF 回调(旧的 rAF 链仍指向旧沙箱, 必须整体替换)
function resetSandbox() {
  S = makeSandbox(); els = S.els; sandbox = S.sb; rafCb = null; return S;
}
function load() {
  try { vm.runInNewContext(code, sandbox, { filename: 'street.js' }); rafCb = S.raf(); return true; }
  catch (e) { console.log('LOAD ERROR: ' + e.stack); return false; }
}
// B6 新机制回归用的两个小工具(与页面同口径: 16px 网格下标钳制 / 清空本波)
function clampInt(v, a, b) { v = Math.floor(v); return v < a ? a : v > b ? b : v; }
function clearWave(G2, t2) {
  for (const z of G2.units.filter(u => u.kind === 'zombie' && !u.dead)) G2.killUnit(z, G2.player);
  return step(16, t2);
}

(async function main() {
  // 1. 共享成长配置: 预置武器/升级(与主游戏同协议), 再加载页面 → applyLoadout 应生效
  store['breach_game_cfg'] = JSON.stringify({
    diff: 'norm', weapon: 'shotgun',
    upgrades: { hp: 2, ammo: 1, frag: 1, robDmg: 2 }
  });
  if (!load()) process.exit(1);
  const G = sandbox.window.__game;
  let t = performance.now();
  expect(G.weaponName === '霰弹枪', 'loadout reads weapon from shared cfg (霰弹枪)');

  // 2. 开局并校验: 长街地图有上下两排建筑
  els['btnStart'].onclick();
  expect(G.started === true, 'street game started');
  const buildings = G.buildingRects;
  expect(buildings.length === 10, 'street map has 10 building blocks (got ' + buildings.length + ')');
  const tops = buildings.filter(b => b.y < 200), bots = buildings.filter(b => b.y > 300);
  expect(tops.length === 5 && bots.length === 5, '5 top + 5 bottom buildings');
  expect(G.units.length === 3, 'spawned player + 2 survivors (got ' + G.units.length + ')');
  expect(G.covers.length >= 8, 'street has parked vehicles/cover (' + G.covers.length + ')');

  // 2b. 名字不再 undefined: 玩家/幸存者/丧尸都应有真实名称
  const nameOk = G.units.every(u => u.name && u.name !== 'undefined');
  expect(nameOk, 'unit names are defined (' + G.units.map(u => u.name).join('/') + ')');
  expect(G.player.name === '你', 'player name is 你');

  // 2c. 新机制回归: 出不了地图 / 人机也会捡医疗包
  G.player.x = -80; G.player.y = 9999;
  t = step(1, t);
  expect(G.player.x >= 11 && G.player.x <= 1440 - 11 && G.player.y >= 0 && G.player.y <= 600,
    'player clamped inside map bounds (x=' + G.player.x + ', y=' + G.player.y + ')');
  const botHeal = G.units.find(u => u.kind === 'robot');
  botHeal.hp = botHeal.maxHp - 30;
  G.pickups.push({ x: botHeal.x, y: botHeal.y, type: 'med', taken: false });
  t = step(2, t);
  expect(G.pickups.some(p => p.taken), 'bot collected a med pickup near it');
  expect(botHeal.hp >= botHeal.maxHp - 1, 'bot healed by med pickup (hp=' + botHeal.hp + ')');

  // 3a. 换弹与备弹扣减: 弹匣打空(备弹660)后松开 → 自动换弹, 备弹随之减少
  {
    const w0 = G.player.primary;
    w0.mag = 0; w0.reserve = 660;
    t = step(Math.ceil(2.5 / 0.016), t);
    expect(w0.mag === w0.magSize, 'auto reload fills mag to ' + w0.magSize + ' (got ' + w0.mag + ')');
    expect(w0.reserve === 660 - w0.magSize, 'reserve consumed by reload (660 -> ' + w0.reserve + ')');
  }

  // 3. 首波在 reload 测试后仍会到来(4s 倒计时); 一刷出立即采样出生位置
  let guard = 0;
  while (G.wave === 0 && guard < 400) { t = step(10, t); guard++; }
  t = step(3, t);
  const zombies = G.units.filter(u => u.kind === 'zombie' && !u.dead);
  expect(G.wave === 1, 'first wave started (wave=' + G.wave + ')');
  expect(zombies.length >= 4, 'wave1 spawns >=4 live zombies (got ' + zombies.length + ')');
  const fromEnds = zombies.filter(z => z.x < 200 || z.x > 1240).length;
  const fromAlley = zombies.filter(z => z.y < 240 || z.y > 360).length;
  expect(fromEnds >= 2, 'zombies from both street ends (' + fromEnds + ')');
  expect(fromAlley >= 1, 'zombies from alley mouths (' + fromAlley + ')');
  const zombieNameOk = zombies.every(z => z.name && z.name !== 'undefined');
  expect(zombieNameOk, 'zombie names are defined (' + [...new Set(zombies.map(z => z.name))].join('/') + ')');

  // 3b. 丧尸致盲/受击计时衰减(回归: 原 blind/hitT 从不递减 → 闪光弹永久致盲、白闪与血条永久残留)
  const zb = zombies.find(z => !z.dead);
  if (zb) {
    zb.blind = 2.8; zb.hitT = 0.14;
    t = step(Math.ceil(1.0 / 0.016), t);
    expect(zb.blind < 2.0, 'zombie blind decays over ~1s (blind=' + (zb.blind || 0).toFixed(2) + ')');
    expect(zb.hitT <= 0, 'zombie hitT decays to 0 (hitT=' + (zb.hitT || 0) + ')');
  } else expect(false, 'found a live zombie for blind-decay check');

  // 4. 玩家射击机制可跑: 手持霰弹枪直接命中近处丧尸应掉血/死亡(确保无 NaN 崩溃)
  const z0 = zombies[0];
  const hpBefore = z0.hp;
  G.hitUnit(z0, 40, G.player, { x: G.player.x, y: G.player.y });
  expect(z0.hp < hpBefore || z0.dead, 'zombie takes damage from player');

  // 5. 肃清本波 → 波次结算并刷新补给(弹药/医疗等)
  const waveBefore = G.wave;
  for (const z of G.units.filter(u => u.kind === 'zombie' && !u.dead)) G.killUnit(z, G.player);
  t = step(10, t);
  expect(G.zombieAlive === 0, 'all zombies cleared');
  expect(G.waveClearedCount === waveBefore, 'wave cleared count = ' + G.waveClearedCount);
  expect(G.pickups.length >= 3, 'supply pickups dropped after wave (got ' + G.pickups.length + ')');
  const types = new Set(G.pickups.map(p => p.type));
  // B5·街: 本页不再投放医疗包, 补给改为"弹药为主 + 投掷物"
  expect(types.has('ammo'), 'supplies include ammo (' + [...types].join(',') + ')');
  expect(!types.has('med'), 'no med drops in street mode (' + [...types].join(',') + ')');
  expect(G.score > 0, 'wave clear scores points (' + G.score + ')');

  // 6. 拾取补给生效(把玩家移到补给上; 满血不能吃医疗包 → 优先非医疗, 医疗则先扣血)
  let pk = G.pickups.find(p => !p.taken && p.type !== 'med') || G.pickups.find(p => !p.taken);
  if (pk) {
    if (pk.type === 'med' && G.player.hp >= G.player.maxHp - 1) G.player.hp = Math.max(1, G.player.maxHp - 30);
    G.player.x = pk.x; G.player.y = pk.y;
    t = step(5, t);
    expect(pk.taken === true, 'supply pickup collected by player (' + pk.type + ')');
  } else expect(false, 'found a pickup to collect');

  // 6b. B5·街 弹药经济: 一箱弹药 = 主武器弹夹容量 ×2(30 发弹夹 → 60 发)
  // 注意: window.__game.pickups 是只读 getter, 必须原地改数组(mutate), 不能重新赋值。
  {
    const w = G.player.primary;
    w.reserve = 0;
    G.pickups.length = 0;
    G.pickups.push({ x: G.player.x, y: G.player.y, type: 'ammo', taken: false });
    t = step(3, t);
    expect(w.reserve === w.magSize * 2, 'ammo pickup grants magSize*2 rounds (' + w.magSize + ' -> ' + w.reserve + ')');
  }

  // 7. 快进两波 → 第 3 波清空时弹出强化面板
  const clearUpTo3 = async () => {
    // 等待下一波并清空(最多 3 次循环)
    for (let guard = 0; guard < 4 && G.waveClearedCount < 3; guard++) {
      t = step(Math.ceil(9 / 0.016), t);          // 等下一波
      t = step(10, t);
      for (const z of G.units.filter(u => u.kind === 'zombie' && !u.dead)) G.killUnit(z, G.player);
      t = step(10, t);
    }
  };
  await clearUpTo3();
  expect(G.waveClearedCount === 3, 'three waves cleared (count=' + G.waveClearedCount + ')');
  expect(G.boostOpen === true, 'boost panel opens after every 3rd wave');
  expect(G.currentBoost.length === 3, 'boost offers 3 random options (got ' + G.currentBoost.length + ')');

  // 8. 选择强化 → 面板关闭、本局加成记录、下一波倒计时开始
  const buffsBefore = G.buffLog.length;
  G.chooseBoost(0);
  expect(G.boostOpen === false, 'boost panel closes after pick');
  expect(G.buffLog.length === buffsBefore + 1, 'boost applied & logged (' + G.buffLog.join('/') + ')');
  expect(G.waveTimer > 0, 'countdown to next wave after boost');

  // 9. 下一波仍会到来(无尽波次): 波间整备倒计时可能因平衡调整变长 → 等到下一波真正开始为止
  for (let guard = 0; guard < 12 && G.wave < 4; guard++) t = step(Math.ceil(9 / 0.016), t);
  expect(G.wave >= 4, 'wave 4 arrives after boost (wave=' + G.wave + ')');

  // 9b. B5·街 弹夹容量成长: 第 3 波肃清后至少 +50%(强化面板若抽到「弹夹扩容」会再多一档),
  //     且每箱弹药按新弹夹 ×2 结算。上限同为 baseMagSize×3。
  {
    const w = G.player.primary, base = w.baseMagSize || 30;
    expect(w.magSize >= Math.round(base * 1.5) && w.magSize <= base * 3,
      'mag capacity expanded after 3rd wave (' + base + ' -> ' + w.magSize + ')');
    w.reserve = 0;
    G.pickups.length = 0;   // getter 只读 → 原地改数组
    G.pickups.push({ x: G.player.x, y: G.player.y, type: 'ammo', taken: false });
    t = step(3, t);
    expect(w.reserve === w.magSize * 2, 'ammo pickup scales with expanded mag (' + w.magSize + ' -> ' + w.reserve + ')');
  }

  // 9c. P0-5 守卫: 撕咬融合倍率必须按"当帧真实围攻人数"计算, 且不得超过 BITE_FUSE_MAX(2.5)。
  //     旧实现用"每只僵尸每帧 +1、仅 initGame 清零"的累计值 → 贴脸 1~2 秒后 k>75 → 倍率永久顶格。
  {
    expect(typeof G.countAttackers === 'function' && typeof G.biteDmgScale === 'function',
      '内省钩子 countAttackers / biteDmgScale 已暴露');
    const N = 4, PLAYER = G.player, savedZ = G.units.filter(u => u.kind === 'zombie');
    const savedHp = PLAYER.hp, savedMax = PLAYER.maxHp;
    G.units.length = 0;
    G.units.push(PLAYER);
    PLAYER.hp = PLAYER.maxHp = 1e9;   // 排除治疗/致盲等干扰, 本项只看伤害
    const zs = [];
    const anchors = [{ dx: -10, dy: 0 }, { dx: 10, dy: 0 }, { dx: 0, dy: -10 }, { dx: 0, dy: 10 }];
    for (let i = 0; i < N; i++) { const z = G.makeZombie('normal', PLAYER.x + anchors[i].dx, PLAYER.y + anchors[i].dy); zs.push(z); }
    const perHit = G.biteDmgScale(PLAYER, 40, 1);   // 以"单只基准伤害"为标尺(倍率公式与伤害种类无关)
    expect(perHit > 0 && perHit < 200, 'biteDmgScale 基准单口伤害有限且为正值 (' + perHit.toFixed(2) + ')');
    let hits = 0, maxDmg = 0, maxSeen = 0;
    for (let i = 0; i < 180; i++) {          // 约 2.9 秒
      const before = PLAYER.hp;
      t = step(1, t);
      for (let k = 0; k < N; k++) {          // 钉住围殴位置(否则会被击退/走位拉开)
        const z = zs[k];
        if (!z.dead) { z.x = PLAYER.x + anchors[k].dx; z.y = PLAYER.y + anchors[k].dy; }
      }
      maxSeen = Math.max(maxSeen, G.countAttackers(PLAYER));
      if (PLAYER.hp < before) { hits++; maxDmg = Math.max(maxDmg, before - PLAYER.hp); }
    }
    expect(maxSeen <= N, N + ' 只围攻时 countAttackers 不超过 ' + N + ' (实测峰值 ' + maxSeen + ')');
    expect(hits > 0, '围攻 ' + N + ' 只已造成 ' + hits + ' 次撕咬结算');
    expect(maxDmg <= perHit * 2.5 * 1.15 + 1e-6,
      '单口伤害不超过 基准×2.5×随机上限 (实测 ' + maxDmg.toFixed(1) + ' ≤ ' + (perHit * 2.5 * 1.15).toFixed(1) + ')');
    G.units.length = 0;
    for (const u of savedZ) G.units.push(u);
    if (G.units.indexOf(PLAYER) < 0) G.units.push(PLAYER);
    PLAYER.hp = savedHp; PLAYER.maxHp = savedMax;   // 复原, 不干扰后续判负用例
  }

  // 10. 玩家阵亡 → 判负并结算: 军功点写回同一 breach_game_save, 记录本玩法最佳
  // 注意: 页面有"每局一次战地急救"(首次阵亡原地救回), 因此这里允许最多 2 次致死 —— 第二次必判负。
  const svBefore = JSON.parse(store['breach_game_save'] || '{}');
  const ptsBefore = svBefore.points || 0;
  G.player.dead = true;
  for (let waveNo = 0; waveNo < 2 && G.result === null; waveNo++) {
    for (let i = 0; i < 600 && G.result === null; i++) {
      G.player.dead = true;   // 战地急救会把人救回, 反复致死直到结算
      t = step(1, t);
    }
  }
  t = step(Math.ceil(4 / 0.016), t);
  expect(G.result === 'lose', 'street game ends in lose when player dies (result=' + G.result + ')');
  const sv = JSON.parse(store['breach_game_save'] || '{}');
  expect(typeof sv.streetBest === 'number' && sv.streetBest === G.score, 'streetBest saved (=score ' + sv.streetBest + ')');
  expect(typeof sv.streetWaves === 'number', 'streetWaves saved (' + sv.streetWaves + ')');
  expect((sv.points || 0) > ptsBefore, 'points awarded to shared save (' + ptsBefore + ' -> ' + (sv.points || 0) + ')');
  expect((els['endTitle'] ? els['endTitle'].textContent : '').indexOf('丧尸') >= 0, 'end screen title shown');

  // ==========================================================================
  // B6 新机制回归: 波间工事 / 有名有姓的永久阵亡队友 + 招募 / 撤离窗口
  // 说明: 新一局必须整页重载 —— 上一局的 player.units 等状态已在结算里消费过。
  // ==========================================================================

  // 11. 波间工事(沙袋): 只有整备窗口能搭、按主武器弹夹计价、进入寻路网格、会被啃毁
  {
    resetSandbox();
    if (!load()) process.exit(1);
    const G2 = sandbox.window.__game;
    let t2 = performance.now();
    els['btnStart'].onclick();
    expect(G2.started === true, 'B6 工事: 新一局已开局');
    expect(G2.sandbagUses === 0, 'B6 工事: 未到整备窗口时配额为 0 (got ' + G2.sandbagUses + ')');
    G2.player.hp = G2.player.maxHp;
    // 首波倒计时(wave===0)不算整备窗口 —— 首波前不该能拍墙
    expect(G2.inBuildWindow() === false, 'B6 工事: 首波倒计时内不可搭建');
    expect(G2.buildSandbag() === false, 'B6 工事: 首波前调用被拒绝');
    expect(G2.sandbags.length === 0, 'B6 工事: 被拒绝时没有落成工事');
    // 开一波再清空 → 进入整备窗口(waveInter)
    G2.startWave(1);
    t2 = clearWave(G2, t2);
    expect(G2.waveInter === true && G2.inBuildWindow() === true, 'B6 工事: 清空一波后进入整备窗口');
    expect(G2.sandbagUses === G2.BUILD.supply, 'B6 工事: 整备窗口补满 ' + G2.BUILD.supply + ' 座配额 (got ' + G2.sandbagUses + ')');
    const w2 = G2.player.primary;
    w2.reserve = 300;
    const cost = G2.buildCost();
    expect(cost === w2.magSize, 'B6 工事: 单价 = 主武器弹夹容量 (' + cost + ' / ' + w2.magSize + ')');
    // 在玩家一圈外找一个能落的点(与玩家保持距离, 否则会被"避开活人"规则拒绝)
    let placed = false;
    for (let i = 0; i < 24 && !placed; i++) {
      const a = i / 24 * Math.PI * 2;
      G2.mouseW.x = G2.player.x + Math.cos(a) * 70;
      G2.mouseW.y = G2.player.y + Math.sin(a) * 70;
      if (G2.sandbagSpotFree(G2.mouseW.x, G2.mouseW.y, G2.player)) placed = G2.buildSandbag();
    }
    expect(placed === true, 'B6 工事: 整备窗口内搭建成功 (sandbags=' + G2.sandbags.length + ')');
    expect(G2.sandbagUses === G2.BUILD.supply - 1, 'B6 工事: 搭一座扣一个配额 (剩余 ' + G2.sandbagUses + ')');
    expect(w2.reserve === 300 - cost, 'B6 工事: 消耗主武器弹药 (' + cost + ' → 备弹 ' + w2.reserve + ')');
    const sg = G2.sandbags[0];
    expect(sg && sg.hp === G2.BUILD.hp && sg.kind === 'sandbag', 'B6 工事: 工事带耐久与类型标记');
    // 进入寻路网格: 丧尸会绕开工事, 而不是贴着硬挤
    const gx = clampInt(sg.x / 16, 0, G2.gw - 1), gy = clampInt(sg.y / 16, 0, G2.gh - 1);
    expect(G2.moveGrid[gx + gy * G2.gw] === 0, 'B6 工事: 工事所在网格在重建后变为不可通行');
    // B7 修正: 沙袋只有腰高 —— 挡移动/挡寻路, 但**不挡子弹、不挡视线**(参数可在 BUILD 里翻回)
    expect(G2.BUILD.blocksBullets === false && G2.BUILD.blocksSight === false,
      'B7 工事: 默认不挡子弹/不挡视线 (blocksBullets=' + G2.BUILD.blocksBullets + ', blocksSight=' + G2.BUILD.blocksSight + ')');
    expect(G2.lineBlocked(sg.x - 60, sg.y, sg.x + 60, sg.y) === false, 'B7 工事: 视线/子弹从工事上方越过');
    // 耐久耗尽 → 移除并回到场上清空
    G2.destroySandbag(sg, 'zombie');
    expect(G2.sandbags.length === 0 && G2.moveGrid[gx + gy * G2.gw] === 1, 'B6 工事: 被啃毁后移除且寻路网格恢复通行');

    // B9 工事【朝向】: 旋转步进 / 落成时写入 sandbag.rot / 碰撞与移动判定按有向矩形(OBB)转向
    expect(G2.buildDeg() === 0, 'B9 工事: 待建朝向初值 0°');
    expect(G2.rotateBuild(1) === true && G2.buildDeg() === 15, 'B9 工事: 旋转一步 = 15° (got ' + G2.buildDeg() + '°)');
    expect(G2.rotateBuild(-1) === true && G2.buildDeg() === 0, 'B9 工事: 反向旋转回到 0° (got ' + G2.buildDeg() + '°)');
    // 轴对齐(0°): 长边沿街 → (x±18) 挡住, (y±18) 不挡
    const obbA = { x: 0, y: 0, w: G2.BUILD.r * 1.9, h: G2.BUILD.r * 1.05, r: G2.BUILD.r, rot: 0 };
    expect(!!G2.circleOBB(18, 0, 0, obbA) === true && !!G2.circleOBB(0, 18, 0, obbA) === false,
      'B9 工事: 0° 时碰撞体是"横长条"(长边沿 X)');
    // 旋转 90°: 同一条沙袋转成"竖长条", 同两个探针点的结论必须整体反过来
    const obbB = { x: 0, y: 0, w: G2.BUILD.r * 1.9, h: G2.BUILD.r * 1.05, r: G2.BUILD.r, rot: Math.PI / 2 };
    expect(!!G2.circleOBB(0, 18, 0, obbB) === true && !!G2.circleOBB(18, 0, 0, obbB) === false,
      'B9 工事: 旋转 90° 后碰撞体随之转向(不是轴对齐矩形)');
    // 真·落成路径: 把待建朝向调到 90° 再搭一座, rot 必须跟着写进场上工事
    G2.buildRot = Math.PI / 2;
    let placed2 = false;
    for (let i = 0; i < 24 && !placed2; i++) {
      const a = (i + 0.5) / 24 * Math.PI * 2;
      G2.mouseW.x = G2.player.x + Math.cos(a) * 104;
      G2.mouseW.y = G2.player.y + Math.sin(a) * 104;
      if (G2.sandbagSpotFree(G2.mouseW.x, G2.mouseW.y, G2.player)) placed2 = G2.buildSandbag();
    }
    expect(placed2 === true, 'B9 工事: 旋转 90° 后仍能正常落成');
    const sg2 = G2.sandbags[G2.sandbags.length - 1];
    expect(!!sg2 && Math.abs((sg2.rot || 0) - Math.PI / 2) < 1e-6, 'B9 工事: 落成时朝向写入 sandbag.rot (' + (sg2 && sg2.rot) + ')');
    expect(!!sg2 && !!G2.circleOBB(sg2.x, sg2.y + 18, 0, sg2) === true && !!G2.circleOBB(sg2.x + 18, sg2.y, 0, sg2) === false,
      'B9 工事: 场上工事的旋转朝向参与判定');
    expect(!!sg2 && G2.probeFree({ r: 2 }, sg2.x, sg2.y + 18) === false, 'B9 工事: 移动判定同样按旋转后的形状挡人');
    G2.buildRot = 0;
  }

  // 12. 队友永久阵亡 + 波间招募(军功点/三职业/名字池/缺编空位/招募面板)
  {
    resetSandbox();
    if (!load()) process.exit(1);
    const G2 = sandbox.window.__game;
    let t2 = performance.now();
    // B9: 本段涉及"招募落点随机搜索", 注入固定种子 → 门禁不再看运气(与 wall_test 同一做法)
    let seed = 20261011;
    G2.setRandom(() => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    els['btnStart'].onclick();
    const bots0 = G2.units.filter(u => u.kind === 'robot');
    expect(bots0.length === 2 && bots0.every(b => b.name && b.name !== '幸存者A' && b.name !== undefined),
      'B6 队友: 开局 2 名队友且都有真实名字 (' + bots0.map(b => b.name).join('/') + ')');
    expect(G2.squadNames.length >= 6, 'B6 队友: 名字池至少 6 个 (' + G2.squadNames.length + ')');
    expect(G2.SQUAD.startCount === 2, 'B9 队友: 开局 2 名 (SQUAD.startCount=' + G2.SQUAD.startCount + ')');
    expect(G2.SQUAD.cap === undefined, 'B9 队友: 编制上限已移除 (SQUAD.cap=' + G2.SQUAD.cap + ')');
    // 招募键位/接口就位
    expect(typeof G2.recruitSurvivor === 'function' && typeof G2.recruitCost === 'function', 'B6 招募: 接口与计价函数已暴露');
    expect(G2.recruitSurvivor('sniper') === false, 'B6 招募: 未开整备面板时招募被拒绝');
    // 开一波(否则还停在首波倒计时, waveClearedCount 不会增长)
    G2.startWave(1);
    // B9 指挥点: 击杀丧尸时与得分【等量】入账
    {
      const cmd0 = G2.cmdPoints, sc0 = G2.score;
      const z0 = G2.units.find(u => u.kind === 'zombie' && !u.dead);
      expect(!!z0, 'B9 指挥点: 场上有可击杀的丧尸');
      if (z0) G2.killUnit(z0, G2.player);
      expect(G2.cmdPoints === cmd0 + 15 && G2.score === sc0 + 15,
        'B9 指挥点: 玩家击杀 +15 分 / +15 指挥点 (分 ' + sc0 + '→' + G2.score + ', 指挥 ' + cmd0 + '→' + G2.cmdPoints + ')');
    }
    // 阵亡 → 进"阵亡名单"(名字), 且波次结算不得复活
    const deadName = bots0[0].name;
    G2.killUnit(bots0[0], null);
    t2 = step(3, t2);
    expect(G2.fallen.length === 1 && G2.fallen[0].name === deadName, 'B6 队友: 阵亡名字进入阵亡名单 (' + G2.fallen.map(f => f.name).join('/') + ')');
    expect(bots0[0].dead === true, 'B6 队友: 阵亡后 dead=true');
    t2 = clearWave(G2, t2);
    expect(G2.waveClearedCount === 1, 'B6 队友: 第 1 波已肃清 (count=' + G2.waveClearedCount + ')');
    expect(bots0[0].dead === true, 'B6 队友: 波次结算后仍为阵亡(不再"补满弹药归队")');
    expect(G2.units.filter(u => u.kind === 'robot' && !u.dead).length === 1, 'B6 队友: 存活队友只剩 1 名(缺编 1 人)');
    // 波间工事: 清完一波立刻就是整备窗口
    expect(G2.inBuildWindow() === true && G2.waveInter === true, 'B6 招募: 波次肃清后进入整备窗口');
    // 推进到第 3 波肃清(boss/强化面板同帧打开) → 招募面板应同时就位
    while (G2.wave < 3) { t2 = step(Math.ceil(9.5 / 0.016), t2); t2 = clearWave(G2, t2); }
    expect(G2.boostOpen === true, 'B6 招募: 第 3 波肃清后整备面板打开');
    expect(G2.player.dead === false, 'B6 招募: 测试期间玩家存活 (hp=' + Math.round(G2.player.hp) + ')');
    // 招募面板确实被渲染(页面向 #recruitRow appendChild 了表头/职业按钮)
    const recRow = els['recruitRow'];
    expect(!!recRow && recRow.children.length > 0, 'B6 招募: 招募面板已渲染到 #recruitRow (' + (recRow ? recRow.children.length : 0) + ' 块)');
    expect(!!recRow && String(recRow.children[0].innerHTML).indexOf('招募') >= 0, 'B6 招募: 面板表头写明"小队整备·招募"与价格');
    expect(G2.recruitCost() === G2.SQUAD.costBase, 'B6 招募: 首个招募价 = ' + G2.SQUAD.costBase + ' (got ' + G2.recruitCost() + ')');
    // B9: 招募只花【指挥点】, 得分只进不出(最佳得分与招募彻底解耦)
    G2.cmdPoints = 900;
    const scoreBefore = G2.score, cmdBefore = G2.cmdPoints;
    const botsBefore = G2.units.filter(u => u.kind === 'robot' && !u.dead).length;
    const botDmgBefore = G2.units.filter(u => u.kind === 'robot')[0].weapon.dmg;
    expect(G2.recruitSurvivor('sniper') === true, 'B6 招募: 整备面板打开时狙击手入队');
    expect(G2.score === scoreBefore, 'B9 招募: 得分不再被招募消耗 (' + scoreBefore + ' → ' + G2.score + ')');
    expect(G2.cmdPoints === cmdBefore - G2.SQUAD.costBase, 'B9 招募: 扣指挥点 ' + cmdBefore + ' → ' + G2.cmdPoints);
    expect(G2.squadHired === 1, 'B6 招募: 已招募计数 +1 (' + G2.squadHired + ')');
    expect(G2.recruitCost() === G2.SQUAD.costBase + G2.SQUAD.costStep, 'B6 招募: 第二个招募价上涨到 ' + G2.recruitCost());
    const botsNow = G2.units.filter(u => u.kind === 'robot' && !u.dead);
    expect(botsNow.length === botsBefore + 1, 'B6 招募: 新队友入队 (' + botsBefore + ' → ' + botsNow.length + ')');
    const sniper = botsNow.find(u => u.cls === 'sniper');
    expect(!!sniper && sniper.name && sniper.name !== deadName, 'B6 招募: 新队友有自己的名字 (' + (sniper && sniper.name) + ')');
    expect(!!sniper && sniper.weapon.dmg > botDmgBefore, 'B6 招募: 狙击手伤害高于步枪兵 (' + botDmgBefore + ' → ' + (sniper && sniper.weapon.dmg) + ')');
    expect(!!sniper && sniper.weapon.spread < G2.W_BOT_SPREAD, 'B6 招募: 狙击手弹道更收敛 (' + (sniper && sniper.weapon.spread) + ' < ' + G2.W_BOT_SPREAD + ')');
    // B9: 编制无上限 —— 连招两人(总在编 4 人 > 旧上限 2), 涨价照旧
    expect(G2.recruitSurvivor('engineer') === true, 'B9 招募: 第 2 次招募成功(不再有"满编"拒绝)');
    expect(G2.recruitSurvivor('medic') === true, 'B9 招募: 第 3 次招募成功(在编 4 人, 已超旧上限 2)');
    expect(G2.recruitCost() === G2.SQUAD.costBase + G2.SQUAD.costStep * 3, 'B9 招募: 价格上涨仍是唯一闸门 (' + G2.recruitCost() + ')');
    const botsFull = G2.units.filter(u => u.kind === 'robot' && !u.dead);
    expect(botsFull.length === botsBefore + 3, 'B9 招募: 队伍规模可以超过旧上限 (' + botsFull.length + ' 人在编)');
    expect(typeof G2.squadSpawnPos === 'function' && !!G2.squadSpawnPos(G2.player),
      'B9 招募: 队友挤在玩家周围时仍能算出落点(自家机器人不算障碍)');
    // B9: 指挥点不足 → 拒绝(而且不扣分、不加人)
    G2.cmdPoints = 0;
    expect(G2.recruitSurvivor('medic') === false, 'B9 招募: 指挥点不足时拒绝招募');
    expect(G2.units.filter(u => u.kind === 'robot' && !u.dead).length === botsFull.length, 'B9 招募: 被拒绝时不加人');
    const bEl = els['buildInfo'], sqEl = els['squadInfo'], eEl = els['evacInfo'], cEl = els['cmdInfo'];
    expect(!!bEl && !!sqEl && !!eEl, 'B6 HUD: 新增读数元素齐备 (buildInfo=' + !!bEl + ' squadInfo=' + !!sqEl + ' evacInfo=' + !!eEl + ')');
    expect(!!cEl, 'B9 HUD: 指挥点读数元素存在 (#cmdInfo)');
    expect(String(cEl ? cEl.textContent : '').indexOf('0') >= 0, 'B9 HUD: 指挥点读数已填充 ("' + (cEl ? cEl.textContent : '') + '")');
    expect(typeof bEl.textContent === 'string' && bEl.textContent.length > 0, 'B6 HUD: 工事读数已填充 ("' + bEl.textContent + '")');
    expect(String(bEl.textContent).indexOf('朝向') >= 0, 'B9 HUD: 工事读数带朝向 ("' + bEl.textContent + '")');
    expect(String(eEl.textContent).indexOf('波后开启') >= 0, 'B6 HUD: 撤离读数给出下一个撤离波次 ("' + eEl.textContent + '")');
    expect(String(sqEl.textContent).indexOf('空缺') >= 0 || String(sqEl.textContent).indexOf('｜') >= 0, 'B6 HUD: 小队读数列出名字/状态 ("' + sqEl.textContent + '")');
    // 阵亡名单进结算界面(直接调 showEnd 的渲染部分不可行, 这里验证 endFallen 由结算函数填充)
    expect(G2.fallen.length === 1, 'B6 结算: 阵亡名单待写入 (' + G2.fallen.map(f => f.name + '·' + f.cls).join('/') + ')');
  }

  // 13. 撤离窗口: 每 5 波开启 / 限时倒计时 / 守车计时 / 离圈清零 / 超时失败继续下一波 / 成功则主动通关
  {
    resetSandbox();
    if (!load()) process.exit(1);
    const G2 = sandbox.window.__game;
    let t2 = performance.now();
    els['btnStart'].onclick();
    expect(G2.evac.open === false, 'B6 撤离: 开局撤离窗口关闭');
    for (const z of G2.units.filter(u => u.kind === 'zombie' && !u.dead)) G2.killUnit(z, G2.player);
    t2 = step(10, t2);
    G2.player.hp = G2.player.maxHp;
    G2.startWave(5);
    t2 = clearWave(G2, t2);
    expect(G2.evac.open === true, 'B6 撤离: 第 5 波(尸王波)肃清后开启撤离窗口');
    expect(G2.evac.car && typeof G2.evac.car.pad.x === 'number', 'B6 撤离: 撤离车已生成 (' + (G2.evac.car ? Math.round(G2.evac.car.x) + ',' + Math.round(G2.evac.car.y) : '-') + ')');
    expect(G2.evac.side === 1 || G2.evac.side === -1, 'B6 撤离: 车停在长街的一端 (side=' + G2.evac.side + ')');
    expect(G2.evac.clearedWave === 5, 'B6 撤离: 记录开启窗口的波次 (' + G2.evac.clearedWave + ')');
    expect(G2.evac.t <= G2.EVAC.window && G2.evac.t > 0, 'B6 撤离: 倒计时从 ' + G2.EVAC.window + 's 起算 (' + G2.evac.t.toFixed(2) + 's)');
    expect(G2.EVAC.hold === 5 && G2.EVAC.bonus === 5, 'B6 撤离: 守车 ' + G2.EVAC.hold + 's / 奖励 +' + G2.EVAC.bonus + ' 军功点');
    expect(G2.wave === 6 && G2.zombieAlive > 0, 'B6 撤离: 窗口开启即刷下一波(' + G2.wave + ' 波 / ' + G2.zombieAlive + ' 只)');
    t2 = step(60, t2);
    expect(G2.zombieAlive > 0, 'B6 撤离: 撤离期间尸潮持续存在 (' + G2.zombieAlive + ' 只 | wave=' + G2.wave + ' dead=' + G2.player.dead + ' hp=' + Math.round(G2.player.hp) + ')');
    // 站到车旁 → 守车计时推进
    G2.player.dead = false; G2.player.hp = G2.player.maxHp;
    G2.player.x = G2.evac.car.pad.x; G2.player.y = G2.evac.car.pad.y;
    const holdBefore = G2.evac.hold;
    t2 = step(30, t2);
    expect(G2.evac.hold > holdBefore, 'B6 撤离: 站在车旁守车计时推进 (' + G2.evac.hold.toFixed(2) + 's)');
    // 离开车旁 → 宽限耗尽后进度清零(不能一直在圈外磨)
    G2.player.x = 40; G2.player.y = 60;
    t2 = step(Math.ceil((G2.EVAC.grace + 0.4) / 0.016), t2);
    expect(G2.evac.hold === 0, 'B6 撤离: 离开车旁且宽限耗尽后进度清零');
    // 超时 → 窗口关闭 + 立刻进入下一波(不判负)
    G2.evacT = 0.2;
    G2.player.dead = false;
    t2 = step(20, t2);
    expect(G2.evac.open === false, 'B6 撤离: 超时后窗口关闭');
    expect(G2.wave === 7, 'B6 撤离: 超时后直接进入下一波 (wave=' + G2.wave + ')');
    expect(G2.result === null, 'B6 撤离: 超时不算失败结算 (result=' + G2.result + ')');
    // 成功: 再开一次窗口 → 站满 EVAC.hold 秒 → 主动通关 + 额外军功点
    for (const k in store) if (k.indexOf('breach_game_save') === 0) delete store[k];
    G2.openEvac(5);
    G2.waveClearedCount = 5;
    G2.player.dead = false; G2.player.hp = G2.player.maxHp;
    G2.player.x = G2.evac.car.pad.x; G2.player.y = G2.evac.car.pad.y;
    t2 = step(Math.ceil((G2.EVAC.hold + 0.6) / 0.016), t2);
    expect(G2.evac.done === true, 'B6 撤离: 守满 ' + G2.EVAC.hold + 's 后判定撤离成功');
    G2.player.maxHp = 1e9; G2.player.hp = 1e9;   // 本段只验证结算路径, 排除被咬死的干扰
    for (let i = 0; i < 400 && G2.result === null; i++) { G2.player.x = 720; G2.player.y = 300; t2 = step(1, t2); }
    t2 = step(Math.ceil(3 / 0.016), t2);
    expect(G2.result === 'win', 'B6 撤离: 撤离成功 → 主动通关结算 (result=' + G2.result + ')');
    const sv2 = JSON.parse(store['breach_game_save'] || '{}');
    const expectPts = 1 + Math.min(G2.waveClearedCount, 15) + G2.EVAC.bonus;
    expect(sv2.points === expectPts, 'B6 撤离: 结算军功点 = 1+min(肃清波数=' + G2.waveClearedCount + ',15) + 撤离奖励 ' + G2.EVAC.bonus + ' = ' + expectPts + ' (got ' + sv2.points + ')');
    expect((els['endTitle'] ? els['endTitle'].textContent : '').indexOf('撤离成功') >= 0, 'B6 撤离: 结算文案标明"撤离成功"');
    expect((els['endSub'] ? els['endSub'].textContent : '').indexOf('撤离奖励') >= 0, 'B6 撤离: 结算文案写明撤离奖励');
    // 结算界面「阵亡名单」: 元素存在且本局无阵亡时给出明确文案
    const fel = els['endFallen'];
    expect(!!fel && String(fel.innerHTML).indexOf('阵亡名单') >= 0, 'B6 结算: 阵亡名单已渲染到 #endFallen');
    expect(String(fel.innerHTML).indexOf('无队友阵亡') >= 0, 'B6 结算: 本局无阵亡时名单给出明确说明');
    expect(String(els['endStats'].innerHTML).indexOf('撤离奖励') >= 0, 'B6 结算: 统计格里列出撤离奖励');
  }

  // 12. B7 尸潮寻路: 目标/起点格吸附 · 个人分流 · 局部绕行 · 重寻路错峰 · 行为回归
  {
    resetSandbox();
    if (!load()) process.exit(1);
    const G3 = sandbox.window.__game;
    let t3 = performance.now();
    els['btnStart'].onclick();
    expect(G3.started === true, 'B7 寻路: 新一局已开局');
    expect(G3.CROWD && G3.CROWD.fanR > 0, 'B7 寻路: CROWD 参数块已暴露');

    // 12.1 目标格吸附 —— 玩家贴着路边载具站时(碰撞半径 11 < 网格 pad 13), 其所在格不可走;
    //      旧实现在这里 findPath 直接返回 null, 全体丧尸退化成直线冲墙(贴墙磨的根因)
    const car = G3.covers.find(c => c.kind === 'car') || G3.covers[0];
    expect(!!car, 'B7 吸附: 找到一辆路边载具当"贴脸目标"');
    const hugX = car.x + car.w / 2, hugY = car.y + car.h / 2;
    const hcx = clampInt(hugX / 16, 0, G3.gw - 1), hcy = clampInt(hugY / 16, 0, G3.gh - 1);
    expect(G3.moveGrid[hcx + hcy * G3.gw] === 0, 'B7 吸附: 载具所在格不可走(正是旧实现的失败条件)');
    const snapped = G3.snapWalkable(hugX, hugY, G3.player.x, G3.player.y);
    expect(snapped >= 0 && G3.moveGrid[snapped] === 1, 'B7 吸附: 不可走坐标能吸附到可走格');
    const px0 = G3.player.x, py0 = G3.player.y;
    const pa = G3.findPath(px0, py0, hugX, hugY);
    expect(!!pa && pa.length > 0, 'B7 吸附: 目标贴在载具上时仍能算出路径 (旧实现返回 null)');
    const pb = G3.findPath(hugX, hugY, px0, py0);
    expect(!!pb && pb.length > 0, 'B7 吸附: 起点不可走(被挤进贴墙格)时同样能算出路径');
    expect(G3.findPath(px0, py0, px0, py0) === null, 'B7 吸附: 起终点同格仍直接返回 null(直行兜底)');

    // 12.2 分流: 个人站位角不同 → 远处接近点分散在目标周围, 贴脸时收敛到本人
    const tgt = G3.player;
    const FAR = 320;
    const zs = [];
    for (let i = 0; i < 6; i++) {
      const z = G3.makeZombie('normal', tgt.x + FAR, tgt.y);
      z.zFlankA = i / 6 * Math.PI * 2; z.zFlankT = 99; z.zStepT = 99; z.zStepHold = null;
      zs.push(z);
    }
    const goals = zs.map(z => G3.zombieGoal(z, tgt, FAR, 0.016));
    const offs = goals.map(g => Math.hypot(g.x - tgt.x, g.y - tgt.y));
    expect(offs.every(o => Math.abs(o - G3.CROWD.fanR) < 0.5), 'B7 分流: 远距离接近点落在 ' + G3.CROWD.fanR + 'px 站位圈上 (' + offs.map(o => o.toFixed(1)).join('/') + ')');
    const uniq = new Set(goals.map(g => Math.round(g.x / 4) + ',' + Math.round(g.y / 4)));
    expect(uniq.size >= 5, 'B7 分流: 6 只丧尸的接近点互不相同 (' + uniq.size + ' 个)');
    const ramp = G3.zombieGoal(zs[0], tgt, G3.CROWD.fanMin + 20, 0.016);
    expect(Math.hypot(ramp.x - tgt.x, ramp.y - tgt.y) < G3.CROWD.fanR * 0.25, 'B7 分流: 偏移量随距离渐入(过渡带内只剩 ' + Math.hypot(ramp.x - tgt.x, ramp.y - tgt.y).toFixed(1) + 'px)');
    const nearG = G3.zombieGoal(zs[0], tgt, G3.CROWD.fanMin - 1, 0.016);
    expect(Math.abs(nearG.x - tgt.x) < 1e-6 && Math.abs(nearG.y - tgt.y) < 1e-6, 'B7 分流: 贴脸距离直奔本人(不偏移, 保证咬得到)');

    // 12.3 局部绕行: 正前方堆着同伴 → 目标甩到侧面; 空旷处不触发(避免无谓抖动)
    const zHead = zs[0];
    zHead.x = 420; zHead.y = 300; zHead.zStepT = 99; zHead.zStepHold = null; zHead.zSide = 1;
    const tgt2 = { x: 720, y: 300 };
    for (let i = 1; i < zs.length; i++) { zs[i].x = 452 + i * 5; zs[i].y = 300; }   // 正前方一堵"尸墙"
    const side = G3.zombieSideStep(zHead, tgt2.x, tgt2.y);
    expect(!!side, 'B7 绕行: 前方拥堵时触发切线绕行');
    if (side) expect(Math.abs(side.y - zHead.y) > 8, 'B7 绕行: 绕行点确实偏向一侧 (y 偏移 ' + Math.abs(side.y - zHead.y).toFixed(1) + 'px)');
    for (let i = 1; i < zs.length; i++) { zs[i].x = 1000 + i * 40; zs[i].y = 560; }  // 挪去远处
    zHead.zStepHold = null;
    expect(G3.zombieSideStep(zHead, tgt2.x, tgt2.y) === null, 'B7 绕行: 前方无人时不触发');

    // 12.4 错峰重寻路: 冷却逐只固定错开且落在 0.22~0.36s, 避免同帧上百次 BFS 的帧尖峰
    const cds = zs.map(z => z.ai.pathCd);
    expect(cds.every(c => c >= 0.22 && c <= 0.36), 'B7 错峰: 重寻路冷却在 0.22~0.36s (' + cds.map(c => c.toFixed(2)).join('/') + ')');
    expect(new Set(cds.map(c => c.toFixed(3))).size >= 3, 'B7 错峰: 各只冷却互不相同(' + new Set(cds.map(c => c.toFixed(3))).size + ' 种)');

    // 12.5 行为回归: 新逻辑下丧尸仍会逼近并咬到玩家(分流/绕行没把 AI 改成"绕圈不打人")
    for (const z of G3.units.filter(u => u.kind === 'zombie' && !u.dead)) G3.killUnit(z, G3.player);
    for (const b of G3.units.filter(u => u.kind === 'robot' && !u.dead)) G3.killUnit(b, null);   // 队友挪出场, 只留玩家当目标
    G3.player.x = 720; G3.player.y = 300;
    G3.player.maxHp = 1e6; G3.player.hp = 1e6;   // 本段只看"靠不靠得近", 排除被咬死的干扰
    const solo = G3.makeZombie('normal', 420, 300);
    solo.zFlankA = Math.PI; solo.zFlankT = 99; solo.zStepT = 99; solo.zStepHold = null;
    const d0 = Math.hypot(solo.x - G3.player.x, solo.y - G3.player.y);
    t3 = step(180, t3);   // ≈2.9s
    const d1 = Math.hypot(solo.x - G3.player.x, solo.y - G3.player.y);
    expect(isFinite(solo.x) && isFinite(solo.y), 'B7 行为: 坐标有限(无 NaN)');
    expect(d1 < d0 - 120, 'B7 行为: 丧尸确实逼近玩家 (' + d0.toFixed(0) + ' → ' + d1.toFixed(0) + ')');
    expect(d1 <= G3.CROWD.fanMin, 'B7 行为: 最终进入贴脸距离(≤ fanMin ' + G3.CROWD.fanMin + ')');

    // 12.6 大体积单位跟点校验: 手工造一条"第一个路点落在载具里"的路径
    //      —— 尸王(r=26)/胖子(r=16)必须跳过它, 普通丧尸(r=12)照走(网格本来就是按它判定的)
    const inCar = { x: car.x + car.w / 2, y: car.y + car.h / 2 };
    const king = G3.makeZombie('king', car.x - 60, car.y + car.h / 2);
    expect(king.r > 15, 'B7 大体积: 尸王半径 ' + king.r + ' > 15 (需要用真实半径校验路点)');
    expect(G3.probeFree(king, inCar.x, inCar.y) === false, 'B7 大体积: 载具中心对尸王(半径 26)不可通行');
    let past = null;   // 载具另一侧必须挑一个尸王真的站得下的位置(路边车位是连续的, 固定偏移会落在下一辆车里)
    for (let dx = 60; dx <= 340 && !past; dx += 20) {
      const cand = { x: car.x + car.w + dx, y: car.y + car.h / 2 };
      if (G3.probeFree(king, cand.x, cand.y)) past = cand;
    }
    expect(!!past, 'B7 大体积: 在载具另一侧找到尸王站得下的落点');
    if (past) {
      king.ai.path = [inCar, past]; king.ai.pathI = 0; king.ai.pathT = G3.now() + 99;
      G3.aiMoveTo(king, past.x, past.y, 0.016);
      expect(king.ai.pathI === 1, 'B7 大体积: 尸王跳过"落在载具里"的路点 (pathI=' + king.ai.pathI + ')');
      const small = G3.makeZombie('normal', car.x - 60, car.y + car.h / 2 + 40);
      small.ai.path = [inCar, past]; small.ai.pathI = 0; small.ai.pathT = G3.now() + 99;
      G3.aiMoveTo(small, past.x, past.y, 0.016);
      expect(small.ai.pathI === 0, 'B7 大体积: 普通丧尸不跳过该路点 (pathI=' + small.ai.pathI + ', 网格口径本来就是按它定的)');
      G3.killUnit(small, null);
    }
    G3.killUnit(king, null);
  }

  // 13. 卡死回归: 玩家不能被"顶死" —— 尸群贴身 / 载具夹缝 / 自建工事 三种情况都还能动
  {
    resetSandbox();
    if (!load()) process.exit(1);
    const G4 = sandbox.window.__game;
    let t4 = performance.now();
    els['btnStart'].onclick();
    const P = G4.player;
    P.maxHp = P.hp = 1e6;                       // 本段只看"能不能动", 排除被咬死的干扰
    const key = (k, down) => {
      const ev = { key: k, repeat: false, preventDefault() { } };
      for (const fn of (listeners['doc:' + (down ? 'keydown' : 'keyup')] || [])) fn(ev);
    };
    const clearZ = () => { for (const z of G4.units.filter(u => u.kind === 'zombie' && !u.dead)) G4.killUnit(z, G4.player); };

    // 13.1 被 8 只贴身围住(半径 30px, 全在撕咬距离内) → 按住 D 两秒仍要能横向脱身。
    //      旧实现: 玩家与丧尸各让一半位移 → 尸群把玩家顶在障碍上, 输入逐帧被抵消(实测 90 秒里卡 5 次, 最长 16.5 秒)
    clearZ();
    P.x = 720; P.y = 300;
    t4 = step(10, t4);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const z = G4.makeZombie('normal', P.x + Math.cos(a) * 30, P.y + Math.sin(a) * 30);
      z.blind = 0;
    }
    const px0 = P.x;
    key('d', true); t4 = step(120, t4); key('d', false);
    expect(P.x - px0 > 120, '卡死: 被 8 只贴身围住仍能横向脱身 (' + (P.x - px0).toFixed(0) + 'px / 2s)');

    // 13.2 载具夹缝: 玩家半径 11 能挤进比寻路网格(pad 13)更窄的车缝, 进去以后必须还能蹭出来。
    //      旧实现: 脱困探针按 18px 半径预筛方向, 窄缝里"所有方向都判堵" → 2 秒位移 0px
    clearZ();
    P.x = 479; P.y = 210;                       // 实测的两排路边车之间的窄缝
    t4 = step(10, t4);
    const sx0 = P.x;
    key('d', true); t4 = step(120, t4); key('d', false);
    expect(P.x - sx0 > 100, '卡死: 从载具夹缝里能蹭出来 (' + (P.x - sx0).toFixed(0) + 'px / 2s)');

    // 13.3 工事不能把玩家封死: 先进整备窗口(工事只能在波间搭)
    G4.startWave(1);
    t4 = step(10, t4);
    clearZ();
    t4 = step(30, t4);
    expect(G4.inBuildWindow() === true, '卡死: 清空一波后进入整备窗口(工事前置条件)');
    const car = G4.covers.filter(c => c.w >= 36 && c.h >= 30).sort((a, b) => Math.abs(a.y - 300) - Math.abs(b.y - 300))[0];
    expect(!!car, '卡死: 找到一辆路边载具用于封死测试');
    if (car) {
      P.x = car.x - 26; P.y = car.y + car.h / 2;      // 车尾与街边之间的死角
      for (const b of G4.units.filter(u => u.kind === 'robot' && !u.dead)) { b.x = 1600; b.y = 520; }   // 队友让开
      const mkBag = (x, y) => ({
        x, y, r: G4.BUILD.r, kind: 'sandbag', w: G4.BUILD.r * 1.9, h: G4.BUILD.r * 1.05,
        hp: G4.BUILD.hp, maxHp: G4.BUILD.hp, hitT: 0, born: 0, seed: 0
      });
      G4.sandbags.length = 0; G4.buildMoveGrid();
      const openCells = G4.playerPocketCells(400);
      G4.sandbags.push(mkBag(P.x, P.y - 34), mkBag(P.x, P.y + 34)); G4.buildMoveGrid();
      const sealedCells = G4.playerPocketCells(400);
      expect(openCells === 400, '卡死: 未围之前玩家可达格数 ≥ 400 (实测 ' + openCells + ')');
      expect(sealedCells < 300, '卡死: 载具 + 上下两座沙袋确实围成口袋 (可达格数 ' + sealedCells + ' < 300)');
      G4.sandbags.length = 0; G4.buildMoveGrid();
      // 判定规则本身: 街心搭工事不该影响玩家(不能误报)
      P.x = 1200; P.y = 500;
      expect(G4.playerPocketCells(400) === 400 && G4.sandbagWouldSealPlayer(1250, 500) === false,
        '卡死: 街心位置搭工事不影响玩家(判定为 false)');
      // 回到车尾死角: 这里只要摆上一座就会把玩家关进窄缝 → 必须判 true
      P.x = car.x - 26; P.y = car.y + car.h / 2;
      G4.sandbags.length = 0; G4.buildMoveGrid();
      expect(G4.sandbagWouldSealPlayer(P.x, P.y - 34) === true, '卡死: 死角里第一座就判"会封死"(true)');
      G4.sandbags.push(mkBag(P.x, P.y - 34)); G4.buildMoveGrid();   // 上方那座已经摆好
      expect(G4.sandbagWouldSealPlayer(P.x, P.y + 34) === true, '卡死: 再摆第二座同样判 true');
      expect(G4.sandbagWouldSealPlayer(1250, 500) === true, '卡死: 玩家已在死角时, 远处搭工事同样被拒');
      // 正规路径: 玩家已在死角时搭工事 → 拒绝, 且弹药/配额/沙袋数都不动
      G4.mouseW = { x: 1200, y: 500 };
      const ammo0 = G4.player.primary.reserve, uses0 = G4.sandbagUses, bags0 = G4.sandbags.length;
      const built = G4.buildSandbag();
      expect(built === false, '卡死: 玩家已在死角里时工事被拒绝');
      expect(G4.player.primary.reserve === ammo0 && G4.sandbagUses === uses0 && G4.sandbags.length === bags0,
        '卡死: 被拒后弹药/配额/沙袋数都不变 (' + bags0 + ' 座 / 配额 ' + uses0 + ' / 备弹 ' + ammo0 + ')');
    }
  }

  if (ok) { console.log('STREET TEST PASSED'); process.exit(0); }
  else { console.log('STREET TEST FAILED'); process.exit(1); }
})().catch(e => { console.log('ERR ' + e.stack); process.exit(1); });
