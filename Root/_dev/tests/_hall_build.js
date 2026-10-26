// ============================================================================
// 大厅页构造器(测试用)
// ----------------------------------------------------------------------------
// 宿主(游戏大厅.exe)会在启动时把 _dev\cpp\HallPage.hpp 的页面模板 + games.json 注入成
// Z:\Root\_runtime\hall.html。那个文件是**运行时产物**, 不该被测试当成输入 —— 否则测试先是
// 依赖"先跑一次 exe", 在受限环境里 exe 还可能被应用控制策略拦下, 测试就废了。
// 所以这里按宿主的规则自己组装一份等价页面, 让 tests\ 可以独立跑。
//
// ⚠ 本文件镜像 GameHall.cpp 的 buildDataJson()/writeHallPage():
//   字段名与结构必须和宿主保持一致。改了宿主的数据结构就要同步这里,
//   否则大厅页脚本取不到字段会渲染空白 —— hall_page_test.js 会立刻红。
// ============================================================================
const fs = require('fs');
const path = require('path');

// 与 GameHall.cpp 的 pctEncode() 等价: 保留 URL 安全字符, 其余百分号编码
function pctEncode(rel) {
  return String(rel).split('/').map(seg =>
    encodeURIComponent(seg).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  ).join('/');
}

function fileBase(root) {
  return 'file:///' + root.split(path.sep).join('/').replace(/\/?$/, '/');
}

// 等价于 GameHall.cpp::buildDataJson()
function buildData(root, manifest, host) {
  const base = fileBase(root);
  const exists = rel => fs.existsSync(path.join(root, String(rel).split('/').join(path.sep)));
  return {
    title: manifest.title || '游戏大厅',
    subtitle: manifest.subtitle || '',
    base: base,
    host: !!host,
    groups: (manifest.groups || []).map(gr => ({
      id: gr.id, name: gr.name, icon: gr.icon || 'fa-folder', hint: gr.hint || ''
    })),
    games: manifest.games.map(g => ({
      id: g.id, name: g.name, group: g.group, kind: g.kind,
      path: g.path, url: base + pctEncode(g.path),
      cover: g.cover || 'fa-gamepad', accent: g.accent || '#4f8cff',
      desc: g.desc || '', featured: !!g.featured, exists: exists(g.path),
      tags: g.tags || [],
      modes: (g.modes || []).map(m => ({
        id: m.id, name: m.name, icon: m.icon || 'fa-circle-play',
        path: m.path, url: base + pctEncode(m.path),
        desc: m.desc || '', exists: exists(m.path)
      }))
    }))
  };
}

// 取出 cpp\HallPage.hpp 里的页面模板(LR"HALLPAGE( ... )HALLPAGE")
function readTemplate(root) {
  const hpp = fs.readFileSync(path.join(root, '_dev', 'cpp', 'HallPage.hpp'), 'utf8');
  const a = hpp.indexOf('LR"HALLPAGE(');
  const b = hpp.lastIndexOf(')HALLPAGE"');
  if (a < 0 || b < 0) throw new Error('HallPage.hpp 里找不到 LR"HALLPAGE( ... )HALLPAGE" 页面模板');
  return hpp.slice(a + 'LR"HALLPAGE('.length, b);
}

// 组装出完整大厅页(等价于宿主写出的 _runtime\hall.html)
function buildHallPage(root, opts) {
  const o = opts || {};
  const manifest = o.manifest || JSON.parse(fs.readFileSync(path.join(root, 'games.json'), 'utf8'));
  let page = readTemplate(root);
  if (page.indexOf('__HALL_DATA__') < 0) throw new Error('页面模板里没有 __HALL_DATA__ 占位符');
  return page.replace('__HALL_DATA__', JSON.stringify(buildData(root, manifest, o.host !== false)));
}

module.exports = { buildHallPage, buildData, readTemplate, fileBase, pctEncode };
