// 收入指數化：per-series 基期（原 bug：基期月該序列為 0 → 顯示 +0% 且整條線不畫）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

// renderStats 內的區域函式 → 依同一份邏輯重建（與原始碼並行維護，下方有一致性檢查）
const mk = (rows, closed, last) => new Function('rows', 'closed', 'last', `
'use strict';
const baseRow = closed[0] || rows[0];
const baseOf = (key) => {
  const r = rows.find(x => x[key] > 0);
  return r ? { month: r.month, val: r[key] } : null;
};
const idxOf = (key) => {
  const b = baseOf(key);
  return b ? rows.map(r => (r[key] != null ? r[key] / b.val * 100 : null)) : rows.map(() => null);
};
const growthTxt = (key) => {
  const b = baseOf(key);
  if (!b || last[key] == null) return '—';
  const g = Math.round((last[key] / b.val - 1) * 100);
  const sign = g > 0 ? '+' : '';
  return \`\${sign}\${g}%\` + (b.month !== baseRow.month ? \`(自 \${b.month})\` : '');
};
return { baseOf, idxOf, growthTxt, baseMonth: baseRow.month };
`)(rows, closed, last);

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

// 真實形狀：2023-12 起算，mskIR 前三個月為 0，2024-03 才有值
const ROWS = [
  { month: '2023-12', total: 339480, reading: 319424, ir: 20056, mskIR: 0,     isOpen: false },
  { month: '2024-01', total: 350000, reading: 324793, ir: 25207, mskIR: 0,     isOpen: false },
  { month: '2024-02', total: 360000, reading: 332664, ir: 27336, mskIR: 0,     isOpen: false },
  { month: '2024-03', total: 380000, reading: 339849, ir: 40151, mskIR: 5420,  isOpen: false },
  { month: '2026-06', total: 332690, reading: 268305, ir: 63767, mskIR: 15361, isOpen: false },
];
const CLOSED = ROWS.filter(r => !r.isOpen);
const LAST = ROWS[ROWS.length - 1];
const A = mk(ROWS, CLOSED, LAST);

console.log('--- 原 bug：基期月 mskIR = 0 ---');
{
  chk('圖表基期是 2023-12', A.baseMonth === '2023-12');
  chk('mskIR 自身基期為 2024-03', A.baseOf('mskIR').month === '2024-03', A.baseOf('mskIR'));
  const t = A.growthTxt('mskIR');
  chk('不再顯示 +0%', !t.startsWith('+0%'), t);
  chk('顯示 +183%', t.startsWith('+183%'), t);
  chk('標注自身基期', t.includes('(自 2024-03)'), t);
}

console.log('--- 原 bug：MSK IR 折線完全畫不出來 ---');
{
  const v = A.idxOf('mskIR');
  const drawn = v.filter(x => x != null).length;
  chk('有畫得出來的點', drawn > 0, drawn);
  chk('2024-03 起為 100', v[3] === 100, v[3]);
  chk('最後一月 = 283.4', Math.round(v[4] * 10) / 10 === 283.4, v[4]);
  chk('mskIR=0 的月份仍畫在 0(不是 null)', v[0] === 0 && v[1] === 0 && v[2] === 0, v.slice(0, 3));
}

console.log('--- 負成長不再印成 +-2% ---');
{
  chk('total 為負 → 開頭是 -', A.growthTxt('total').startsWith('-'), A.growthTxt('total'));
  chk('沒有 +- 這種寫法', !A.growthTxt('total').includes('+-'), A.growthTxt('total'));
  chk('reading 同樣正確', A.growthTxt('reading').startsWith('-'), A.growthTxt('reading'));
}

console.log('--- 基期與圖表基期相同時不加註記 ---');
{
  const t = A.growthTxt('total');   // total 從 2023-12 就有值
  chk('total 不加「(自 …)」', !t.includes('(自'), t);
  chk('ir 也不加', !A.growthTxt('ir').includes('(自'), A.growthTxt('ir'));
}

console.log('--- 整個序列都是 0 → 顯示 — 而非 +0% ---');
{
  const rows2 = ROWS.map(r => ({ ...r, mskIR: 0 }));
  const B = mk(rows2, rows2, rows2[rows2.length - 1]);
  chk('growthTxt 回傳 —', B.growthTxt('mskIR') === '—', B.growthTxt('mskIR'));
  chk('idxOf 全 null(不畫線)', B.idxOf('mskIR').every(v => v === null));
}

console.log('--- 與 index.html 實際程式碼一致性 ---');
{
  chk('原始碼已改用 per-series baseOf', /const baseOf = \(key\) => \{[\s\S]*?rows\.find\(x => x\[key\] > 0\)/.test(src));
  chk('原始碼負號處理存在', /const sign = g > 0 \? '\+' : '';/.test(src));
  chk('原始碼不再有寫死的 +${growth', !/\+\$\{growth\('/.test(src));
  chk('標題不再寫死單一基期月', !/收入指數化\(\$\{baseRow\.month\}=100\)/.test(src));
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
