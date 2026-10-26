// 账户与本地加密存储(v3.2)回归测试:
//   ① 没建账户 = 旧行为(明文键/无锁)  ② 建账户把旧明文进度加密搬入  ③ 进度与设置都以信封落盘
//   ④ 口令进入(错口令拒绝)  ⑤ 多账户隔离  ⑥ 游客模式每次重置  ⑦ 游戏页未解锁就拦住
//   ⑧ 改口令/删除账户  ⑨ 四页模块副本逐字节一致  ⑩ 会话指纹失效
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = path.join(__dirname, '..');
function readHtml(name) {
  const h = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { raw: h, script: h.match(/<script>([\s\S]*?)<\/script>/)[1] };
}
function mkStore() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i],
    get length() { return Object.keys(m).length; },
    _raw: m,
  };
}
function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() { } }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => { }; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
// 这个桩比别的测试更"像 DOM": createElement 出来的元素一旦被赋 id 就登记进 els,
// 于是账户界面(模块自建 DOM)可以被测试真的点起来。
function makeSandbox(store, sess) {
  const els = {};
  let raf = null;
  const listeners = {};
  function makeEl() {
    const e = {
      style: {},
      classList: {
        _s: {},
        add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
        toggle(c, v) { const on = (v === undefined) ? !this._s[c] : !!v; if (on) this._s[c] = 1; else delete this._s[c]; return on; },
        contains(c) { return !!this._s[c]; },
      },
      children: [], firstChild: null,
      addEventListener() { }, removeEventListener() { },
      appendChild(c) { e.children.push(c); e.firstChild = e.children[0]; return c; },
      removeChild(c) { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); e.firstChild = e.children[0] || null; return c; },
      setAttribute() { }, getAttribute: () => null,
      getContext: () => makeCtx(), width: 0, height: 0,
      className: '', textContent: '', innerHTML: '', value: '', checked: false, type: '',
      href: '', download: '', title: '', autocomplete: '', disabled: false, onclick: null,
    };
    Object.defineProperty(e, 'id', { get() { return e._id; }, set(v) { e._id = v; if (v) els[v] = e; } });
    return e;
  }
  const sb = {
    console, performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
    window: { innerWidth: 1280, innerHeight: 800, addEventListener: (ev, fn) => { (listeners['window:' + ev] = listeners['window:' + ev] || []).push(fn); }, AudioContext: undefined, webkitAudioContext: undefined },
    document: {
      getElementById: (id) => els[id] || (els[id] = makeEl()),
      createElement: () => makeEl(),
      addEventListener: (ev, fn) => { (listeners['doc:' + ev] = listeners['doc:' + ev] || []).push(fn); },
      body: { appendChild() { }, removeChild() { } },
    },
    localStorage: store,
    sessionStorage: sess,
    location: { href: '' },
    confirm: () => true,
    setTimeout, clearTimeout,
  };
  sb.globalThis = sb; sb.window.window = sb.window;
  sb._els = els; sb._raf = () => raf; sb._listeners = listeners;
  return sb;
}
function load(page, store, sess) {
  const sb = makeSandbox(store, sess);
  vm.runInNewContext(readHtml(page).script, sb);
  return sb;
}
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('ok: ' + m); } else { fail++; console.log('FAIL: ' + m); } }
const isEnv = (s) => { try { const o = JSON.parse(s); return !!(o && o.enc === 'acct-store-v1'); } catch (e) { return false; } };
const has = (store, k) => Object.prototype.hasOwnProperty.call(store._raw, k);

// ---------- ① 没建账户: 与旧版完全一样 ----------
console.log('--- ① 无账户(向后兼容) ---');
let store = mkStore(), sess = mkStore();
let sb = load('game/hub.html', store, sess);
let G = sb.window.__game;
ok(G.acctLocked() === false && G.acctMode() === 'legacy', '① 没建账户: 不锁, 模式 legacy');
ok(G.acctAll().length === 0, '① 账户清单为空');
G.applyBackup({ app: 'breach-door-cqb', cfg: { map: 'house' }, save: { version: 2, points: 77 } });
ok(has(store, 'breach_game_save') && !isEnv(store._raw['breach_game_save']), '① 进度仍写进旧明文键(老档/老测试不受影响)');
ok(store._raw['breach_game_save'].indexOf('77') > 0, '① 明文键里能读到点数(此时确实没有加密)');
const plainSave = store._raw['breach_game_save'];
const plainCfg = store._raw['breach_game_cfg'];
sb._els['chkCb'] && sb._els['chkCb'];

// ---------- ② 经界面建账户: 旧明文进度被加密搬入 ----------
console.log('--- ② 经账户界面建账户 ---');
G.acctOpenUI(true);
ok(!!sb._els['acctOverlay'] && !!sb._els['acctNew'], '② 账户界面已建立(有"创建账户"入口)');
sb._els['acctNew'].onclick();                     // 切到新建视图
ok(G.acctUI.view === 'new' && !!sb._els['acctCreate'], '② 切到"新建账户"视图');
sb._els['acctNewUser'].value = '老王';
sb._els['acctNewPw'].value = 'pw-1234';
sb._els['acctNewPw2'].value = 'pw-1234';
sb._els['acctCreate'].onclick();
const acct1 = G.acctAll()[0];
ok(G.acctAll().length === 1 && !!acct1 && acct1.user === '老王', '② 账户已建立 (' + (acct1 && acct1.user) + ')');
ok(G.acctMode() === 'account' && G.acctLocked() === false, '② 建完即已解锁');
ok(G.sessGet() && G.sessGet().id === acct1.id, '② 已产生本次会话');
const A1 = 'breach_game_acct_' + acct1.id + '_';
ok(has(store, A1 + 'save') && isEnv(store._raw[A1 + 'save']), '② 旧存档被加密搬进账户命名空间');
ok(!has(store, 'breach_game_save') && !has(store, 'breach_game_cfg'), '② 旧明文键已删除(不再摊在 localStorage 里)');
ok(G.vaultRead('breach_game_save') === plainSave && G.vaultRead('breach_game_cfg') === plainCfg, '② 迁移后读回与原明文完全一致');
const listRaw = store._raw[G.ACCT.key];
ok(listRaw.indexOf('pw-1234') < 0 && listRaw.indexOf('"points"') < 0, '② 账户清单里不含口令、不含进度');
ok(listRaw.indexOf('"salt"') > 0 && listRaw.indexOf('"ver"') > 0, '② 账户清单含盐与口令校验值');

// ---------- ③ 进度与设置都以信封落盘 ----------
console.log('--- ③ 加密落盘 ---');
G.applyBackup({ app: 'breach-door-cqb', save: { version: 2, points: 424242 } });
G.vaultWrite('breach_game_set', JSON.stringify({ vol: 33, keys: { frag: 'z' } }));
ok(isEnv(store._raw[A1 + 'save']) && isEnv(store._raw[A1 + 'set']), '③ 存档与设置都是信封');
ok(store._raw[A1 + 'save'].indexOf('424242') < 0 && store._raw[A1 + 'set'].indexOf('"vol"') < 0, '③ 信封里看不到明文(点数/字段名都看不到)');
ok(JSON.stringify(store._raw).indexOf('"points"') < 0, '③ 整个 localStorage 里搜不到 progress 字段名');
ok(G.vaultRead('breach_game_save').indexOf('424242') > 0, '③ 解锁状态下读回正确');
ok(store._raw['breach_game_slot'] === undefined || !isEnv(store._raw['breach_game_slot']), '③ 槽位号仍是全局明文键');

// ---------- ④ 口令进入: 错口令拒绝, 对口令解锁 ----------
console.log('--- ④ 口令进入 ---');
G.sessClear();
ok(G.acctLocked() === true && G.acctMode() === 'locked', '④ 关掉会话后处于锁定');
ok(G.vaultRead('breach_game_save') === null, '④ 锁定时读不到账户进度(不返回密文)');
ok(G.acctLogin(acct1.id, '错的').err === 'auth', '④ 错误口令被拒绝');
ok(G.acctLocked() === true, '④ 错误口令不产生会话');
ok(G.acctLogin(acct1.id, 'pw-1234').ok === true && G.acctLocked() === false, '④ 正确口令解锁');
ok(G.vaultRead('breach_game_save').indexOf('424242') > 0, '④ 解锁后数据可读');
// 经界面登录(而不是直接调函数)
G.sessClear();
G.acctOpenUI(true);
sb._els['acctPw'].value = 'nope';
sb._els['acctGo'].onclick();
ok(G.acctLocked() === true && String(sb._els['acctMsg'].textContent).indexOf('口令') >= 0, '④ 界面输错口令: 仍锁定并给出提示 ("' + sb._els['acctMsg'].textContent + '")');
sb._els['acctPw'].value = 'pw-1234';
sb._els['acctGo'].onclick();
ok(G.acctLocked() === false && G.acctUI.open === false, '④ 界面输对口令: 解锁并收起账户界面');

// ---------- ⑤ 多账户隔离 ----------
console.log('--- ⑤ 多账户 ---');
G.acctOpenUI(false);
sb._els['acctNew'].onclick();
sb._els['acctNewUser'].value = '小李';
sb._els['acctNewPw'].value = 'pw-5678';
sb._els['acctNewPw2'].value = 'pw-5678';
sb._els['acctCreate'].onclick();
const acct2 = G.acctAll().filter(a => a.user === '小李')[0];
ok(G.acctAll().length === 2 && !!acct2 && acct2.id !== acct1.id, '⑤ 第二个账户已建立');
ok(G.vaultRead('breach_game_save') === null, '⑤ 新账户看到的是空档(读不到别人的进度)');
G.applyBackup({ app: 'breach-door-cqb', save: { version: 2, points: 5 } });
ok(isEnv(store._raw['breach_game_acct_' + acct2.id + '_save']), '⑤ 第二账户的数据同样加密');
ok(store._raw[A1 + 'save'].indexOf('424242') > 0 || isEnv(store._raw[A1 + 'save']), '⑤ 第一账户的密文仍在');
G.sessClear();
G.acctLogin(acct1.id, 'pw-1234');
ok(G.vaultRead('breach_game_save').indexOf('424242') > 0, '⑤ 切回第一账户: 数据完好未被覆盖');

// ---------- ⑥ 游客模式每次重置 ----------
console.log('--- ⑥ 游客模式 ---');
G.acctOpenUI(false);
sb._els['acctGuest'].onclick();
ok(G.acctMode() === 'guest', '⑥ 进入游客模式');
ok(G.vaultRead('breach_game_save') === null, '⑥ 游客看不到账户进度');
G.applyBackup({ app: 'breach-door-cqb', save: { version: 2, points: 999 } });
ok(!isEnv(store._raw['breach_game_save']) && store._raw['breach_game_save'].indexOf('999') > 0, '⑥ 游客进度写旧明文键');
G.acctOpenUI(false);
sb._els['acctGuest'].onclick();
ok(G.vaultRead('breach_game_save') === null, '⑥ 再次进入游客 → 进度被清空(每次重置)');
ok(isEnv(store._raw[A1 + 'save']), '⑥ 清空游客不碰账户密文');
G.sessClear();
G.acctLogin(acct1.id, 'pw-1234');
ok(G.vaultRead('breach_game_save').indexOf('424242') > 0, '⑥ 游客折腾完, 账户进度依然完好');

// ---------- ⑦ 游戏页: 未解锁就拦住 ----------
console.log('--- ⑦ 游戏页拦截 ---');
{
  // 7a 有账户 + 无会话 → 不启动
  const s2 = mkStore(), ss2 = mkStore();
  const hub = load('game/hub.html', s2, ss2);
  hub.window.__game.acctCreate('守门员', 'pw-9999');
  const breach = load('game/breach.html', s2, mkStore());   // 新标签页: 没有会话
  const GB = breach.window.__game;
  ok(GB.acctLocked() === true, '⑦ 游戏页(战役)识别到锁定');
  ok(!!breach._els['acctLockOverlay'], '⑦ 战役页出现解锁拦截层');
  ok(breach._raf() === null, '⑦ 战役页没有启动主循环(不读档不开局)');
  // 7b 解锁后(会话存在) → 正常启动
  const ss3 = mkStore();
  const hub2 = load('game/hub.html', s2, ss3);
  hub2.window.__game.acctLogin(hub2.window.__game.acctAll()[0].id, 'pw-9999');
  const breach2 = load('game/breach.html', s2, ss3);
  ok(breach2.window.__game.acctLocked() === false, '⑦ 同一会话下不再锁');
  ok(breach2._raf() !== null, '⑦ 解锁后战役页正常启动主循环');
  ok(!breach2._els['acctLockOverlay'] || !breach2._els['acctLockOverlay'].classList.contains('hidden') === false, '⑦ 不再出现拦截层');
  const street = load('game/street.html', s2, mkStore());
  ok(street.window.__game.acctLocked() === true && street._raf() === null, '⑦ 长街页同样被拦住(未启动)');
  const street2 = load('game/street.html', s2, ss3);
  ok(street2.window.__game.acctLocked() === false && street2._raf() !== null, '⑦ 解锁后长街页正常启动');
}

// ---------- ⑧ 改口令 / 删除账户 ----------
console.log('--- ⑧ 改口令与删除 ---');
G.acctOpenUI(false);
sb._els['acctChpw'].onclick();
sb._els['acctChOld'].value = '错的';
sb._els['acctChNew'].value = 'pw-new-1';
sb._els['acctChNew2'].value = 'pw-new-1';
sb._els['acctChGo'].onclick();
ok(String(sb._els['acctMsg'].textContent).indexOf('原口令') >= 0, '⑧ 原口令不对 → 拒绝改口令');
G.acctOpenUI(false);
sb._els['acctChpw'].onclick();
sb._els['acctChOld'].value = 'pw-1234';
sb._els['acctChNew'].value = 'pw-new-1';
sb._els['acctChNew2'].value = 'pw-new-1';
sb._els['acctChGo'].onclick();
ok(String(sb._els['acctMsg'].textContent).indexOf('修改') >= 0 || G.sessGet(), '⑧ 改口令成功');
ok(G.vaultRead('breach_game_save').indexOf('424242') > 0, '⑧ 改口令后数据没丢');
G.sessClear();
ok(G.acctLogin(acct1.id, 'pw-1234').err === 'auth', '⑧ 旧口令失效');
ok(G.acctLogin(acct1.id, 'pw-new-1').ok === true, '⑧ 新口令可用');
ok(G.acctDelete(acct2.id, '错的').err === 'auth', '⑧ 删除账户需要正确口令');
ok(G.acctDelete(acct2.id, 'pw-5678').ok === true && G.acctAll().length === 1, '⑧ 删除第二账户成功');
ok(!has(store, 'breach_game_acct_' + acct2.id + '_save'), '⑧ 被删账户的密文已清除');
ok(G.acctDelete(acct1.id, 'pw-new-1').ok === true && G.acctAll().length === 0, '⑧ 删完最后一个账户');
ok(G.acctLocked() === false && G.acctMode() === 'legacy', '⑧ 删除后回到无锁旧模式');

// ---------- ⑨ 四个页面模块副本逐字节一致 ----------
console.log('--- ⑨ 副本一致性 ---');
{
  const PAGES = ['index.html', 'game/hub.html', 'game/breach.html', 'game/street.html'];
  const texts = PAGES.map(p => ({ p: p, h: readHtml(p).raw }));
  const reg = (h, b, e) => { const i = h.indexOf(b), j = h.indexOf(e); return (i < 0 || j < 0) ? null : h.slice(i, j + e.length); };
  const CB = '// >>> ACCT-CRYPTO-BEGIN', CE = '// <<< ACCT-CRYPTO-END';
  const KB = '// >>> ACCT-CORE-BEGIN', KE = '// <<< ACCT-CORE-END';
  const UB = '// >>> ACCT-UI-BEGIN', UE = '// <<< ACCT-UI-END';
  const rc = reg(texts[0].h, CB, CE), rk = reg(texts[0].h, KB, KE), ru = reg(texts[0].h, UB, UE);
  ok(!!rc && !!rk && !!ru, '⑨ 三个区块的哨兵都在');
  let bad = [];
  for (const t of texts) {
    if (reg(t.h, CB, CE) !== rc) bad.push(t.p + ':crypto');
    if (reg(t.h, KB, KE) !== rk) bad.push(t.p + ':core');
    const c = (s) => t.h.split(s).length - 1;
    if (c('const ENC_FORMAT') !== 1 || c('function sha256(') !== 1 || c('const ACCT_KEY') !== 1 || c('function vaultWrite(') !== 1) bad.push(t.p + ':dup');
  }
  for (const p of ['index.html', 'game/hub.html']) if (reg(readHtml(p).raw, UB, UE) !== ru) bad.push(p + ':ui');
  ok(bad.length === 0, '⑨ 加密原语(四页)/账户核心(四页)/账户界面(两页)逐字节一致' + (bad.length ? ' — ' + bad.join(', ') : ''));
  ok(rc.split('\n').length > 150 && rk.split('\n').length > 200 && ru.split('\n').length > 120,
    '⑨ 区块规模合理 (' + rc.split('\n').length + '/' + rk.split('\n').length + '/' + ru.split('\n').length + ' 行)');
  // 游戏页不应内嵌登录界面
  for (const p of ['game/breach.html', 'game/street.html']) {
    ok(readHtml(p).raw.indexOf(UB) < 0, '⑨ 游戏页不内嵌账户界面 (' + p + ')');
  }
}

// ---------- ⑩ 会话指纹/存档协议不受影响 ----------
console.log('--- ⑩ 会话与旧协议 ---');
{
  const s3 = mkStore(), ss4 = mkStore();
  const hub = load('game/hub.html', s3, ss4);
  const GH = hub.window.__game;
  const c = GH.acctCreate('阿强', 'pw-3333');
  ok(GH.sessGet() && GH.sessGet().id === c.id, '⑩ 已解锁');
  const tok = JSON.parse(ss4.getItem(GH.ACCT.sess));
  ss4.setItem(GH.ACCT.sess, JSON.stringify(Object.assign({}, tok, { fp: 'bogus' })));
  ok(GH.sessGet() === null && GH.acctLocked() === true, '⑩ 指纹对不上 → 会话失效');
  ss4.setItem(GH.ACCT.sess, JSON.stringify(tok));
  ok(GH.sessGet() !== null, '⑩ 指纹正确 → 会话有效');
  ok(GH.acctLogin(c.id, 'pw-3333').ok === true, '⑩ 重新登录可用');
  // 解锁后仍能正常导入/导出(账户加密与"导出加密"是两件事, 互不干扰)
  GH.applyBackup({ app: 'breach-door-cqb', save: { version: 2, points: 12 } });
  const back = GH.buildBackup();
  ok(back.app === 'breach-door-cqb' && !!back.save && back.save.points === 12 && !('enc' in back),
    '⑩ 账户模式下 buildBackup 仍能取到明文结构(导出是另一层显式加密)');
  GH.acctLogout();
  ok(GH.acctLocked() === true && GH.vaultWrite('breach_game_save', '{"points":1}') === false, '⑩ 退出登录后拒绝写入进度');
  const enc = GH.encryptBackup(back, 'pw-export');
  ok(!!enc && enc.enc === GH.encFormat && GH.decryptBackup(enc, 'pw-export').ok === true, '⑩ v3.1 加密导出仍然可用');
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nACCOUNT TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
