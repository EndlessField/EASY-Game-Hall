// 主页 / 准备页「地图预览」与游戏内地图的一致性检查
//   node tests/preview_test.js          校验(预览数据与 game/breach.html 构建器不一致 → 失败退出)
//   node tests/preview_test.js --write  用游戏内几何重新生成预览数据块(写入 index.html 与 game/hub.html)
// 数据来源: 直接调用 breach.html 里的 selectMap() 后读取 ROOMS / WALLS / lowCovers / 出生点配置,
// 因此任何地图改动只要重跑 --write, 预览就不可能过期。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(DIR, 'game', 'breach.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function makeCtx() {
  const t = { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), createRadialGradient: () => ({ addColorStop() {} }) };
  return new Proxy(t, { get(ta, p) { if (!(p in ta)) ta[p] = () => {}; return ta[p]; }, set(ta, p, v) { ta[p] = v; return true; } });
}
function makeEl() {
  return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, textContent: '', innerHTML: '', width: 0, height: 0, getContext: () => makeCtx(), onclick: null };
}
const els = {}; const store = {};
const sb = {
  console, performance: { now: () => Date.now() },
  requestAnimationFrame: () => 1,
  window: { innerWidth: 1280, innerHeight: 800, addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined },
  document: { getElementById: (id) => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), addEventListener() {} },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  location: { href: '' }, setTimeout, clearTimeout
};
sb.globalThis = sb; sb.window.window = sb.window;
vm.runInNewContext(code, sb);
const G = () => sb.window.__game;

const MAP_ORDER = ['house', 'warehouse', 'factory', 'office', 'parking'];
const NAMES = { house: '户型图', warehouse: '仓库', factory: '工厂', office: '写字楼', parking: '地下车库' };
const NOTES = {
  house: '一梯两户板式住宅 · 中央核心筒(楼梯间/电梯井/电梯厅) · 南向客厅与阳台',
  warehouse: '北墙装卸月台 · 两排背靠背双深货架 + 3m 叉车巷道 · 办公/卫生间/机电房',
  factory: '西进东出工艺动线: 原料库→冲压→焊接→装配 / 质检→成品→发货',
  office: '西端核心筒(电梯/楼梯/卫生间) · 1.6m 中央走廊 · 南北两排办公单元',
  parking: '三排垂直式车位 + 两条单行车道 · 8.1m 柱网 · 坡道出入口与设备房',
};
const RED_LABEL = {
  house: '红方·左户客厅', warehouse: '红方·收发货区', factory: '红方·原料库',
  office: '红方·前台大厅', parking: '红方·坡道出入口',
};
const B_BLUE = ['#7aa8ff', '#5a8dff'];
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
const num = v => (Math.round(v * 100) / 100);

function collect(id) {
  G().selectMap(id);
  const g = G();
  const sc = g.spawnCfg;
  const rooms = g.rooms.map(r => [r.x, r.y, r.w, r.h, hex(r.c), r.name]);
  const walls = g.walls.map(w => [num(w.x1), num(w.y1), num(w.x2), num(w.y2), w.door ? 1 : 0]);
  const blocks = g.lowCovers.map(c => [num(c.x), num(c.y), num(c.w), num(c.h)]);
  const red = sc.red[id] || sc.red.house;
  const blues = (sc.blue[id] || sc.blue.house).defs;
  const spawns = [[red.player[0], red.player[1], '#ff8a7a', RED_LABEL[id]]];
  blues.forEach((b, i) => spawns.push([b.x, b.y, B_BLUE[i ? 1 : 0], '蓝方·' + b.n.replace('蓝·', '')]));
  return { rooms, walls, blocks, spawns };
}
const row = a => '[' + a.map(v => (typeof v === 'string' ? "'" + v + "'" : v)).join(',') + ']';
// 紧凑排版: 每条元素占一行太占体积, 按 150 字符宽度折行
function wrapEntries(entries, indent) {
  const lines = []; let cur = indent;
  for (let i = 0; i < entries.length; i++) {
    const piece = entries[i] + (i < entries.length - 1 ? ', ' : '');
    if (cur.length + piece.length > 150 && cur.trim() !== '') { lines.push(cur.replace(/\s+$/, '')); cur = indent; }
    cur += piece;
  }
  if (cur.trim() !== '') lines.push(cur.replace(/\s+$/, ''));
  return lines.join('\n');
}
function genBlock() {
  let out = '// <map-preview-data:auto> —— 由 node tests/preview_test.js --write 从 game/breach.html 构建器自动生成, 请勿手改:\n';
  out += '//   房间 / 墙体 / 掩体 / 出生点全部取自游戏内同一份地图数据, 改完地图重跑该命令即可同步预览。\n';
  out += 'const PREVIEW_MAPS = {\n';
  for (const id of MAP_ORDER) {
    const d = collect(id);
    out += '  ' + id + ': {\n';
    out += "    name: " + JSON.stringify(NAMES[id]) + ',\n';
    out += '    note: ' + JSON.stringify(NOTES[id]) + ',\n';
    out += '    rooms: [\n' + wrapEntries(d.rooms.map(row), '      ') + '\n    ],\n';
    out += '    walls: [\n' + wrapEntries(d.walls.map(row), '      ') + '\n    ],\n';
    out += '    blocks: [\n' + wrapEntries(d.blocks.map(row), '      ') + '\n    ],\n';
    out += '    spawns: [\n' + wrapEntries(d.spawns.map(row), '      ') + '\n    ]\n';
    out += '  }' + (id === MAP_ORDER[MAP_ORDER.length - 1] ? '' : ',') + '\n';
  }
  out += '};\n';
  out += '// </map-preview-data:auto>';
  return out;
}

const BEGIN = '// <map-preview-data:auto>';
const END = '// </map-preview-data:auto>';
function extract(raw, file) {
  const i = raw.indexOf(BEGIN), j = raw.indexOf(END);
  if (i < 0 || j < 0) { console.log('FAIL: ' + file + ' 缺少预览数据自动生成区标记'); return null; }
  return raw.slice(i, j + END.length);
}
const FILES = ['index.html', path.join('game', 'hub.html')];
const want = genBlock();
const write = process.argv.includes('--write');
let bad = 0;
for (const rel of FILES) {
  const p = path.join(DIR, rel);
  const raw = fs.readFileSync(p, 'utf8');
  const cur = extract(raw, rel);
  if (cur === null) { bad++; continue; }
  if (cur === want) { console.log('ok: ' + rel + ' 预览数据与游戏地图一致 (' + want.split('\n').length + ' 行)'); continue; }
  if (write) {
    fs.writeFileSync(p, raw.replace(cur, want), 'utf8');
    console.log('wrote: ' + rel + ' 预览数据已按游戏地图重新生成');
  } else { console.log('FAIL: ' + rel + ' 预览数据与游戏地图不一致(运行 node tests/preview_test.js --write 同步)'); bad++; }
}
if (bad && !write) { console.log('PREVIEW SYNC FAILED'); process.exit(1); }
console.log(write ? 'PREVIEW SYNC WRITTEN' : 'PREVIEW SYNC PASSED');
