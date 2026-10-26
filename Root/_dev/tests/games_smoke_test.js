// ============================================================================
// 全部网页游戏冒烟测试(离屏运行, 不需要浏览器)
// ----------------------------------------------------------------------------
// 交火自带的 22 个测试只覆盖它自己; 贪吃蛇 / 太空射手 / 俄罗斯方块 / 扫雷
// 这四个单文件小游戏本来一个测试都没有 —— 移动过目录、改过图标路径之后,
// "双击能不能跑起来"完全没有回归保护, 这里补上:
//   1. 按 HTML 里的**文档顺序**装载所有 <script>(含 <script src>)——顺序错了
//      (比如内联脚本先于它依赖的库执行)会立刻暴露成 "xxx is not defined";
//   2. 在最小 DOM/Canvas 桩里真跑 90 帧 requestAnimationFrame, 抓运行时异常;
//   3. 全程不允许触碰网络 API(fetch / XHR / WebSocket) —— 本库是纯离线合集;
//   4. getElementById 的字面量 id 必须在页面里真实存在(防手滑改错 id);
//      HTML 里没有、但页面脚本自己 createElement + .id = 'x' 造出来的 id 也算存在。
// 不联网、不依赖任何 npm 包。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const FRAMES = 90;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

/* ---------------- 最小 DOM / Canvas 桩 ---------------- */
function ctxStub() {
  const t = {
    canvas: null, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    shadowBlur: 0, shadowColor: '', shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, filter: 'none',
    createLinearGradient: () => ({ addColorStop() { } }),
    createRadialGradient: () => ({ addColorStop() { } }),
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 })
  };
  return new Proxy(t, {
    get(o, p) { if (p in o) return o[p]; return () => { }; },
    set(o, p, v) { o[p] = v; return true; }
  });
}
function elStub(tag) {
  const t = {
    tagName: String(tag || 'div').toUpperCase(), nodeName: String(tag || 'div').toUpperCase(), nodeType: 1,
    style: { setProperty() { }, getPropertyValue() { return ''; } }, dataset: {}, children: [], childNodes: [],
    value: '', textContent: '', innerText: '', innerHTML: '', outerHTML: '', src: '', href: '', checked: false,
    disabled: false, className: '', id: '', name: '', type: '', width: 300, height: 150, naturalWidth: 0, naturalHeight: 0,
    clientWidth: 1280, clientHeight: 800, offsetWidth: 1280, offsetHeight: 800, scrollWidth: 1280, scrollHeight: 800,
    scrollLeft: 0, scrollTop: 0, offsetLeft: 0, offsetTop: 0, complete: true, readyState: 4, paused: true,
    volume: 1, currentTime: 0, duration: 0,
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; }, item() { return null; } },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    appendChild(c) { this.children.push(c); return c; }, insertBefore(c) { this.children.push(c); return c; },
    removeChild() { }, replaceChild() { }, remove() { }, cloneNode() { return elStub(tag); },
    setAttribute() { }, getAttribute() { return null; }, removeAttribute() { }, hasAttribute() { return false; },
    getContext() { const c = ctxStub(); c.canvas = this; return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800, x: 0, y: 0 }; },
    focus() { }, blur() { }, click() { }, play() { return Promise.resolve(); }, pause() { }, load() { },
    querySelector() { return elStub(); }, querySelectorAll() { return []; },
    getElementsByTagName() { return []; }, getElementsByClassName() { return []; },
    closest() { return null; }, contains() { return false; }, animate() { return { cancel() { } }; },
    scrollIntoView() { }, insertAdjacentHTML() { }, toDataURL() { return 'data:,'; }
  };
  return new Proxy(t, { get(o, p) { if (p in o) return o[p]; return () => { }; }, set(o, p, v) { o[p] = v; return true; } });
}
function makeSandbox(knownIds) {
  const els = {};
  const store = new Map();
  const netHits = [];
  const listeners = { window: {}, document: {} };
  function on(type, fn) { (listeners[this.__k][type] = listeners[this.__k][type] || []).push(fn); }
  function fire(type) {
    const ev = { type, target: null, preventDefault() { }, stopPropagation() { } };
    for (const k of ['document', 'window']) {
      for (const fn of (listeners[k][type] || [])) { try { fn.call(k === 'window' ? sb : doc, ev); } catch (e) { throw e; } }
    }
  }
  const doc = {
    __k: 'document',
    title: '', readyState: 'complete', hidden: false, cookie: '', URL: 'file:///Z:/Root/game/x.html',
    documentElement: elStub('html'), body: elStub('body'), head: elStub('head'),
    // 关键: 只认识页面里真实存在的 id, 其余一律返回 null —— 和浏览器一致。
    // 早期版本对未知 id 自动造桩, 结果扫雷 $("ss").href 这种"元素根本不存在"的
    // 致命初始化错误被桩子吞掉了, 测试全绿但游戏打不开。
    getElementById(id) {
      if (els[id]) return els[id];
      if (knownIds && !knownIds.has(id)) return null;
      return (els[id] = elStub());
    },
    createElement: elStub, createElementNS: (ns, t) => elStub(t), createTextNode: () => elStub('#text'),
    querySelector() { return elStub(); }, querySelectorAll() { return []; },
    getElementsByTagName() { return []; }, getElementsByClassName() { return []; }, getElementsByName() { return []; },
    addEventListener: on, removeEventListener() { }, dispatchEvent() { return true; },
    oncontextmenu: null, onselectstart: null, _els: els
  };
  const sb = {
    console, document: doc, performance: { now: () => Date.now() }, Date, Math, JSON, Object, Array, String, Number,
    Boolean, RegExp, Error, Map, Set, WeakMap, Uint8Array, Uint8ClampedArray, Float32Array, Int32Array, Promise, isNaN,
    parseInt, parseFloat, encodeURIComponent, decodeURIComponent, escape, unescape, Symbol, Proxy, Reflect,
    setTimeout: (f) => { if (typeof f === 'function') { try { f(); } catch (e) { } } return 0; },
    setInterval: () => 0, clearTimeout() { }, clearInterval() { },
    alert() { }, confirm: () => false, prompt: () => null, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    requestAnimationFrame(f) { sb._frames++; if (sb._frames <= FRAMES && typeof f === 'function') f(sb._frames * 16.7); return sb._frames; },
    cancelAnimationFrame() { }, requestIdleCallback: (f) => { return 0; }, cancelIdleCallback() { },
    localStorage: {
      getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
      setItem: (k, v) => store.set(String(k), String(v)),
      removeItem: k => store.delete(String(k)), clear: () => store.clear(),
      key: i => [...store.keys()][i], get length() { return store.size; }
    },
    Image: function () { return elStub('img'); }, Audio: function () { return elStub('audio'); },
    Path2D: function () { return {}; }, DOMMatrix: function () { return {}; }, OffscreenCanvas: function () { return elStub('canvas'); },
    CanvasRenderingContext2D: function () { return ctxStub(); },
    fetch: () => { netHits.push('fetch'); return Promise.reject(new Error('offline')); },
    XMLHttpRequest: function () { netHits.push('XMLHttpRequest'); return { open() { }, send() { }, setRequestHeader() { }, addEventListener() { }, abort() { } }; },
    WebSocket: function () { netHits.push('WebSocket'); return { send() { }, close() { } }; },
    AudioContext: function () {
      return {
        createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: { value: 0, setValueAtTime() { } }, detune: { value: 0 }, type: '' }),
        createGain: () => ({ connect() { }, gain: { value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } } }),
        createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: { value: 1 } }),
        createBuffer: (a, b) => ({ getChannelData: () => new Float32Array(b) }),
        createBiquadFilter: () => ({ connect() { }, frequency: { value: 0 }, Q: { value: 0 }, type: '' }),
        createDynamicsCompressor: () => ({ connect() { } }),
        createStereoPanner: () => ({ connect() { }, pan: { value: 0 } }),
        destination: {}, currentTime: 0, sampleRate: 44100, state: 'running', close() { }, resume() { }, suspend() { }
      };
    },
    screen: { width: 1280, height: 800, availWidth: 1280, availHeight: 800 },
    navigator: { userAgent: 'node-smoke', maxTouchPoints: 0, language: 'zh-CN', platform: 'Win32' },
    innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 800, devicePixelRatio: 1,
    location: { href: 'file:///Z:/Root/game/x.html', protocol: 'file:', host: '', pathname: '/game/x.html', search: '', hash: '' },
    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
    focus() { }, blur() { }, open: () => null, scrollTo() { }, matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { }, removeListener() { } }),
    getComputedStyle: () => elStub(), onload: null, onerror: null, _net: netHits, _frames: 0,
    __k: 'window', addEventListener: on, removeEventListener() { }, dispatchEvent() { return true; },
    _fire: fire
  };
  sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.top = sb; sb.parent = sb; sb.frames = sb;
  return sb;
}

/* ---------------- 按文档顺序取出脚本 ---------------- */
function collectScripts(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir = path.dirname(htmlPath);
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const src = (attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1];
    const type = (attrs.match(/\btype\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (type && !/javascript|module/i.test(type)) continue;
    if (src) {
      if (/^(?:[a-z]+:)?\/\//i.test(src)) { out.push({ remote: src }); continue; }
      const f = path.resolve(dir, src.split('?')[0]);
      out.push({ file: f, rel: src, code: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null });
    } else {
      out.push({ code: m[2], rel: '<inline>' });
    }
  }
  return { html, scripts: out };
}

/* ---------------- 页面专属的"真的开局了"检查 ---------------- */
// 返回 null = 正常, 返回字符串 = 说明哪里不对
const EXPECT = {
  // 扫雷: start() 会算出棋盘尺寸并建好 g[h][m] 雷盘; 没建起来就是没开局
  minesweeper: (sb) => {
    if (!(sb.m > 0 && sb.h > 0)) return '棋盘尺寸没算出来 (m/h 未建立)';
    if (!Array.isArray(sb.g) || sb.g.length !== sb.h || !Array.isArray(sb.g[0]) || sb.g[0].length !== sb.m) {
      return '雷盘 g[h][m] 没建立 -> 页面看着正常但点不动';
    }
    return null;
  }
};

/* ---------------- 跑一个页面 ---------------- */
function smoke(page) {
  const rel = page.rel;
  const full = path.join(ROOT, rel.split('/').join(path.sep));
  const { html, scripts } = collectScripts(full);
  const problems = [];

  // 4. id 字面量必须存在(含 $("x") 这种常见包装)
  const ids = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(x => x[1]));
  const idRefs = [
    ...html.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g),
    ...html.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g)          // function $(id){return document.getElementById(id)}
  ];
  for (const s of scripts) {
    if (!s.code) continue;
    idRefs.push(...s.code.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g));
    idRefs.push(...s.code.matchAll(/\$\(\s*["']([^"']+)["']\s*\)/g));
  }
  // 运行时自建的 id 也要算"存在": 有的页面不把输入框写在 HTML 里, 而是用工厂函数
  // createElement 之后再赋值 .id —— 交火 v3.2 的账户弹窗就是这样:
  //     function acctField(parent, id, label, type) { ... inp.id = id; ... }
  //     acctField(body, 'acctPw', '口令', 'password');
  // 这些 id 在静态 HTML 里查不到、但在浏览器里真实存在 —— 不能当成悬空 id。
  // 只补"页面自己造出来的 id": 先认出"把某个参数写进元素 id"的函数, 再把调用点上
  // 对应的字面量实参记下来。$("xxx") / getElementById("xxx") 里那个从来没被造过的
  // 字面量依旧判为悬空(扫雷 $("ss") 那类初始化崩溃照样抓得到)。
  const dynamicIds = new Set();
  for (const s of scripts) {
    if (!s.code) continue;
    for (const m of s.code.matchAll(/\.\s*id\s*=\s*["']([^"']+)["']/g)) dynamicIds.add(m[1]);                  // el.id = 'xxx'
    for (const m of s.code.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["']([^"']+)["']/g)) dynamicIds.add(m[1]);
    for (const m of s.code.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) dynamicIds.add(m[1]);                    // innerHTML 模板里的 id="xxx"
    for (const fn of s.code.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)) {
      // 正则只吃到函数头, 函数体按位置另取 —— 若把函数体也写进正则, matchAll 的
      // lastIndex 会停在函数体末尾, 于是紧随其后的下一个函数(acctField/acctBtn)被整段跳过。
      const body = s.code.slice(fn.index + fn[0].length, fn.index + fn[0].length + 800);
      const params = fn[2].split(',').map(x => x.replace(/=.*$/, '').trim()).filter(Boolean);
      params.forEach((p, i) => {
        if (!/^[A-Za-z_$][\w$]*$/.test(p)) return;                       // 跳过解构/默认值等复杂形参
        const writesId = new RegExp('(?:\\.\\s*id\\s*=\\s*' + p + '\\b|setAttribute\\(\\s*["\']id["\']\\s*,\\s*' + p + '\\b)');
        if (!writesId.test(body)) return;
        const callRe = new RegExp('\\b' + fn[1] + '\\s*\\(([^)]*)\\)', 'g');
        for (const c of s.code.matchAll(callRe)) {
          const lit = ((c[1].split(',')[i] || '').trim()).match(/^["']([^"']+)["']$/);
          if (lit) dynamicIds.add(lit[1]);
        }
      });
    }
  }
  for (const x of dynamicIds) ids.add(x);
  const usedIds = [...new Set(idRefs.map(x => x[1]))];
  const missingIds = usedIds.filter(x => !ids.has(x));
  if (missingIds.length) problems.push('代码取用了页面里不存在的元素 id: ' + JSON.stringify(missingIds));

  const sb = makeSandbox(ids);
  vm.createContext(sb);
  let loadErr = null;
  for (const s of scripts) {
    if (s.remote) { problems.push('远程脚本 ' + s.remote); continue; }
    if (s.code === null) { problems.push('缺失脚本 ' + s.rel); continue; }
    try { vm.runInContext(s.code, sb, { filename: path.basename(s.rel), timeout: 20000 }); }
    catch (e) { loadErr = s.rel + ': ' + e.message.split('\n')[0]; break; }
  }
  // 触发一遍引导事件: 有的游戏在 DOMContentLoaded / load 里才真正开局
  if (!loadErr) {
    for (const ev of ['DOMContentLoaded', 'load']) {
      try { sb._fire(ev); } catch (e) { loadErr = ev + ': ' + e.message.split('\n')[0]; break; }
    }
    if (!loadErr && typeof sb.onload === 'function') {
      try { sb.onload(); } catch (e) { loadErr = 'onload: ' + e.message.split('\n')[0]; }
    }
  }
  if (!loadErr && sb._net.length) problems.push('触碰网络 API: ' + JSON.stringify([...new Set(sb._net)]));
  // 页面专属的"真的开局了"检查: 光不抛异常还不够, 曾经就出现过初始化第一步被
  // 缺失元素打断、页面看着正常其实完全点不动的情况。
  if (!loadErr && EXPECT[page.id]) {
    const why = EXPECT[page.id](sb);
    if (why) problems.push(why);
  }
  return { problems, loadErr, net: sb._net, scripts: scripts.length, ids: ids.size, frames: sb._frames };
}

/* ---------------- 遍历清单里的所有网页游戏 ---------------- */
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'games.json'), 'utf8'));
const pages = [];
for (const g of manifest.games) {
  if (g.kind !== 'web') continue;
  pages.push({ id: g.id, rel: g.path });
  for (const md of (g.modes || [])) pages.push({ id: g.id + '.' + md.id, rel: md.path });
}

console.log('=== 网页游戏冒烟(' + pages.length + ' 个页面, 各 ' + FRAMES + ' 帧) ===');
for (const p of pages) {
  const r = smoke(p);
  const bad = r.loadErr || r.problems.length;
  if (bad) fail++; else pass++;
  let detail;
  if (r.loadErr) detail = '运行时异常 -> ' + r.loadErr + (r.problems.length ? ' | ' + r.problems.join(' | ') : '');
  else if (r.problems.length) detail = r.problems.join(' | ');
  else detail = '脚本 ' + r.scripts + ' 段, 帧数 ' + r.frames + ', 无异常';
  console.log((bad ? 'FAIL ' : 'ok   ') + p.id.padEnd(18) + detail);
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
