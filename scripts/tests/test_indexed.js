// 收入指數化：per-series 基期（原 bug：基期月該序列為 0 → 顯示 +0% 且整條線不畫）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

// renderStats 內的區域函式 → 依同一份邏輯重建（與原始碼並行維護，下方有一致性檢查）
const IDX_BASE_MONTH = (src.match(/const IDX_BASE_MONTH = '([\d-]+)'/) || [])[1];
const mk = (rows, closed, last, baseMonth = IDX_BASE_MONTH) => new Function('rows', 'closed', 'last', 'IDX_BASE_MONTH', `
'use strict';
const idxLast = closed.length ? closed[closed.length - 1] : last;
const idxBaseRow = rows.find(r => r.month === IDX_BASE_MONTH);
const baseOf = (key) => {
  if (idxBaseRow && idxBaseRow[key] > 0) return { month: idxBaseRow.month, val: idxBaseRow[key] };
  const r = rows.find(x => x[key] > 0);
  return r ? { month: r.month, val: r[key] } : null;
};
const idxOf = (key) => {
  const b = baseOf(key);
  return b ? rows.map(r => (r[key] != null ? r[key] / b.val * 100 : null)) : rows.map(() => null);
};
const growthTxt = (key) => {
  const b = baseOf(key);
  if (!b || idxLast[key] == null) return '—';
  const g = Math.round((idxLast[key] / b.val - 1) * 100);
  const sign = g > 0 ? '+' : '';
  return \`\${sign}\${g}%\` + (b.month !== IDX_BASE_MONTH ? \`(自 \${b.month})\` : '');
};
return { baseOf, idxOf, growthTxt, baseMonth: IDX_BASE_MONTH, endMonth: idxLast.month };
`)(rows, closed, last, baseMonth);

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

// 真實數值：2023-12 起算，mskIR 前三個月為 0（2024-03 才有值）；終點取最後一個完整月
const ROWS = [
  { month: '2023-12', total: 339480, reading: 319424, ir: 20056, mskIR: 0,     isOpen: false },
  { month: '2024-01', total: 411259, reading: 386052, ir: 25207, mskIR: 0,     isOpen: false },
  { month: '2024-02', total: 324264, reading: 296928, ir: 27336, mskIR: 0,     isOpen: false },
  { month: '2024-03', total: 428458, reading: 388307, ir: 40151, mskIR: 5420,  isOpen: false },
  { month: '2025-01', total: 462129, reading: 427695, ir: 34434, mskIR: 19206, isOpen: false },
  { month: '2026-05', total: 501217, reading: 448644, ir: 52573, mskIR: 40091, isOpen: false },
];
const CLOSED = ROWS.filter(r => !r.isOpen);
const LAST = ROWS[ROWS.length - 1];
const A = mk(ROWS, CLOSED, LAST);

console.log('--- 基期固定為 2025-01（四項皆有值 → 可互相比較）---');
{
  chk('IDX_BASE_MONTH 讀到 2025-01', IDX_BASE_MONTH === '2025-01', IDX_BASE_MONTH);
  for (const k of ['total', 'reading', 'ir', 'mskIR']) {
    chk(`${k} 基期 = 2025-01`, A.baseOf(k).month === '2025-01', A.baseOf(k));
  }
  chk('四項都不加「(自 …)」註記', ['total','reading','ir','mskIR'].every(k => !A.growthTxt(k).includes('(自')),
      ['total','reading','ir','mskIR'].map(k => A.growthTxt(k)));
}

console.log('--- 成長率與實際資料吻合 ---');
{
  chk('Total +8%', A.growthTxt('total') === '+8%', A.growthTxt('total'));
  chk('閱片 +5%', A.growthTxt('reading') === '+5%', A.growthTxt('reading'));
  chk('IR +53%', A.growthTxt('ir') === '+53%', A.growthTxt('ir'));
  chk('MSK IR +109%（原本顯示 +0%）', A.growthTxt('mskIR') === '+109%', A.growthTxt('mskIR'));
}

console.log('--- 原 bug：MSK IR 折線畫得出來 ---');
{
  const v = A.idxOf('mskIR');
  chk('每個月都有值', v.every(x => x != null), v);
  chk('2025-01 為 100', v[4] === 100, v[4]);
  chk('基期之前的月份照樣畫（不是 null）', v[0] === 0 && v[3] > 0, v.slice(0, 4));
  chk('基期前 total 低於 100', A.idxOf('total')[0] < 100, A.idxOf('total')[0]);
}

console.log('--- 負成長不再印成 +-2% ---');
{
  const rowsNeg = ROWS.map(r => r.month === '2026-05' ? { ...r, total: 452000 } : r);
  const N = mk(rowsNeg, rowsNeg, rowsNeg[rowsNeg.length - 1]);
  chk('開頭是 -', N.growthTxt('total').startsWith('-'), N.growthTxt('total'));
  chk('沒有 +- 這種寫法', !N.growthTxt('total').includes('+-'), N.growthTxt('total'));
}

console.log('--- 防呆：基期月該序列為 0 → 退回自身首個有值月並標注 ---');
{
  const rows2 = ROWS.map(r => r.month === '2025-01' ? { ...r, mskIR: 0 } : r);
  const B = mk(rows2, rows2, rows2[rows2.length - 1]);
  chk('mskIR 退回 2024-03', B.baseOf('mskIR').month === '2024-03', B.baseOf('mskIR'));
  chk('有標注「(自 2024-03)」', B.growthTxt('mskIR').includes('(自 2024-03)'), B.growthTxt('mskIR'));
  chk('其他序列仍用 2025-01', B.baseOf('total').month === '2025-01');
}

console.log('--- 整個序列都是 0 → 顯示 — 而非 +0% ---');
{
  const rows3 = ROWS.map(r => ({ ...r, mskIR: 0 }));
  const B = mk(rows3, rows3, rows3[rows3.length - 1]);
  chk('growthTxt 回傳 —', B.growthTxt('mskIR') === '—', B.growthTxt('mskIR'));
  chk('idxOf 全 null(不畫線)', B.idxOf('mskIR').every(v => v === null));
}

console.log('--- 終點排除未結帳月(避免當月不完整拖成假谷底)---');
{
  // 2026-06 進行中（perfTotal 未填 → isOpen），且只有 4 天資料
  const rowsOpen = [...ROWS, { month: '2026-06', total: 83985, reading: 68624, ir: 15361, mskIR: 15361, isOpen: true }];
  const closedOnly = rowsOpen.filter(r => !r.isOpen);
  const O = mk(rowsOpen, closedOnly, rowsOpen[rowsOpen.length - 1]);
  chk('終點是 2026-05 而非進行中的 2026-06', O.endMonth === '2026-05', O.endMonth);
  chk('Total 仍是 +8%(未被當月拖成負值)', O.growthTxt('total') === '+8%', O.growthTxt('total'));
  chk('MSK IR 仍是 +109%', O.growthTxt('mskIR') === '+109%', O.growthTxt('mskIR'));
  // 折線仍要畫到進行中的當月
  chk('折線畫到 2026-06(共 7 點)', O.idxOf('total').length === 7 && O.idxOf('total')[6] != null, O.idxOf('total').length);
}

console.log('--- 全部月份都未結帳 → 退回用最後一筆 ---');
{
  const allOpen = ROWS.map(r => ({ ...r, isOpen: true }));
  const P = mk(allOpen, [], allOpen[allOpen.length - 1]);
  chk('終點退回 2026-05', P.endMonth === '2026-05', P.endMonth);
  chk('仍算得出成長率', P.growthTxt('total') === '+8%', P.growthTxt('total'));
}

console.log('--- 與 index.html 實際程式碼一致性 ---');
{
  chk('有具名基期常數', /const IDX_BASE_MONTH = '[\d-]+';/.test(src));
  chk('baseOf 優先用基期月', /if \(idxBaseRow && idxBaseRow\[key\] > 0\)/.test(src));
  chk('保留退回機制', /const r = rows\.find\(x => x\[key\] > 0\);/.test(src));
  chk('負號處理存在', /const sign = g > 0 \? '\+' : '';/.test(src));
  chk('不再有寫死的 +${growth', !/\+\$\{growth\('/.test(src));
  chk('標題顯示基期月', /收入指數化\(\$\{IDX_BASE_MONTH\} = 100\)/.test(src));
  chk('說明欄寫出基期月', /以 <b>\$\{IDX_BASE_MONTH\}<\/b> 為基期/.test(src));
  chk('說明欄寫出終點月', /算到 <b>\$\{idxLast\.month\}<\/b>\(最後一個已結帳月\)/.test(src));
  chk('終點用已結帳月', /const idxLast = closed\.length \? closed\[closed\.length - 1\] : last;/.test(src));
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
