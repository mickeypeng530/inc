// day.revenue 快照：桌寵可直接讀的當日收入（計數 + procedure + addon）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const F = (n) => {
  const s = src.indexOf('function ' + n + '(');
  if (s < 0) throw new Error('not found: ' + n);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
};
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

const PRICES = {
  ct: { opd: 350, er_adm_self: 420, ldct_health: 554, ph: 0 },
  mr: { opd: 700, er_adm_health: 840, ph: 0 },
  bmd: 401,
  special: { swal: 90, hsg: 210, eso_tbe: 90 },
  xray: { opd: 25, portable: 0, er: 33, ph: 0 },
  consult: 0, sono: 150, opd: 51,
};
const api = new Function(`
'use strict';
const state = { data: { days: {}, settings: { unitPrices: ${JSON.stringify(PRICES)} } } };
${F('getCount')}
${F('getSpecialOthers')}
${F('specialOthersTotalRev')}
${F('calcProcRevenue')}
${F('getDayProcRevenue')}
${F('calcAddonRevenue')}
${F('calcBaseRevenue')}
${F('getDay')}
${F('stampRevenue')}
${F('touchDay')}
${F('getDayRevenue')}
return { state, stampRevenue, touchDay, getDayRevenue, getDay };
`)();
const { state, stampRevenue, touchDay, getDayRevenue } = api;

console.log('--- 計數 × 單價 ---');
{
  const d = { counts: { ct: { opd: 1 } } };
  stampRevenue(d);
  chk('CT OPD 1 筆 = 350', d.revenue === 350, d.revenue);
}

console.log('--- 含 procedure 與 addon(桌寵要的「總數字」)---');
{
  const d = {
    counts: { ct: { opd: 2 }, bmd: 3 },                       // 700 + 1203 = 1903
    procedures: [{ items: [{ atomicId: 'nb', amount: 733 }] },
                 { items: [{ atomicId: 'ct_nb', amount: 3387 }] }],   // 4120
    addons: [{ type: 'd3', count: 1, amount: 600 },
             { type: 'source', count: 4, amount: 100 }],              // 1000
  };
  stampRevenue(d);
  chk('合計 = 1903 + 4120 + 1000 = 7023', d.revenue === 7023, d.revenue);
  chk('確實包含 procedure', d.revenue > 1903);
  chk('確實包含 addon', d.revenue > 1903 + 4120);
}

console.log('--- importedRevenue 是權威值,優先於計算 ---');
{
  const d = { counts: { ct: { opd: 100 } }, importedRevenue: 12345 };
  stampRevenue(d);
  chk('revenue 等於 importedRevenue', d.revenue === 12345, d.revenue);
  chk('getDayRevenue 也一致', getDayRevenue(d, state.data.settings) === 12345);
}

console.log('--- irRevenue(手算 IR 權威值)會被採用 ---');
{
  const d = {
    counts: { ct: { opd: 1 } },                                  // 350
    procedures: [{ items: [{ atomicId: 'nb', amount: 733 }] }],   // 逐筆 733,但手算是 5000
    irRevenue: 5000,
  };
  stampRevenue(d);
  chk('用手算 IR 而非逐筆', d.revenue === 5350, d.revenue);
}

console.log('--- touchDay 會同時蓋 updatedAt 與 revenue ---');
{
  state.data.days = {};
  const d = api.getDay('2026-07-19');
  d.counts = { ct: { opd: 2 } };
  touchDay('2026-07-19');
  chk('有 updatedAt', typeof d.updatedAt === 'string' && d.updatedAt.length > 10, d.updatedAt);
  chk('有 revenue = 700', d.revenue === 700, d.revenue);
}

console.log('--- 編輯後 revenue 會跟著更新(不會卡住舊值)---');
{
  state.data.days = {};
  const d = api.getDay('2026-07-19');
  d.counts = { ct: { opd: 1 } };
  touchDay('2026-07-19');
  const first = d.revenue;
  d.counts.ct.opd = 5;
  touchDay('2026-07-19');
  chk('350 → 1750', first === 350 && d.revenue === 1750, { first, now: d.revenue });
}

console.log('--- getDayRevenue 優先序:imported → revenue → 即時計算 ---');
{
  const snap = { counts: { ct: { opd: 1 } }, revenue: 9999 };
  chk('有快照時用快照', getDayRevenue(snap, state.data.settings) === 9999);
  const live = { counts: { ct: { opd: 1 } } };
  chk('無快照時即時算', getDayRevenue(live, state.data.settings) === 350);
  const imp = { counts: { ct: { opd: 1 } }, revenue: 9999, importedRevenue: 111 };
  chk('imported 最優先', getDayRevenue(imp, state.data.settings) === 111);
}

console.log('--- 改單價表不會回頭改動已快照的日子 ---');
{
  state.data.days = {};
  const d = api.getDay('2026-07-19');
  d.counts = { ct: { opd: 10 } };
  touchDay('2026-07-19');
  const before = d.revenue;                       // 3500
  state.data.settings.unitPrices.ct.opd = 400;    // 調高單價
  const after = getDayRevenue(d, state.data.settings);
  chk('歷史值鎖住(仍為 3500)', before === 3500 && after === 3500, { before, after });
  touchDay('2026-07-19');                          // 再次編輯才會套用新單價
  chk('重新編輯後才更新為 4000', d.revenue === 4000, d.revenue);
  state.data.settings.unitPrices.ct.opd = 350;
}

console.log('--- 設定未就緒時不寫殘缺值 ---');
{
  const saved = state.data.settings;
  state.data.settings = {};
  const d = { counts: { ct: { opd: 1 } } };
  stampRevenue(d);
  chk('沒有寫入 revenue', !('revenue' in d), d);
  state.data.settings = saved;
}

console.log('--- 空白日(週末/請假)= 0,不是缺值 ---');
{
  const d = { counts: {}, procedures: [], meetings: [] };
  stampRevenue(d);
  chk('revenue = 0', d.revenue === 0, d.revenue);
}

console.log('--- 原始碼:覆蓋路徑都有蓋 revenue ---');
{
  chk('貼整月有 stampRevenue', /stampRevenue\(state\.data\.days\[k\]\)/.test(src));
  chk('匯入歷史 JSON 有 stampRevenue', /stampRevenue\(state\.data\.days\[d\]\)/.test(src));
  chk('Tier2 合併後有 stampRevenue', /stampRevenue\(m\);/.test(src));
  chk('applyIncoming 有 stampRevenue', /if \(next\.days\[d\]\) stampRevenue\(next\.days\[d\]\)/.test(src));
  chk('touchDay 內有 stampRevenue', /function touchDay[\s\S]{0,200}stampRevenue\(d\)/.test(src));
  const direct = (src.match(/\.updatedAt = new Date\(\)\.toISOString\(\)/g) || []).length;
  chk('直接改 updatedAt 只剩 2 處(guardDayUpdates/touchDay)', direct === 2, direct);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
