// 加班條:幾何 + 輸入時即時更新（曾有 bug：oninput 不重畫，打字當下看到舊狀態）
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

// 極簡 DOM stub：只需要記錄結構與 style
const ctx = `
'use strict';
function el(tag, attrs, ...children) {
  const e = { tag, cls: (attrs && attrs.class) || '', style: (attrs && attrs.style) || '', text: '', children: [] };
  for (const c of children.flat()) {
    if (c == null) continue;
    if (typeof c === 'string') e.text += c; else e.children.push(c);
  }
  return e;
}
const state = { data: { days: {}, settings: { overtimeTargets: { weekday: 46, holiday: 16 } } } };
${F('otBarEl')}
${F('getDayType')}
${F('calcMonthlyOvertime')}
${F('buildOtMerged')}
return { otBarEl, buildOtMerged, calcMonthlyOvertime, state };
`;
const api = new Function(ctx)();

const parse = (node) => {
  const bar = node.children.find(c => c.cls === 'ot-bar');
  const get = (cls) => bar.children.find(c => c.cls === cls);
  const num = (s, key) => { const m = (s || '').match(new RegExp(key + ':([\\d.]+)%')); return m ? Math.round(Number(m[1]) * 10) / 10 : null; };
  const fill = get('ot-bar-fill'), over = get('ot-bar-over'), tick = get('ot-bar-tick');
  return {
    label: bar.children.find(c => c.cls === 'ot-bar-label').text,
    fillW: num(fill.style, 'width'),
    hasOver: !!over,
    overLeft: over ? num(over.style, 'left') : null,
    overW: over ? num(over.style, 'width') : null,
    tickLeft: num(tick.style, 'left'),
  };
};

console.log('--- 幾何：滿格 = max(目標, 實際) ---');
{
  const r = parse(api.otBarEl('平日', 96, 46));
  chk('label 含超出量', r.label === '96 / 46 hr · 209%(超 50h)', r.label);
  chk('達標段 = 46/96 = 47.9%', r.fillW === 47.9, r.fillW);
  chk('超出段從刻度線開始', r.overLeft === r.tickLeft && r.tickLeft === 47.9, r);
  chk('超出段 = 50/96 = 52.1%', r.overW === 52.1, r.overW);
  chk('兩段合計滿格', Math.round((r.fillW + r.overW) * 10) / 10 === 100, r.fillW + r.overW);
}

console.log('--- 剛好達標:無超出段,刻度線在最右 ---');
{
  const r = parse(api.otBarEl('假日', 16, 16));
  chk('無超出段', r.hasOver === false);
  chk('填滿 100%', r.fillW === 100, r.fillW);
  chk('刻度線在 100%', r.tickLeft === 100, r.tickLeft);
  chk('label 不含「超」', !r.label.includes('超'), r.label);
}

console.log('--- 未達標 ---');
{
  const r = parse(api.otBarEl('平日', 21, 46));
  chk('無超出段', r.hasOver === false);
  chk('填 21/46 = 45.7%', r.fillW === 45.7, r.fillW);
  chk('刻度線在最右(目標=滿格)', r.tickLeft === 100, r.tickLeft);
}

console.log('--- 零 / 目標為 0 的邊界 ---');
{
  const r0 = parse(api.otBarEl('假日', 0, 16));
  chk('0 小時:填 0、無超出', r0.fillW === 0 && !r0.hasOver, r0);
  const rz = parse(api.otBarEl('平日', 5, 0));
  chk('目標 0:全部算超出', rz.hasOver === true && rz.overW === 100, rz);
  chk('目標 0 不會 NaN', !String(rz.label).includes('NaN'), rz.label);
}

console.log('--- 不同超標程度必須長度不同(舊版都卡 100% 看不出差別)---');
{
  const a = parse(api.otBarEl('平日', 59, 46));   // 128%
  const b = parse(api.otBarEl('平日', 96, 46));   // 209%
  chk('128% 刻度線在 78%(46/59)', a.tickLeft === 78, a.tickLeft);
  chk('209% 刻度線在 47.9%', b.tickLeft === 47.9, b.tickLeft);
  chk('兩者可區分', a.tickLeft !== b.tickLeft);
}

console.log('--- buildOtMerged 依實際資料分桶(含日型 override)---');
{
  api.state.data.days = {
    '2026-06-06': { overtimeHours: 5 },                        // 週六 → 假日
    '2026-06-07': { overtimeHours: 5 },                        // 週日 → 假日
    '2026-06-19': { overtimeHours: 15, overtimeType: '假日' },  // 週五手動標假日
    '2026-06-18': { overtimeHours: 3 },                        // 週四 → 平日
  };
  const merged = api.buildOtMerged('2026-06');
  const bars = merged.children.map(parse);
  chk('平日條 = 3 / 46', bars[0].label.startsWith('3 / 46'), bars[0].label);
  chk('假日條 = 25 / 16(含手動標記的 15h)', bars[1].label.startsWith('25 / 16'), bars[1].label);
  chk('假日超標 → 有超出段', bars[1].hasOver === true, bars[1]);
  chk('平日未超標 → 無超出段', bars[0].hasOver === false, bars[0]);
}

console.log('--- 改加班時數後重建,超出段要跟著出現(此為原 bug)---');
{
  api.state.data.days = { '2026-06-06': { overtimeHours: 10 } };   // 週六,假日 10 < 16
  const before = api.buildOtMerged('2026-06').children.map(parse)[1];
  chk('改之前:未超標無超出段', before.hasOver === false, before);
  api.state.data.days['2026-06-06'].overtimeHours = 25;            // 改成 25 → 超標
  const after = api.buildOtMerged('2026-06').children.map(parse)[1];
  chk('改之後:出現超出段', after.hasOver === true, after);
  chk('改之後 label 正確', after.label === '25 / 16 hr · 156%(超 9h)', after.label);
}

console.log('--- setMonthCellOvertime 有呼叫 refreshOtSummary(修 oninput 不更新)---');
{
  const fn = F('setMonthCellOvertime');
  chk('setMonthCellOvertime 內含 refreshOtSummary', /refreshOtSummary\(/.test(fn), fn);
  chk('refreshOtSummary 會重畫 summary cell', /pivot-ot-summary-cell/.test(F('refreshOtSummary')));
  chk('也會更新加班刷卡列月計', /pivot-ot-row/.test(F('refreshOtSummary')));
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
