// Worknum 存檔/同步邏輯驗證 — 一次跑完所有測試
//   用法：node scripts/tests/run_all.js
//
// 這些腳本用「大括號配對」直接從 index.html 抽出函式原始碼來跑，
// 所以不需要 build / 不需要改動 index.html 就能驗證。
// ⚠️ 函式改名時，測試裡的抽取名稱要跟著改。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname)
  .filter(f => f.startsWith('test_') && f.endsWith('.js'))
  .sort();

let failed = 0;
const results = [];
for (const f of files) {
  let out = '', ok = true;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  } catch (e) {
    ok = false;
    out = (e.stdout || '') + (e.stderr || '');
    failed++;
  }
  const last = out.trim().split('\n').filter(l => /PASS|FAIL/.test(l)).pop() || '(無結果)';
  results.push({ f, ok, last });
}

console.log('=== Worknum 同步邏輯測試 ===\n');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.f.padEnd(22)} ${r.last.trim()}`);
console.log('');
if (failed) {
  console.log(`✗ ${failed} 支測試失敗 — 詳細輸出請單獨執行該支`);
  process.exit(1);
}
console.log(`✓ 全部 ${files.length} 支通過`);
