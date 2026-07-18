// 實際用凍結 EMPTY_DAY 跑一遍唯讀計算鏈,確認不會 throw、且回傳合理值
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
function extractConst(name) {
  const re = new RegExp('const ' + name + ' = ');
  const m = src.match(re);
  const start = m.index;
  let i = src.indexOf('=', start), depth = 0, started = false;
  for (; i < src.length; i++) {
    if (src[i] === '{' || src[i] === '[' || src[i] === '(') { depth++; started = true; }
    else if (src[i] === '}' || src[i] === ']' || src[i] === ')') { depth--; if (started && depth === 0) return src.slice(start, i + 1) + ';'; }
  }
  throw new Error('unbalanced const: ' + name);
}

const parts = [
  extractConst('COUNTS_SCHEMA'),
  extractConst('EMPTY_DAY'),
  extractFn('getCount'), extractFn('getSpecialOthers'),
  extractFn('specialOthersTotalCount'), extractFn('specialOthersTotalRev'),
  extractFn('calcCountTotal'), extractFn('calcBaseRevenue'),
  extractFn('calcProcRevenue'), extractFn('calcMeetingRevenue'),
  extractFn('calcOvertimeRevenue'), extractFn('calcAddonRevenue'),
  extractFn('getDayProcRevenue'), extractFn('getDayRevenue'), extractFn('isImportedDay'),
  extractFn('peekDay'),
];

const prices = { ct:{opd:350,er_adm_self:420,ldct_health:554,ph:0}, mr:{opd:700,er_adm_health:840,ph:0},
  bmd:401, special:{swal:90,hsg:210,eso_tbe:90}, xray:{opd:25,portable:0,er:33,ph:0}, consult:0, sono:150, opd:51 };
const settings = { unitPrices: prices, overtimeRate: 600, atomicItems: [], presets: [] };

const code = `
'use strict';   // 對齊實際環境:<script type="module"> 一律 strict
const state = { data: { days: {}, settings: ${JSON.stringify(settings)} } };
${parts.join('\n')}
const d = peekDay('2026-12-25');           // 不存在的日期
const results = {
  frozen: Object.isFrozen(d),
  daysCreated: Object.keys(state.data.days).length,   // 必須是 0（沒建檔）
  hasUpdatedAt: 'updatedAt' in d,
  getCount: getCount(d, 'ct.opd'),
  countTotal: calcCountTotal(d),
  baseRev: calcBaseRevenue(d, state.data.settings),
  procRev: calcProcRevenue(d),
  mtgRev: calcMeetingRevenue(d),
  otRev: calcOvertimeRevenue(d, state.data.settings),
  addonRev: calcAddonRevenue(d),
  dayRev: getDayRevenue(d, state.data.settings),
  imported: isImportedDay(d),
  specialCnt: specialOthersTotalCount(d),
  specialRev: specialOthersTotalRev(d),
};
let writeThrew = false;
try { d.notes = 'x'; } catch (e) { writeThrew = true; }
results.writeThrows = writeThrew;
return results;
`;

try {
  const r = new Function(code)();
  console.log('--- 凍結空天讀取結果 ---');
  for (const [k, v] of Object.entries(r)) console.log('  ' + k.padEnd(14), v);
  const ok = r.frozen === true && r.daysCreated === 0 && r.hasUpdatedAt === false
    && r.dayRev === 0 && r.countTotal === 0 && r.writeThrows === true;
  console.log(ok ? '\n✓ PASS：純瀏覽不建檔、無 updatedAt、計算全部回 0、誤寫會 throw' : '\n✗ FAIL');
} catch (e) {
  console.error('✗ 讀取凍結空天時 throw:', e.message);
  process.exit(1);
}
