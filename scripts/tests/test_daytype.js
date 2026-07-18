// 日型(平日/假日)override:月表底色、• 標記、加班分桶
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function F(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

// weekCls / isDayTypeOverride 是 renderMonth 內的區域函式 → 依同一份邏輯重建來驗證行為
const mk = (days) => new Function('DAYS', `
'use strict';
const state = { data: { days: DAYS } };
${F('getDayType')}
const weekClsCache = {};
function weekCls(dateStr) {
  const type = getDayType(dateStr, state.data.days[dateStr]);
  const ck = dateStr + '|' + type;
  if (weekClsCache[ck] !== undefined) return weekClsCache[ck];
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  let c = '';
  if (dow === 1) c += ' pivot-week-start';
  if (type === '假日') c += ' pivot-weekend';
  weekClsCache[ck] = c;
  return c;
}
const isDayTypeOverride = (dateStr) => {
  const t = state.data.days[dateStr]?.overtimeType;
  return t === '平日' || t === '假日';
};
${F('calcMonthlyOvertime')}
return { getDayType, weekCls, isDayTypeOverride, calcMonthlyOvertime };
`)(days);

console.log('--- 自動推斷(沒有 override)---');
{
  const a = mk({});
  chk('2026-07-08 週三 → 平日', a.getDayType('2026-07-08', undefined) === '平日');
  chk('2026-07-11 週六 → 假日', a.getDayType('2026-07-11', undefined) === '假日');
  chk('週六有 weekend 底色', a.weekCls('2026-07-11').includes('pivot-weekend'));
  chk('週三沒有 weekend 底色', !a.weekCls('2026-07-08').includes('pivot-weekend'));
  chk('週一有週界線', a.weekCls('2026-07-13').includes('pivot-week-start'));
  chk('沒有 override 標記', !a.isDayTypeOverride('2026-07-08'));
}

console.log('--- 平日手動標成假日(端午情境:6/19 週五)---');
{
  const a = mk({ '2026-06-19': { overtimeType: '假日', overtimeHours: 15 } });
  chk('日型 = 假日', a.getDayType('2026-06-19', a ? { overtimeType: '假日' } : null) === '假日');
  chk('整欄有 weekend 橘底(修復前沒有)', a.weekCls('2026-06-19').includes('pivot-weekend'));
  chk('有 • override 標記', a.isDayTypeOverride('2026-06-19') === true);
}

console.log('--- 週末手動標成平日(反向,修復前畫面會騙人)---');
{
  const a = mk({ '2026-07-11': { overtimeType: '平日', overtimeHours: 4 } });
  chk('日型 = 平日', a.getDayType('2026-07-11', { overtimeType: '平日' }) === '平日');
  chk('整欄不再是週末橘底', !a.weekCls('2026-07-11').includes('pivot-weekend'));
  chk('有 • override 標記', a.isDayTypeOverride('2026-07-11') === true);
}

console.log('--- 加班分桶跟著 override 走 ---');
{
  const a = mk({
    '2026-06-19': { overtimeType: '假日', overtimeHours: 15 },   // 週五標假日
    '2026-06-18': { overtimeHours: 3 },                          // 週四自動平日
    '2026-06-20': { overtimeHours: 5 },                          // 週六自動假日
  });
  const r = a.calcMonthlyOvertime('2026-06');
  chk('假日桶 = 15 + 5 = 20', r.holiday === 20, r);
  chk('平日桶 = 3', r.weekday === 3, r);
  chk('總計 = 23', r.total === 23, r);
}

console.log('--- 清成「自動」後回復推斷 ---');
{
  const a = mk({ '2026-06-19': {} });   // overtimeType 已被 delete
  chk('回到平日(週五)', a.getDayType('2026-06-19', {}) === '平日');
  chk('沒有 override 標記', a.isDayTypeOverride('2026-06-19') === false);
  chk('沒有 weekend 底色', !a.weekCls('2026-06-19').includes('pivot-weekend'));
}

console.log('--- cache 不會讓改過日型的欄位卡住舊底色 ---');
{
  const days = { '2026-07-08': {} };
  const a = mk(days);
  const before = a.weekCls('2026-07-08');
  days['2026-07-08'].overtimeType = '假日';      // 改日型
  const after = a.weekCls('2026-07-08');
  chk('改後底色有變(cache key 含日型)', !before.includes('pivot-weekend') && after.includes('pivot-weekend'), { before, after });
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
