// 全量门禁批量入口
//   node tests/run_all.js          —— 跑全部 24 个 *_test.js, 汇总通过/失败
//   node tests/run_all.js -v       —— 额外打印每个脚本的完整输出
// 探针脚本(fog_probe/map_probe/map_render/street_stuck_probe)不属于门禁, 不在此运行。
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = __dirname;
const verbose = process.argv.indexOf('-v') >= 0 || process.argv.indexOf('--verbose') >= 0;

// 顺序固定: 从便宜到贵 + 把 wall_test/perf_test 放最后(它们最慢), 便于快速失败
const ORDER = [
  'offline_test.js', 'version_test.js', 'doc_test.js', 'preview_test.js', 'protocol_test.js', 'account_test.js', 'board_test.js', 'cover_test.js',
  'render_test.js', 'smoke_test.js', 'input_state_test.js', 'shotgun_test.js', 'combat_test.js',
  'feature_test.js', 'tutorial_test.js', 'hub_test.js', 'newfeatures_test.js', 'fire_acc_test.js',
  'squad_test.js', 'street_test.js', 'meta_test.js', 'maps_test.js', 'path_test.js',
  'wall_test.js', 'perf_test.js',
];

// 检查清单与磁盘实际是否一致(新增测试忘了登记 → 立刻发现)
const onDisk = fs.readdirSync(DIR).filter(f => /_test\.js$/.test(f)).sort();
const missing = onDisk.filter(f => ORDER.indexOf(f) < 0);
const unknown = ORDER.filter(f => onDisk.indexOf(f) < 0);
if (missing.length || unknown.length) {
  console.log('run_all 清单与实际脚本不一致:');
  if (missing.length) console.log('  未登记: ' + missing.join(', '));
  if (unknown.length) console.log('  已不存在: ' + unknown.join(', '));
  process.exit(2);
}

const results = [];
let failed = 0;
const t0 = Date.now();
for (const f of ORDER) {
  const sw = Date.now();
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8' });
  const ms = Date.now() - sw;
  const out = (r.stdout || '') + (r.stderr || '');
  const verdict = out.split('\n').map(s => s.trim()).filter(s => /PASSED|通过|失败|FAIL|OK:/.test(s)).pop() || '(无结论行)';
  const okRun = r.status === 0 && !/FAIL/.test(verdict);
  if (!okRun) failed++;
  results.push({ f, status: r.status, ms, verdict, ok: okRun, out });
  console.log((okRun ? 'ok   ' : 'FAIL ') + f.padEnd(22) + String(ms).padStart(6) + 'ms  ' + verdict);
  if (verbose || !okRun) {
    for (const line of out.split('\n')) if (/FAIL|Error|错误/.test(line)) console.log('        | ' + line.trim());
  }
}
const total = Date.now() - t0;
console.log('\n' + (ORDER.length - failed) + '/' + ORDER.length + ' 通过, ' + failed + ' 失败, 总耗时 ' + (total / 1000).toFixed(1) + 's');
process.exit(failed ? 1 : 0);
