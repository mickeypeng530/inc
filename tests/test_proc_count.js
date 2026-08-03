// Procedure 分項計次(2026-07-31 修)
// 病根:includeInStats 設在 atomic 上,但「該不該獨立計次」取決於它出現在哪個 preset。
// 舊版逐 item 各計一次 → 組合項被算成兩次(2026-07 實測 50 筆算成 58 次)。
// 現在改成「一筆記錄 = 一次,歸到主 item」。
const fs = require('fs');
const src = fs.readFileSync('C:/Users/彭嗣翔/Claude_Work/Worknum/index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('括號沒配對 ' + name);
}

// 真實 catalog 的關鍵子集(取自使用者雲端設定,2026-07-31)
const ATOMS = [
  { id: 'picc',  name: 'PICC',  amount: 1034, includeInStats: true,  isMSK: false },
  { id: 'av',    name: 'AV',    amount: 2100, includeInStats: true,  isMSK: false },
  { id: 'pcn',   name: 'PCN',   amount: 3000, includeInStats: true,  isMSK: false },
  { id: 'ap',    name: 'A-P',   amount: 315,  includeInStats: false, isMSK: false },
  { id: 'nb',    name: 'NB',    amount: 733,  includeInStats: true,  isMSK: true  },
  { id: 'arthro',name: 'Arthro',amount: 360,  includeInStats: true,  isMSK: true  },
  { id: 'ct_nb', name: 'CT NB', amount: 3387, includeInStats: true,  isMSK: true  },
  { id: 'atom_1785317222471', name: '1site', amount: 800, includeInStats: true, isMSK: false },
  { id: 'cstame',name: 'c(s)TAME', amount: 8800, includeInStats: true, isMSK: true, countsAs: 'stame' },
  { id: 'stame', name: 'sTAME', amount: 1950, includeInStats: true, isMSK: true },
];
function makeApi(days) {
  return new Function('DAYS', 'ATOMS', `
    const state = { data: { days: DAYS, settings: { atomicItems: ATOMS } } };
    ${grabFn('computeProcBreakdown')}
    return computeProcBreakdown;`)(days, ATOMS);
}
const M = '2026-07';
const day = (procs) => ({ [M + '-15']: { procedures: procs } });
const rec = (name, items) => ({ presetName: name, items });

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('');
console.log('[1] 組合 preset 只算一次(病根)');
{
  const r = makeApi(day([
    rec('PICC+AV', [{ atomicId: 'picc', amount: 1034 }, { atomicId: 'av', amount: 2100 }]),
  ]))(M);
  check('總次數 = 1(不是 2)', r.totalCount === 1, '實際 ' + r.totalCount);
  check('歸到 PICC 不是 AV(取第一個 item,不是金額最高)',
        !!r.buckets['PICC'] && !r.buckets['AV'], JSON.stringify(Object.keys(r.buckets)));
  check('金額照實全加 $3,134', r.totalAmount === 3134, '實際 ' + r.totalAmount);
}

console.log('');
console.log('[2] ⚠ arthro 的反例 —— 同一個 atomic,兩種身分');
{
  // 獨立 Arthro:必須計次
  const solo = makeApi(day([rec('Arthro', [{ atomicId: 'arthro', amount: 360 }])]))(M);
  check('獨立 Arthro 算 1 次', solo.totalCount === 1 && solo.buckets['Arthro'].count === 1);

  // NB arthro:arthro 是成分,不可再獨立算一次
  const combo = makeApi(day([
    rec('NB arthro', [{ atomicId: 'nb', amount: 733 }, { atomicId: 'arthro', amount: 360 }]),
  ]))(M);
  check('NB arthro 算 1 次(不是 2)', combo.totalCount === 1, '實際 ' + combo.totalCount);
  check('歸到 NB', !!combo.buckets['NB'] && !combo.buckets['Arthro'], JSON.stringify(Object.keys(combo.buckets)));
  check('金額 $1,093', combo.totalAmount === 1093, '實際 ' + combo.totalAmount);
}

console.log('');
console.log('[3] includeInStats:false 的附屬項 —— 不計次但金額要算');
{
  const r = makeApi(day([
    rec('PCN+A-P', [{ atomicId: 'pcn', amount: 3000 }, { atomicId: 'ap', amount: 315 }]),
  ]))(M);
  check('算 1 次', r.totalCount === 1);
  check('歸到 PCN', !!r.buckets['PCN'] && !r.buckets['A-P']);
  check('金額含 A-P = $3,315(金額照實算)', r.totalAmount === 3315, '實際 ' + r.totalAmount);
}

console.log('');
console.log('[4] countsAs 歸戶仍有效');
{
  const r = makeApi(day([rec('c(s)TAME', [{ atomicId: 'cstame', amount: 8800 }])]))(M);
  check('c(s)TAME 歸到 sTAME 計次', !!r.buckets['sTAME'], JSON.stringify(Object.keys(r.buckets)));
  check('金額仍是 $8,800(收多少算多少)', r.totalAmount === 8800);
}

console.log('');
console.log('[5] 使用者自建的組合(CT NB & 2000 site)');
{
  const r = makeApi(day([
    rec('CT NB & 2000 site', [{ atomicId: 'ct_nb', amount: 3387 }, { atomicId: 'atom_1785317222471', amount: 800 }]),
  ]))(M);
  check('算 1 次', r.totalCount === 1, '實際 ' + r.totalCount);
  check('歸到 CT NB', !!r.buckets['CT NB'] && !r.buckets['1site']);
  check('MSK 計次跟著主 item(CT NB 是 MSK)', r.mskCount === 1);
}

console.log('');
console.log('[6] 多筆混合 —— 總數 = 記錄筆數');
{
  const r = makeApi(day([
    rec('PICC+AV', [{ atomicId: 'picc', amount: 1034 }, { atomicId: 'av', amount: 2100 }]),
    rec('NB arthro', [{ atomicId: 'nb', amount: 733 }, { atomicId: 'arthro', amount: 360 }]),
    rec('Arthro', [{ atomicId: 'arthro', amount: 360 }]),
    rec('CT NB', [{ atomicId: 'ct_nb', amount: 3387 }]),
  ]))(M);
  check('4 筆記錄 = 4 次(舊版會算成 6)', r.totalCount === 4, '實際 ' + r.totalCount);
  check('Arthro 獨立那筆仍單獨成 bucket', r.buckets['Arthro'].count === 1);
  check('NB 1 次', r.buckets['NB'].count === 1);
  check('總金額 $5,974', r.totalAmount === 1034 + 2100 + 733 + 360 + 360 + 3387, '實際 ' + r.totalAmount);
}

console.log('');
console.log('[7] 未登錄 atomic(sheet 匯入的新 aid)仍走 snapshot name');
{
  const r = makeApi(day([rec('TAE spinal', [{ atomicId: 'tae_spinal', name: 'TAE spinal', amount: 12300 }])]))(M);
  check('TAE 家族合併到 TAE bucket', !!r.buckets['TAE'], JSON.stringify(Object.keys(r.buckets)));
  check('算 1 次', r.totalCount === 1);
}

console.log('');
console.log('[8] 空 items 的記錄不可炸掉也不可計次');
{
  const r = makeApi(day([rec('壞資料', []), rec('CT NB', [{ atomicId: 'ct_nb', amount: 3387 }])]))(M);
  check('只算 1 次', r.totalCount === 1, '實際 ' + r.totalCount);
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
