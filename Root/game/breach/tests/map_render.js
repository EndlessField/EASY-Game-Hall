// 地图渲染探针(开发辅助, 无断言、不计入门禁): 把游戏内地图画成 PNG 便于肉眼核对布局
//   node tests/map_render.js                    → 渲染 5 张战役地图(house/warehouse/factory/office/parking)
//   node tests/map_render.js house office       → 只渲染指定地图
//   node tests/map_render.js street             → 渲染长街地图(game/street.html)
// 输出: tests/_map_<id>.png (1200×500 或 1440×600; 零依赖, 自带最小 PNG 编码器)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const DIR = path.join(__dirname, '..');

function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() {} }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeEl() {
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, textContent: '', innerHTML: '', width: 0, height: 0, getContext: () => makeCtx(), onclick: null };
}
function loadGame(file) {
  const code = fs.readFileSync(path.join(DIR, file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {}; const store = {};
  const sb = {
    console, performance: { now: () => Date.now() }, requestAnimationFrame: () => 1,
    window: { innerWidth: 1280, innerHeight: 800, addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined },
    document: { getElementById: (id) => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    location: { href: '' }, setTimeout, clearTimeout
  };
  sb.globalThis = sb; sb.window.window = sb.window;
  vm.runInNewContext(code, sb);
  return { g: sb.window.__game, els };
}

// —— 画布(最小实现: 只够画矩形/线段/点) ——
let W = 1200, H = 500, buf = null;
const setSize = (w, h) => { W = w; H = h; buf = Buffer.alloc(W * H * 3); };
const px = (x, y, c) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
};
const rect = (x, y, w, h, c) => {
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++) {
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) px(xx, yy, c);
  }
};
const rgba = (x, y, w, h, p) => {           // 半透明装饰层
  const a = p.length > 3 ? p[3] : 1;
  for (let yy = Math.max(0, Math.round(y)); yy < Math.min(H, Math.round(y + h)); yy++) {
    for (let xx = Math.max(0, Math.round(x)); xx < Math.min(W, Math.round(x + w)); xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = (yy * W + xx) * 3;
      buf[i] = buf[i] * (1 - a) + p[0] * a; buf[i + 1] = buf[i + 1] * (1 - a) + p[1] * a; buf[i + 2] = buf[i + 2] * (1 - a) + p[2] * a;
    }
  }
};
const line = (x1, y1, x2, y2, c, t) => {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
  for (let i = 0; i <= n; i++) {
    const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
    for (let dy = -t; dy <= t; dy++) for (let dx = -t; dx <= t; dx++) px(x + dx, y + dy, c);
  }
};
const dot = (x, y, c, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) px(x + dx, y + dy, c); };
const png = (file) => {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  const table = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
};

// 家具配色(与 breach.html 的 coverColors 对应, 仅探针用)
const COL = {
  sofa: [125, 95, 74], table: [138, 115, 84], shelf: [111, 90, 68], bed: [95, 120, 144], desk: [138, 115, 84],
  counter: [109, 130, 146], island: [109, 130, 146], wardrobe: [122, 92, 70], crate: [138, 127, 99], rack: [122, 134, 104],
  machine: [95, 107, 122], conveyor: [119, 106, 85], fridge: [127, 146, 163], car: [74, 86, 102], pillar: [91, 96, 104],
  toilet: [147, 163, 175], sink: [157, 172, 184], tub: [169, 183, 195], stove: [125, 135, 148], dock: [109, 100, 80],
  pallet: [138, 122, 82], forklift: [178, 138, 53], tank: [107, 122, 134], barrier: [201, 178, 79], copier: [123, 135, 148], locker: [109, 124, 140]
};

const names = process.argv.slice(2);
const wantStreet = names.includes('street');
const ids = names.filter(n => n !== 'street');
const maps = ids.length ? ids : ['house', 'warehouse', 'factory', 'office', 'parking'];

if (!wantStreet) {
  const { g, els } = loadGame(path.join('game', 'breach.html'));
  for (const id of maps) {
    if (!g.mapDefs[id]) { console.log('unknown map: ' + id); continue; }
    if (id !== 'range') g.selectMap(id);
    if (id === 'range') els['btnRange'] && els['btnRange'].onclick();
    setSize(1200, 500);
    const S = 0.5;
    rect(0, 0, 2400 * S, 1000 * S, [12, 14, 20]);
    for (const r of g.rooms) rect(r.x * S, r.y * S, r.w * S, r.h * S, r.c);
    for (const d of g.decor) {
      const m = /rgba?\(([^)]+)\)/.exec(d.color); if (!m) continue;
      rgba(d.x * S, d.y * S, d.w * S, d.h * S, m[1].split(',').map(Number));
    }
    for (const c of g.lowCovers) rect(c.x * S, c.y * S, c.w * S, c.h * S, COL[c.kind] || [138, 127, 99]);
    for (const w of g.walls) line(w.x1 * S, w.y1 * S, w.x2 * S, w.y2 * S, w.door ? [230, 170, 60] : [200, 208, 220], 1);
    const sc = g.spawnCfg, red = sc.red[id], blue = sc.blue[id];
    if (red) { dot(red.player[0] * S, red.player[1] * S, [255, 90, 70], 4); red.bots.forEach(b => dot(b[0] * S, b[1] * S, [255, 140, 120], 3)); }
    if (blue) { blue.defs.forEach(b => dot(b.x * S, b.y * S, [110, 160, 255], 3)); if (blue.extra) dot(blue.extra.x * S, blue.extra.y * S, [110, 160, 255], 3); }
    for (const pk of (g.pickupsCfg[id] || [])) dot(pk.x * S, pk.y * S, [240, 210, 90], 3);
    png(path.join(__dirname, '_map_' + id + '.png'));
    console.log('rendered ' + id + ' -> tests/_map_' + id + '.png');
  }
}
if (wantStreet) {
  const { g, els } = loadGame(path.join('game', 'street.html'));
  els['btnStart'] && els['btnStart'].onclick();
  setSize(1440, 600);
  const ROAD_Y0 = 204, ROAD_Y1 = 396, WALK_H = 36, UP_Y1 = ROAD_Y0 - WALK_H;
  rect(0, 0, 1440, 600, [42, 38, 34]);
  rect(0, UP_Y1, 1440, WALK_H, [61, 56, 51]);
  rect(0, ROAD_Y1, 1440, WALK_H, [61, 56, 51]);
  rect(0, ROAD_Y0, 1440, ROAD_Y1 - ROAD_Y0, [52, 48, 44]);
  for (const b of g.buildingRects) { rect(b.x, b.y, b.w, b.h, [32, 38, 46]); rect(b.x, b.y + b.h - 26, b.w, 26, [46, 50, 58]); }
  for (const c of g.covers) {
    const col = c.kind === 'planter' ? [58, 74, 50] : c.kind === 'dumpster' ? [63, 74, 82] : c.kind === 'bus' ? [61, 74, 106]
      : c.kind === 'box' ? [77, 85, 96] : c.kind === 'hydrant' ? [143, 59, 48] : [74, 74, 74];
    rect(c.x, c.y, c.w, c.h, col);
  }
  png(path.join(__dirname, '_map_street.png'));
  console.log('rendered street -> tests/_map_street.png');
}
