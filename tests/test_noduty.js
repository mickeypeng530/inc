// 預約不值班:日期 token 統整 + 拖曳排序(2026-08-13)
// 核心性質:統整列要**保留使用者寫的區間與註記**,只做排序+去重+串接,
// 不重新分段(9/2 + 9/3-5 不可以併成 9/2-5 —— 那是兩筆不同的預約)。
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
function grabLine(prefix) {
  const line = src.split('\n').find(l => l.trim().startsWith(prefix));
  if (!line) throw new Error('抽不到 ' + prefix);
  return line.trim();
}

let EVENTS = [];
const api = new Function('getEvents', 'setEvents', `
  const state = { data: { get scheduleEvents() { return getEvents(); },
                          set scheduleEvents(v) { setEvents(v); } } };
  const storage = { save: () => {} };
  const renderScheduleBlock = () => {};
  const document = { querySelectorAll: () => [] };
  ${grabLine('const NODUTY_TOKEN_RE')}
  ${grabFn('parseNoDutyTokens')}
  ${grabFn('fmtNoDutyToken')}
  ${grabFn('aggregateNoDutyTokens')}
  ${grabFn('noDutyOverviewText')}
  ${grabFn('aggregateNoDutyDates')}
  ${grabFn('moveScheduleEvent')}
  return { parseNoDutyTokens, fmtNoDutyToken, aggregateNoDutyTokens,
           noDutyOverviewText, aggregateNoDutyDates, moveScheduleEvent };
`)(() => EVENTS, (v) => { EVENTS = v; });

let pass = 0, fail = 0;
function check(n, c, x) { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? '  → ' + x : '')); } }
const M = '2026-09';
const setRows = (...rows) => { EVENTS = rows.map((d, i) => ({ id: 'e' + i, type: 'noDuty', month: M, reason: '', dates: d })); };

console.log('');
console.log('[1] ⭐ 使用者的原始例子');
{
  setRows('9/2', '9/3-5, 9/6 (no IR)');
  check('統整成「9/2, 9/3-5, 9/6 (no IR)」',
        api.noDutyOverviewText(M) === '9/2, 9/3-5, 9/6 (no IR)', api.noDutyOverviewText(M));
  check('天數 = 2 + 3 + 6 展開後 5 天', api.aggregateNoDutyDates(M).length === 5,
        JSON.stringify(api.aggregateNoDutyDates(M)));
}

console.log('');
console.log('[2] 解析');
{
  const P = (t) => api.parseNoDutyTokens(t, M);
  check('單日', JSON.stringify(P('9/2')) === JSON.stringify([{ mon: 9, from: 2, to: 2, note: '' }]), JSON.stringify(P('9/2')));
  check('區間', P('9/3-5')[0].from === 3 && P('9/3-5')[0].to === 5);
  check('註記跟著該 token', P('9/6 (no IR)')[0].note === '(no IR)', P('9/6 (no IR)')[0].note);
  check('省略月份 → 用該區塊的月', P('12')[0].mon === 9, String(P('12')[0].mon));
  check('跨月可寫在同一格', P('10/1')[0].mon === 10);
  check('空白分隔的多個日期(舊資料寫法)', P('13 27').length === 2, JSON.stringify(P('13 27')));
  check('逗號/頓號/全形逗號都吃', P('9/1、9/2,9/3').length === 3, JSON.stringify(P('9/1、9/2,9/3')));
  check('反向區間會正規化', P('9/5-3')[0].from === 3 && P('9/5-3')[0].to === 5);
  check('超出範圍的數字略過', P('9/40').length === 0 || P('9/40')[0].from <= 31, JSON.stringify(P('9/40')));
  check('沒有數字 → 空', P('休假').length === 0, JSON.stringify(P('休假')));
}

console.log('');
console.log('[3] ⭐ 不可以把相鄰的併起來(那是兩筆不同的預約)');
{
  setRows('9/2', '9/3-5');
  check('9/2 + 9/3-5 仍是兩段,不變成 9/2-5',
        api.noDutyOverviewText(M) === '9/2, 9/3-5', api.noDutyOverviewText(M));
}

console.log('');
console.log('[4] 排序與去重');
{
  setRows('9/20', '9/3', '9/11');
  check('依日期排序', api.noDutyOverviewText(M) === '9/3, 9/11, 9/20', api.noDutyOverviewText(M));
  setRows('9/3', '9/3');
  check('完全相同的 token 去重', api.noDutyOverviewText(M) === '9/3', api.noDutyOverviewText(M));
  setRows('9/3', '9/3 (no IR)');
  check('註記不同就不算重複', api.noDutyOverviewText(M) === '9/3, 9/3 (no IR)', api.noDutyOverviewText(M));
  setRows('10/1', '9/28');
  check('跨月依月份排', api.noDutyOverviewText(M) === '9/28, 10/1', api.noDutyOverviewText(M));
}

console.log('');
console.log('[5] 天數(區間要展開,重複日只算一次)');
{
  setRows('9/3-5');
  check('9/3-5 = 3 天', api.aggregateNoDutyDates(M).length === 3);
  setRows('9/3-5', '9/4-6');
  check('重疊只算一次(3,4,5,6 = 4 天)', api.aggregateNoDutyDates(M).length === 4,
        JSON.stringify(api.aggregateNoDutyDates(M)));
  setRows('');
  check('空 → 0 天且顯示 —', api.aggregateNoDutyDates(M).length === 0 && api.noDutyOverviewText(M) === '—');
}

console.log('');
console.log('[6] 拖曳排序 —— 只動該月,其他月份順序不受影響');
{
  EVENTS = [
    { id: 'a', type: 'noDuty', month: '2026-09', dates: '9/1' },
    { id: 'x', type: 'noDuty', month: '2026-10', dates: '10/1' },   // 夾在中間的別月紀錄
    { id: 'b', type: 'noDuty', month: '2026-09', dates: '9/2' },
    { id: 'c', type: 'noDuty', month: '2026-09', dates: '9/3' },
  ];
  api.moveScheduleEvent('2026-09', 2, 0);        // 把 c 拉到最前
  check('該月順序變成 c, a, b',
        EVENTS.filter(e => e.month === '2026-09').map(e => e.id).join(',') === 'c,a,b',
        EVENTS.filter(e => e.month === '2026-09').map(e => e.id).join(','));
  check('⭐ 別月那筆仍在原本的位置(index 1)', EVENTS[1].id === 'x', EVENTS.map(e => e.id).join(','));
  check('總筆數不變', EVENTS.length === 4);

  const before = EVENTS.map(e => e.id).join(',');
  api.moveScheduleEvent('2026-09', 1, 1);
  check('from === to 不動', EVENTS.map(e => e.id).join(',') === before);
  api.moveScheduleEvent('2026-09', 9, 0);
  check('超出範圍不動也不爆', EVENTS.map(e => e.id).join(',') === before);
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
