// 文档/导航一致性测试
// 目的: 让"文件头目录"与"README 里的数字"不再腐烂 ——
//   1. 每个页面的 `// ---------- 章节 ----------` 标记必须全部出现在文件头 TOC 中, 且顺序一致;
//   2. TOC 里不得留下已删除的章节名(反向包含);
//   3. AI_README.md 里声明的断言测试数量必须等于 tests/ 下实际数量。
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
function readFile(p) { return fs.readFileSync(path.join(DIR, p), 'utf8'); }

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('ok: ' + msg); } else { fail++; console.log('FAIL: ' + msg); } }

// ---------- 1/2. 各页章节 vs 文件头 TOC ----------
// 页面: [文件, TOC 起止标记]
const PAGES = [
  ['game/breach.html', '【目录 TABLE OF CONTENTS】', '============================================================================ */'],
];
const SECTION_RE = /^\s*\/\/ -{6,}\s*(.+?)\s*-{6,}\s*$/gm;

for (const [file, tocStart, tocEnd] of PAGES) {
  const raw = readFile(file);
  const sections = [];
  let m;
  const re = new RegExp(SECTION_RE.source, 'gm');
  while ((m = re.exec(raw)) !== null) sections.push(m[1]);

  const i0 = raw.indexOf(tocStart);
  ok(i0 >= 0, file + ': 存在文件头 TOC 块(' + tocStart + ')');
  const iEnd = i0 >= 0 ? raw.indexOf(tocEnd, i0) : -1;
  const tocBlock = (i0 >= 0 && iEnd > i0) ? raw.slice(i0, iEnd) : '';
  ok(tocBlock.length > 0, file + ': TOC 块非空');

  // 顺序一致: 每个章节名按顺序在 TOC 里出现
  let cursor = 0, missing = [], outOfOrder = [];
  for (const name of sections) {
    const at = tocBlock.indexOf(name, cursor);
    if (at < 0) {
      // 可能整体缺失, 也可能顺序错了
      if (tocBlock.indexOf(name) >= 0) outOfOrder.push(name); else missing.push(name);
    } else cursor = at + name.length;
  }
  ok(sections.length >= 40, file + ': 解析到 ' + sections.length + ' 个章节标记');
  ok(missing.length === 0, file + ': TOC 覆盖全部章节(缺失: ' + missing.join(' | ') + ')');
  ok(outOfOrder.length === 0, file + ': TOC 章节顺序与代码一致(乱序: ' + outOfOrder.join(' | ') + ')');

  // 反向: TOC 中列出的章节必须仍然存在(删章节后忘了改 TOC 也会被抓到)
  // 目录行格式: `  12  章节名 .......... 1397` 或 `  12  章节名 ............` —— 取序号后的标题部分
  const tocNames = [];
  for (const line of tocBlock.split('\n')) {
    const t = line.trim();
    const mm = t.match(/^\d+\s+(.+?)(?:\s*\.{3,}.*)?$/);
    if (!mm) continue;
    const name = mm[1].trim();
    if (!name || name.indexOf('【') >= 0) continue;
    tocNames.push(name);
  }
  ok(tocNames.length >= 40, file + ': 目录可解析出 ' + tocNames.length + ' 条章节名');
  const stale = tocNames.filter(n => sections.indexOf(n) < 0);
  ok(stale.length === 0, file + ': TOC 无已失效条目(残留: ' + stale.join(' | ') + ')');
  // 目录条数与实际章节数一致(多一条/少一条都算腐烂)
  ok(tocNames.length === sections.length, file + ': 目录条数 === 实际章节数 (' + tocNames.length + ' vs ' + sections.length + ')');
}

// ---------- 3. README 声明的测试数量 vs 实际 ----------
{
  const testFiles = fs.readdirSync(path.join(DIR, 'tests')).filter(f => /_test\.js$/.test(f));
  const probeFiles = fs.readdirSync(path.join(DIR, 'tests')).filter(f => /_probe\.js$/.test(f));
  const readme = readFile('AI_README.md');
  const claim = readme.match(/共\s*\*\*(\d+)\*\*\s*个\s*`\*_test\.js`/);
  ok(!!claim, 'AI_README 声明了断言测试数量(共 **N** 个 *_test.js)');
  ok(claim && Number(claim[1]) === testFiles.length,
    'AI_README 的测试数量与实际一致 (声明 ' + (claim ? claim[1] : '?') + ' vs 实际 ' + testFiles.length + ')');
  const claimProbe = readme.match(/另有\s*`fog_probe\.js`/);
  ok(!!claimProbe, 'AI_README 提到了 fog_probe 探针');
  ok(probeFiles.length >= 2, 'tests/ 下探针脚本数量合理 (' + probeFiles.join(',') + ')');
  // README 的"文件结构"一节也要给出正确数量
  const treeClaim = readme.match(/(\d+)\s*个断言测试/);
  ok(treeClaim && Number(treeClaim[1]) === testFiles.length,
    'AI_README 文件结构一节的测试数量一致 (声明 ' + (treeClaim ? treeClaim[1] : '?') + ' vs ' + testFiles.length + ')');
  // 每个 *_test.js 都应出现在 README 的测试清单里(避免"加了测试但没写文档")
  const listed = readme.slice(readme.indexOf('```bash'), readme.indexOf('```', readme.indexOf('```bash') + 6));
  const notListed = testFiles.filter(f => listed.indexOf(f) < 0);
  ok(notListed.length === 0, 'AI_README 测试清单覆盖全部断言脚本(缺: ' + notListed.join(', ') + ')');
}

console.log(fail ? '\n' + fail + ' 项失败 / ' + pass + ' 项通过' : '\nDOC TEST PASSED: ' + pass + ' 项通过, 0 失败');
process.exit(fail ? 1 : 0);
