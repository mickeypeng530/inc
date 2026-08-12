// 中興醫院(外院)獨立計價 + 單日匯入
// 三個重點:① 計價 = 件數 × 單價(基本十份自成一個計數項,**沒有階梯邏輯**)
// ② 與主帳的**結構性隔離** —— calcBaseRevenue 絕不能看到 day.xh,匯入也不是例外
// ③ 匯入是「取代當天」不是累加
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
  const DAYS = {};
  let saved = 0, touched = [];
  const state = { currentDate: '2026-08-07', data: { days: DAYS, settings: { unitPrices: PRICES } } };
  const storage = { save: () => { saved++; } };
  function getDay(d) { if (!DAYS[d]) DAYS[d] = { counts: {}, procedures: [], meetings: [] }; return DAYS[d]; }
  function peekDay(d) { return DAYS[d] || { counts: {} }; }
  function touchDay(d) { touched.push(d); }
  ${grabConstBlock('XH_SCHEMA')}
  ${grabConstBlock('XH_PRICE_DEFAULT')}
  ${grabFn('normalizeTime')} ${grabFn('spanMinutes')}
  ${grabFn('xhPrices')} ${grabFn('xhCount')} ${grabFn('xhTotalCount')} ${grabFn('calcXhRevenue')}
  ${grabFn('parseXhRow')} ${grabFn('applyXhRow')}
  ${grabFn('dayDuration')}
  ${grabFn('getCount')} ${grabFn('specialOthersTotalRev')} ${grabFn('getSpecialOthers')}
  ${grabFn('calcBaseRevenue')}
  return { calcXhRevenue, xhTotalCount, calcBaseRevenue, parseXhRow, applyXhRow, dayDuration,
           DAYS, getDay, savedCount: () => saved, touchedList: () => touched };
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

// ============================================================
console.log('');
console.log('[5] parseXhRow —— 一列 TSV「日期 ⇥ 起 ⇥ 訖 ⇥ 6 個件數」');
{
  const P = api.parseXhRow;
  const full = P('2026-08-07\t09:30\t17:30\t10\t0\t5\t5\t0\t4');
  check('日期解析', full.date === '2026-08-07', String(full.date));
  check('起訖解析', full.start === '09:30' && full.end === '17:30', `${full.start}/${full.end}`);
  check('六個件數對位', JSON.stringify(full.counts) ===
        JSON.stringify({ mriBase: 10, mriC: 0, mriNc: 5, ca: 5, ctC: 0, ctNc: 4 }), JSON.stringify(full.counts));
  check('沒有警告', full.warnings.length === 0, JSON.stringify(full.warnings));

  // 省略日期:8 格 = 起訖 + 6 件數
  const noDate = P('09:30\t17:30\t10\t0\t5\t5\t0\t4');
  check('省略日期 → date=null,起訖仍認得', noDate.date === null && noDate.start === '09:30', JSON.stringify(noDate));
  check('省略日期時件數不位移', noDate.counts.mriBase === 10 && noDate.counts.ctNc === 4, JSON.stringify(noDate.counts));

  // 只有 6 個數字
  const bare = P('10\t0\t5\t5\t0\t4');
  check('只貼 6 個件數也認', bare.counts.mriBase === 10 && bare.counts.ctNc === 4 && bare.start === '',
        JSON.stringify(bare));

  // 日期 + 空起訖(兩個空格)
  const emptyTime = P('2026-08-07\t\t\t10\t0\t5\t5\t0\t4');
  check('起訖留空 → 空字串,件數不位移',
        emptyTime.start === '' && emptyTime.end === '' && emptyTime.counts.mriBase === 10,
        JSON.stringify(emptyTime));

  check('標題列會被跳過',
        P('日期\t起\t訖\t基本MRI\tMRI打藥\tMRI不打藥\tCa\tCT打藥\tCT不打藥\n2026-08-07\t\t\t10\t0\t5\t5\t0\t4').counts.mriBase === 10);
  check('用空白分隔也認(沒有 tab 時)',
        P('2026-08-07 09:30 17:30 10 0 5 5 0 4').counts.ctNc === 4);
  check('時間會 normalize(930 → 09:30)', P('2026-08-07\t930\t1730\t10\t0\t5\t5\t0\t4').start === '09:30',
        P('2026-08-07\t930\t1730\t10\t0\t5\t5\t0\t4').start);
  check('空輸入 → error', !!P('   ').error);

  const short = P('2026-08-07\t\t\t10\t0\t5');
  check('欄位不足 → 缺的當 0 + 警告', short.counts.ctNc === 0 && short.warnings.some(w => /只有/.test(w)),
        JSON.stringify(short.warnings));
  const long = P('2026-08-07\t\t\t10\t0\t5\t5\t0\t4\t99\t88');
  check('欄位過多 → 忽略 + 警告', long.counts.ctNc === 4 && long.warnings.some(w => /多出/.test(w)),
        JSON.stringify(long.warnings));
  const bad = P('2026-08-07\t\t\tabc\t0\t5\t5\t0\t4');
  check('壞件數 → 當 0 + 警告', bad.counts.mriBase === 0 && bad.warnings.length > 0, JSON.stringify(bad.warnings));
  check('負數 → 當 0 + 警告', P('2026-08-07\t\t\t-3\t0\t5\t5\t0\t4').counts.mriBase === 0);
}

console.log('');
console.log('[6] applyXhRow —— 取代當天,不是累加');
{
  const D = '2026-08-07';
  api.applyXhRow(D, api.parseXhRow('2026-08-07\t09:30\t17:30\t10\t0\t5\t5\t0\t4'));
  check('寫入 xh', JSON.stringify(api.DAYS[D].xh) === JSON.stringify({ mriBase: 10, mriNc: 5, ca: 5, ctNc: 4 }),
        JSON.stringify(api.DAYS[D].xh));
  check('0 的項目不留在物件裡', !('mriC' in api.DAYS[D].xh), JSON.stringify(api.DAYS[D].xh));
  check('寫入起訖', api.DAYS[D].xhStart === '09:30' && api.DAYS[D].xhEnd === '17:30');
  check('時長算得出來(09:30→17:30 = 8 時)', api.dayDuration(api.DAYS[D], 'xhStart', 'xhEnd') === 480,
        String(api.dayDuration(api.DAYS[D], 'xhStart', 'xhEnd')));

  // 再貼一次同一列 → 結果相同(可重複貼)
  const before = JSON.stringify(api.DAYS[D].xh);
  api.applyXhRow(D, api.parseXhRow('2026-08-07\t09:30\t17:30\t10\t0\t5\t5\t0\t4'));
  check('重複貼結果相同(不會變兩倍)', JSON.stringify(api.DAYS[D].xh) === before, JSON.stringify(api.DAYS[D].xh));

  // 貼一列比較少的 → 取代而非合併
  api.applyXhRow(D, api.parseXhRow('2026-08-07\t\t\t10\t0\t0\t0\t0\t0'));
  check('取代語意:舊的 mriNc/ca/ctNc 要消失',
        JSON.stringify(api.DAYS[D].xh) === JSON.stringify({ mriBase: 10 }), JSON.stringify(api.DAYS[D].xh));
  check('起訖留空 → 整個 delete(不留 undefined,RTDB 巢狀 undefined 會 throw)',
        !('xhStart' in api.DAYS[D]) && !('xhEnd' in api.DAYS[D]), JSON.stringify(Object.keys(api.DAYS[D])));

  // 全 0 → 整段拿掉
  api.applyXhRow(D, api.parseXhRow('2026-08-07\t\t\t0\t0\t0\t0\t0\t0'));
  check('全 0 → delete day.xh(RTDB 不存空物件)', !('xh' in api.DAYS[D]), JSON.stringify(api.DAYS[D]));
}

console.log('');
console.log('[7] ⭐ 匯入也不碰主帳(隔離不是靠記得,是那條路徑不存在)');
{
  const D = '2026-08-14';
  const day = api.getDay(D);
  day.counts = { ct: { opd: 3 }, mr: { opd: 2 } };
  day.procedures = [{ presetId: 'p', items: [{ amount: 5000 }] }];
  day.overtimeHours = 4;
  const mainBefore = api.calcBaseRevenue(day, S);
  const snapBefore = JSON.stringify({ c: day.counts, p: day.procedures, ot: day.overtimeHours });

  api.applyXhRow(D, api.parseXhRow('2026-08-14\t09:00\t17:00\t10\t2\t3\t4\t1\t2'));

  check('主帳金額完全不動', api.calcBaseRevenue(day, S) === mainBefore,
        `${mainBefore} → ${api.calcBaseRevenue(day, S)}`);
  check('counts / procedures / 加班 一個位元都沒變',
        JSON.stringify({ c: day.counts, p: day.procedures, ot: day.overtimeHours }) === snapBefore);
  check('但中興確實寫進去了', api.xhTotalCount(day) === 22, String(api.xhTotalCount(day)));
  check('中興金額 = 10000+2000+2400+800+700+900 = $16,800',
        api.calcXhRevenue(day, S) === 16800, String(api.calcXhRevenue(day, S)));
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
