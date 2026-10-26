// 地图探针(开发辅助, 无断言、不计入门禁): 打印某张地图的可走性 ASCII 图 + 出生点/补给/房间可达性
// 用法: node tests/map_probe.js [house|warehouse|factory|office|parking|range] [x y ...额外标记点]
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
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(ev, fn) { (ls[ev] = ls[ev] || []).push(fn); }, textContent: '', innerHTML: '', width: 0, height: 0, getContext: () => makeCtx(), onclick: null };
}
const els = {}; let rafCb = null; const listeners = {}; const store = {};
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
const G = () => sb.window.__game;

const id = process.argv[2] || 'house';
const extra = [];
for (let i = 3; i + 1 < process.argv.length; i += 2) extra.push([Number(process.argv[i]), Number(process.argv[i + 1])]);

G().selectMap(id);
els['btnStart'].onclick();
const g = G();
const mg = g.moveGrid;
const walk = (x, y) => { const cx = Math.floor(x / 16), cy = Math.floor(y / 16); return cx >= 0 && cy >= 0 && cx < 150 && cy < 62 && mg[cx + cy * 150] === 1; };
const inCover = (x, y) => g.lowCovers.some(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
const nearWall = (x, y) => g.walls.some(w => {
  const abx = w.x2 - w.x1, aby = w.y2 - w.y1, len2 = abx * abx + aby * aby || 1e-9;
  let t = ((x - w.x1) * abx + (y - w.y1) * aby) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (w.x1 + abx * t), y - (w.y1 + aby * t)) < 14;
});

console.log('===== 地图 ' + id + ' (' + g.mapId + ') 房间 ' + g.rooms.length + ' 墙 ' + g.walls.length + ' 门 ' + g.doors.length + ' 家具 ' + g.lowCovers.length + ' =====');
console.log('房间:');
for (const r of g.rooms) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  let found = null;
  outer: for (let oy = -160; oy <= 160; oy += 40) for (let ox = -160; ox <= 160; ox += 40) {
    const px = cx + ox, py = cy + oy;
    if (walk(px, py) && g.findPath(g.player.x, g.player.y, px, py)) { found = [px, py]; break outer; }
  }
  console.log('  ' + r.name.padEnd(6) + ' [' + r.x + ',' + r.y + ' ' + r.w + 'x' + r.h + '] 中心(' + cx + ',' + cy + ')' + (walk(cx, cy) ? ' 可走' : ' 中心不可走') + (found ? ' 可达(' + found + ')' : ' 【不可达!】'));
}

// ASCII 图: 每格 24×25px
const CW = 24, CH = 25, cols = 100, rows = 40;
const marks = new Map();
const put = (x, y, ch) => marks.set(Math.floor(x / CW) + ',' + Math.floor(y / CH), ch);
for (const u of g.units) put(u.x, u.y, u.team === 'red' ? 'R' : 'B');
for (const pk of g.pickups) put(pk.x, pk.y, 'P');
for (const [x, y] of extra) put(x, y, 'X');
let out = '';
for (let ry = 0; ry < rows; ry++) {
  let line = '';
  for (let rx = 0; rx < cols; rx++) {
    const x = rx * CW + CW / 2, y = ry * CH + CH / 2;
    const m = marks.get(rx + ',' + ry);
    if (m) { line += m; continue; }
    if (g.doors.some(d => Math.abs(d.cx - x) < CW && Math.abs(d.cy - y) < CH)) { line += 'D'; continue; }
    if (nearWall(x, y)) { line += '#'; continue; }
    if (walk(x, y)) { line += '.'; continue; }
    if (inCover(x, y)) { line += 'o'; continue; }
    line += ',';
  }
  out += String(ry * CH).padStart(4) + ' ' + line + '\n';
}
console.log('图例: # 墙/结构  o 家具掩体  . 可走  , 不可走(缝隙/贴墙)  D 门  R 红方  B 蓝方  P 补给  X 自定标记');
console.log(out);
console.log('红方出生点:');
for (const u of g.units.filter(u => u.team === 'red')) console.log('  ' + u.name + ' (' + u.x.toFixed(0) + ',' + u.y.toFixed(0) + ') ' + (walk(u.x, u.y) ? '可走' : '【不可走!】'));
console.log('蓝方出生点:');
for (const u of g.units.filter(u => u.team === 'blue')) {
  const ok = walk(u.x, u.y);
  const p = ok ? true : [[-80, 0], [80, 0], [0, -80], [0, 80], [-80, -80], [80, 80]].some(o => walk(u.x + o[0], u.y + o[1]));
  console.log('  ' + u.name + ' (' + u.x.toFixed(0) + ',' + u.y.toFixed(0) + ') ' + (walk(u.x, u.y) ? '可走' : (p ? '中心不可走(附近可走)' : '【不可走!】')) + ' 到玩家' + (g.findPath(g.player.x, g.player.y, u.x, u.y) ? '可达' : (ok ? '【不可达!】' : '(中心不可走)')));
}
console.log('补给点:');
for (const pk of g.pickups) console.log('  ' + pk.type + ' (' + pk.x + ',' + pk.y + ') ' + (walk(pk.x, pk.y) ? '可走' : '【不可走!】') + (g.findPath(g.player.x, g.player.y, pk.x, pk.y) ? ' 可达' : ' 【不可达!】'));
// v3: 配电箱(必须站在可达位置按到) —— 这张表是手填坐标, 改图后要复检
const bk = g.breakerAt();
console.log('配电箱:');
if (!bk) console.log('  (本图无)');
else {
  // 交互判定只看"玩家中心到配电箱"的距离(<70px), 所以要在配电箱周围 70px 内找一个可走且可达的站位
  let stand = null;
  outer2: for (let oy = -70; oy <= 70 && !stand; oy += 20) {
    for (let ox = -70; ox <= 70; ox += 20) {
      const px = bk.x + ox, py = bk.y + oy;
      if (Math.hypot(ox, oy) > 68) continue;
      if (walk(px, py) && g.findPath(g.player.x, g.player.y, px, py)) { stand = [px, py]; break outer2; }
    }
  }
  console.log('  (' + bk.x + ',' + bk.y + ') ' + (stand ? '可交互站位(' + stand + ') 可达' : '【70px 内找不到可走可达的站位!】'));
}
