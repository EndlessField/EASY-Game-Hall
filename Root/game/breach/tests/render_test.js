// render_test.js —— 离屏精灵烘焙的几何回归(渲染优化的配套守护)
//
// 背景(真实故障): 家具被改造成"离屏精灵烘焙"后出现"家具显示异常"。
//   根因: 离屏 canvas 的 2d ctx 是**长期复用**的, 而 render() 每帧会在主画布上
//   setTransform(cam.z, 0, 0, cam.z, ...); 烘焙时没有复位变换 → 相机变换被叠加进精灵,
//   家具被缩放/平移/裁切成碎片。
//   为什么既有测试没抓到: 全部桩环境的 getContext() 每次返回**全新空对象**, 变换天然是单位矩阵;
//   浏览器里同一个 canvas 反复 getContext('2d') 返回**同一个** ctx, 变换会残留。
//
// 本测试因此刻意模拟浏览器语义:
//   1. 每个 canvas 的 getContext('2d') 返回同一个带状态(含变换矩阵)的 ctx;
//   2. 主画布 #cv 会被 render() 设置相机变换;
//   3. 离屏 canvas 记录"烘焙开始时"的变换矩阵, 必须为单位矩阵;
//   4. 用极简软件光栅器把 fillRect 按当前矩阵写进像素缓冲, 从而能断言
//      "家具底色落在精灵内的预期矩形上"(错位/缩放/裁切都会被抓到)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'game', 'breach.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// ---------- 变换/颜色工具 ----------
function identity(m) { return m && m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0; }
function mul(m, n) {   // n 应用在 m 之后(与 canvas 语义一致: 新变换 = 旧 × 新)
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function parseHex(s) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}
function noteBake(ctx) { if (ctx._bakes) ctx._bakes.push(ctx.m.slice(0)); }

// ---------- 记录型画布(带真实变换与像素缓冲) ----------
function makeCanvasCtx(canvas, label) {
  const ctx = {
    canvas, m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1,
    _buf: null, _label: label, _bakes: [], _draws: 0,
    // 尺寸按 canvas 当前值动态读取(页面会先 createElement 再赋 width/height 再 getContext)
    get _w() { return canvas.width | 0; },
    get _h() { return canvas.height | 0; },
    _alloc() {
      const need = Math.max(0, ctx._w) * Math.max(0, ctx._h) * 3;
      if (!ctx._buf || ctx._buf.length !== need) ctx._buf = new Uint8Array(need);
    },
    _hasOpaqueFill() {
      if (!ctx._buf) return false;
      for (let i = 0; i < ctx._buf.length; i += 3) if (ctx._buf[i] || ctx._buf[i + 1] || ctx._buf[i + 2]) return true;
      return false;
    },
    _registerBake() { noteBake(ctx); },
    save() { ctx._saved = ctx.m.slice(0); }, restore() { if (ctx._saved) ctx.m = ctx._saved; },
    translate(x, y) { ctx.m = mul(ctx.m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { ctx.m = mul(ctx.m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { ctx.m = mul(ctx.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    setTransform(a, b, c, d, e, f) { ctx.m = [a, b, c, d, e, f]; if (!identity(ctx.m)) ctx._sawCamera = true; },
    resetTransform() { ctx.m = [1, 0, 0, 1, 0, 0]; },
    clearRect() { },
    fillRect(x, y, w, h) {
      const c = parseHex(ctx.fillStyle);
      if (!c) return;   // 只关心不透明底色(细节层是 rgba, 不参与本断言)
      ctx._alloc();
      const p = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(pt => [
        ctx.m[0] * pt[0] + ctx.m[2] * pt[1] + ctx.m[4], ctx.m[1] * pt[0] + ctx.m[3] * pt[1] + ctx.m[5]]);
      const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
      const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs));
      const y0 = Math.round(Math.min(...ys)), y1 = Math.round(Math.max(...ys));
      // 与浏览器一致: 超出画布的部分被静默裁掉(这正是"精灵空白"故障的成因)
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          if (xx < 0 || yy < 0 || xx >= ctx._w || yy >= ctx._h) continue;
          const i = (yy * ctx._w + xx) * 3;
          ctx._buf[i] = c[0]; ctx._buf[i + 1] = c[1]; ctx._buf[i + 2] = c[2];
        }
      }
    },
    strokeRect() { }, fill() { }, stroke() { }, beginPath() { }, closePath() { }, clip() { },
    arc() { }, moveTo() { }, lineTo() { }, ellipse() { }, fillText() { }, putImageData() { },
    drawImage() { ctx._draws++; },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createRadialGradient: () => ({ addColorStop() { } }),
    createLinearGradient: () => ({ addColorStop() { } }),
  };
  return ctx;
}
const ctxRegistry = new Map();   // canvas → ctx(同一 canvas 反复 getContext 返回同一个 ctx)
function contextFor(canvas, label) {
  if (!ctxRegistry.has(canvas)) ctxRegistry.set(canvas, makeCanvasCtx(canvas, label));
  return ctxRegistry.get(canvas);
}
function makeEl(id) {
  const ls = {};
  const el = {
    id, style: {}, classList: { add() { }, remove() { }, toggle() { } },
    addEventListener(e, f) { (ls[e] = ls[e] || []).push(f); }, _fire(e, o) { for (const f of ls[e] || []) f(o); },
    appendChild() { }, className: '', disabled: false, checked: false, value: '', textContent: '', innerHTML: '',
    width: (id === 'cv' ? 1280 : id === 'mm' ? 300 : 0), height: (id === 'cv' ? 800 : id === 'mm' ? 125 : 0),
    onclick: null, _kind: 'el'
  };
  el.getContext = function () {
    if (!ctxRegistry.has(el)) ctxRegistry.set(el, makeCanvasCtx(el, id));
    el._ctx = ctxRegistry.get(el);
    return el._ctx;
  };
  return el;
}
const els = {}; let rafCb = null; const listeners = {};
const store = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: (f) => { rafCb = f; return 1; },
  window: { innerWidth: 1280, innerHeight: 800, addEventListener: (e, f) => { (listeners['w:' + e] = listeners['w:' + e] || []).push(f); }, AudioContext: undefined, webkitAudioContext: undefined },
  document: {
    getElementById: (id) => els[id] || (els[id] = makeEl(id)),
    createElement: (tag) => { const e = makeEl('off_' + tag + '_' + (++offSeq)); e._kind = 'offscreen'; return e; },
    addEventListener: (e, f) => { (listeners['d:' + e] = listeners['d:' + e] || []).push(f); },
    body: { appendChild() { }, removeChild() { } }
  },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  location: { href: '' }, setTimeout, clearTimeout
};
let offSeq = 0;
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
const G = sb.window.__game;

// 固定随机源 + 开局
G.setRandom((() => { let v = 2; return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 4294967296; }; })());
els['btnStart'].onclick();

// 关键: 让 #cv 上留下**非单位变换**(render 每帧都会设相机变换), 模拟真实运行状态。
// 默认视口把整张图放进 1280×800, cam.z 恰为 1.0 —— 那样"变换残留"这个 bug 不会显形,
// 所以这里先把镜头缩放到 0.5(玩家滚轮缩放后的常见状态)再渲染。
const cam = G.cam;
const cvCtx = els['cv']._ctx;
const stepFrame = (t) => { if (rafCb) rafCb(t); };   // 真正驱动页面的主循环
let t = 0;
cam.z = 0.5;
stepFrame(t += 16);   // 第一帧: 触发所有精灵烘焙
// 注意: 帧末 renderMinimap/updateHUD 会把主画布变换复位, 所以不能看"帧末矩阵",
// 要看"本帧是否曾处于相机变换下"(这正是精灵烘焙发生的时刻)
ok(cvCtx._sawCamera === true && Math.abs(cam.z - 0.5) < 0.02,
  '主画布在本帧确实带着相机变换(scale=' + cam.z.toFixed(3) + ') —— 复现"烘焙与相机变换同时存在"的前提');
stepFrame(t += 16);
stepFrame(t += 16);
if (process.env.RT_DEBUG) {
  console.log('[debug] rafCb=' + typeof rafCb + ' cam=' + JSON.stringify(G.cam) + ' units=' + G.units.length);
  for (const [cvObj, c] of ctxRegistry) console.log('[debug] ctx canvas id=' + cvObj.id + ' kind=' + cvObj._kind + ' size=' + cvObj.width + 'x' + cvObj.height + ' bufLen=' + (c._buf ? c._buf.length : 'null') + ' bakes=' + c._bakes.length + ' m=' + c.m.join(','));
}

// 1) 所有离屏烘焙都必须以单位变换开始(这条就是本次故障的直接判据)
const offCtxs = [...ctxRegistry.values()].filter(c => c.canvas && c.canvas._kind === 'offscreen');
if (process.env.RT_DEBUG) {
  for (const c of offCtxs) console.log('[debug] off ' + c._label + ' ' + c.canvas.width + 'x' + c.canvas.height
    + ' buf=' + (c._buf ? c._buf.length : 'null') + ' opaque=' + c._hasOpaqueFill() + ' bakes=' + c._bakes.length);
}
const bakeCtxs = offCtxs.filter(c => c._buf && c._hasOpaqueFill());ok(bakeCtxs.length > 0, '存在离屏精灵烘焙画布(' + bakeCtxs.length + ' 个)');
const badBakes = bakeCtxs.filter(c => c._bakes.some(m => !identity(m)));
ok(badBakes.length === 0, '所有离屏烘焙开始时的变换都是单位矩阵(残留变换会让家具被缩放/裁切)'
  + (badBakes.length ? ' — 异常: ' + badBakes.map(c => c._label + ' m=' + c._bakes[0].map(v => v.toFixed(2)).join(',')).join(' | ') : ''));

// 家具级精灵 = 尺寸正好等于"某件家具 + 4px 边距"(排除迷雾缓冲/单位/光晕等其它离屏画布)
const coverKeys = new Set(G.lowCovers.map(c => (c.w + 8) + 'x' + (c.h + 8)));
const furnitureSprites = offCtxs.filter(c => coverKeys.has(c.canvas.width + 'x' + c.canvas.height));
ok(furnitureSprites.length > 0, '识别出 ' + furnitureSprites.length + ' 个家具精灵画布(尺寸符合 w+8 × h+8)');

// 2) 家具精灵: 非空像素必须正好填满"精灵内 = 去掉 4px 边距"的矩形。
//    判据直接对治本次故障: 若烘焙用绝对坐标(未按家具原点平移), 浏览器会把整套绘制裁掉,
//    精灵内非空像素只剩极少数(或为 0) → 下面这条立刻失败。
let checked = 0; const mismatched = [];
for (const sp of furnitureSprites) {
  const bb = bboxOfAny(sp);
  if (!bb) { mismatched.push(sp._label + ' 精灵全空(' + sp.canvas.width + 'x' + sp.canvas.height + ')'); continue; }
  checked++;
  const wantW = sp.canvas.width - 8, wantH = sp.canvas.height - 8;
  const okBox = Math.abs(bb.x0 - 4) <= 2 && Math.abs(bb.y0 - 4) <= 2
    && Math.abs(bb.w - wantW) <= 4 && Math.abs(bb.h - wantH) <= 4;
  if (!okBox) mismatched.push(sp._label + '(' + sp.canvas.width + 'x' + sp.canvas.height + ') 期望(x4,y4,' + wantW + 'x' + wantH + ') 实测(x' + bb.x0 + ',y' + bb.y0 + ',' + bb.w + 'x' + bb.h + ')');
}
ok(checked > 0, '抽样核对了 ' + checked + ' 个家具精灵的非空范围');
ok(mismatched.length === 0, '家具精灵内容填满"精灵内除 4px 边距"的区域(空白/错位/被裁切都会被抓到)'
  + (mismatched.length ? ' — ' + mismatched.slice(0, 4).join(' | ') : ''));

// 3) 多帧后精灵内容不漂移(变换若在累积, 第 N 帧的精灵会与首帧不同)
const before = bakeCtxs.map(c => c._bakes.length);
stepFrame(t += 16); stepFrame(t += 16);
const grew = bakeCtxs.filter((c, i) => c._bakes.length !== before[i]);
ok(grew.length === 0, '精灵烘焙只发生一次(缓存命中), 未因变换累积而重复烘焙');

function bboxOfColor(ctx, col) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let y = 0; y < ctx._h; y++) {
    for (let x = 0; x < ctx._w; x++) {
      const i = (y * ctx._w + x) * 3;
      if (ctx._buf[i] === col[0] && ctx._buf[i + 1] === col[1] && ctx._buf[i + 2] === col[2]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// 任一非零(非全透明)像素的包围盒
function bboxOfAny(ctx) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let y = 0; y < ctx._h; y++) {
    for (let x = 0; x < ctx._w; x++) {
      const i = (y * ctx._w + x) * 3;
      if (ctx._buf[i] || ctx._buf[i + 1] || ctx._buf[i + 2]) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nRENDER TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
