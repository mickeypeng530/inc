// 中興醫院(外院)獨立計價(2026-08-05)
// 兩個重點:① 計價 = 件數 × 單價(基本十份自成一個計數項,**沒有階梯邏輯**)
// ② 與主帳的**結構性隔離** —— calcBaseRevenue 絕不能看到 day.xh
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
function grabConstBlock(name) {
  const i = src.indexOf('const ' + name);
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '[') { d++; st = true; }
    else if (c === '}' || c === ']') { d--; if (st && d === 0) return src.slice(i, j + 1) + ';'; }
  }
}
const PRICES = { bmd:120, consult:200, ct:{er_adm_self:420, ldct_health:554, opd:350, ph:350},
  mr:{er_adm_health:840, opd:700, ph:700}, opd:500, sono:150,
  special:{swal:231, hsg:210}, xray:{er:33, opd:25, portable:25, ph:25} };
const api = new Function('PRICES', `
  const state = { data: { settings: { unitPrices: PRICES } } };
  ${grabConstBlock('XH_SCHEMA')}
  ${grabConstBlock('XH_PRICE_DEFAULT')}
  ${grabFn('xhPrices')} ${grabFn('xhCount')} ${grabFn('xhTotalCount')} ${grabFn('calcXhRevenue')}
  ${grabFn('getCount')} ${grabFn('specialOthersTotalRev')} ${grabFn('getSpecialOthers')}
  ${grabFn('calcBaseRevenue')}
  return { calcXhRevenue, xhTotalCount, calcBaseRevenue };
`)(PRICES);

let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } }
const S = { unitPrices: PRICES };
const R = (xh) => api.calcXhRevenue({ xh }, S);

console.log('');
console.log('[1] 計價 = 件數 × 單價(基本十份自成一項,沒有階梯邏輯)');
check('只有基本 10 份 → $10,000', R({ mriBase: 10 }) === 10000, String(R({ mriBase: 10 })));
check('基本 10 + 額外打藥 5 → $15,000', R({ mriBase: 10, mriC: 5 }) === 15000, String(R({ mriBase: 10, mriC: 5 })));
check('基本 10 + 額外不打藥 5 → $14,000', R({ mriBase: 10, mriNc: 5 }) === 14000, String(R({ mriBase: 10, mriNc: 5 })));
check('額外打藥比不打藥每份多 $200',
      R({ mriC: 1 }) - R({ mriNc: 1 }) === 200, `${R({ mriC: 1 })} vs ${R({ mriNc: 1 })}`);
check('基本份數可改(某天只有 8 份)→ $8,000', R({ mriBase: 8 }) === 8000, String(R({ mriBase: 8 })));

console.log('');
console.log('[2] Ca / CT 各自獨立計價');
check('Ca 3 份 → $600', R({ ca: 3 }) === 600, String(R({ ca: 3 })));
check('CT 打藥 2 → $1,400', R({ ctC: 2 }) === 1400, String(R({ ctC: 2 })));
check('CT 不打藥 4 → $1,800', R({ ctNc: 4 }) === 1800, String(R({ ctNc: 4 })));
check('綜合:基本10 + 額外打藥3 + 不打藥2 + Ca1 + CT打1 + CT不打2',
      R({ mriBase: 10, mriC: 3, mriNc: 2, ca: 1, ctC: 1, ctNc: 2 })
      === 10000 + 3000 + 1600 + 200 + 700 + 900,
      String(R({ mriBase: 10, mriC: 3, mriNc: 2, ca: 1, ctC: 1, ctNc: 2 })));

console.log('');
console.log('[3] 邊界');
check('空 day → 0', api.calcXhRevenue({}, S) === 0);
check('xh 全 0 → 0', R({ mriBase: 0, mriC: 0, mriNc: 0, ca: 0, ctC: 0, ctNc: 0 }) === 0);
check('件數統計含基本份數', api.xhTotalCount({ xh: { mriBase: 10, mriC: 3, ca: 2 } }) === 15);
check('壞值當 0', R({ mriBase: 'x', mriC: null, ca: undefined }) === 0);

console.log('');
console.log('[4] ⭐ 結構性隔離:主帳的 calcBaseRevenue 絕不能看到 xh');
{
  const base = { counts: { ct: { opd: 3 }, mr: { opd: 2 } } };
  const withXh = { counts: { ct: { opd: 3 }, mr: { opd: 2 } },
                   xh: { mriBase: 10, mriC: 20, mriNc: 20, ca: 20, ctC: 20, ctNc: 20 } };
  const a = api.calcBaseRevenue(base, S), b = api.calcBaseRevenue(withXh, S);
  check('加了一大筆 xh,主帳金額完全不動', a === b, `${a} vs ${b}`);
  check('主帳金額仍是計數算出來的 3×350 + 2×700 = 2,450', a === 2450, String(a));
  check('而中興自己算得出 $40,000+', api.calcXhRevenue(withXh, S) > 40000, String(api.calcXhRevenue(withXh, S)));
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
