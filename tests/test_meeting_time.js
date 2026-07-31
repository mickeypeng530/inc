// 當日會議 + 起訖時間(2026-07-31)
// 重點守 setMeetingDates 的資料遺失 bug:舊版是 wipe-and-rebuild,使用者再碰一次
// 月表的日期字串,當日填好的會議起訖時間就無聲全滅。
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

const api = new Function(`
  const state = { data: { days: {}, settings: { meetingCatalog: [] } } };
  let INFO = null;
  const getMeetingInfo = () => INFO;
  const touchDay = (d) => {
    if (!state.data.days[d]) state.data.days[d] = { meetings: [] };
    state.data.days[d].updatedAt = 'touched';
    return state.data.days[d];
  };
  const storage = { save(){} };
  const renderMeetingPanel = () => {};
  const renderDayMeetingPanel = () => {};
  const renderStatsPanel = () => {};
  ${grabFn('spanMinutes')}
  ${grabFn('mtgDuration')}
  ${grabFn('setMeetingDates')}
  return { setMeetingDates, mtgDuration, state, setInfo: (i) => { INFO = i; } };
`)();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const INFO = { id: 'm1', role: '參與', name: '案例討論會', amount: 500 };
const M = '2026-08';
function seed(days) {
  api.state.data.days = JSON.parse(JSON.stringify(days));
  api.setInfo(INFO);
}

console.log('');
console.log('[1] 起訖時間欄位用 start/end(與 procedure 的 startTime/endTime 分開)');
check('09:00→10:30 = 90 分', api.mtgDuration({ start: '09:00', end: '10:30' }) === 90);
check('只填一邊 → null', api.mtgDuration({ start: '09:00' }) === null);
check('跨午夜 23:30→00:15 = 45 分', api.mtgDuration({ start: '23:30', end: '00:15' }) === 45);
check('讀 startTime 不算數(欄位確實分開)', api.mtgDuration({ startTime: '09:00', endTime: '10:00' }) === null);

console.log('');
console.log('[2] 月表重打同樣的日期字串 → 已填的起訖必須保住(舊版會無聲清掉)');
{
  seed({
    '2026-08-05': { meetings: [{ catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500,
                                 start: '08:00', end: '09:00' }] },
  });
  api.setMeetingDates(M, 'm1', '5');
  const m = api.state.data.days['2026-08-05'].meetings[0];
  check('start 保住', m.start === '08:00', JSON.stringify(m));
  check('end 保住', m.end === '09:00', JSON.stringify(m));
  check('仍只有一場(沒有重複塞)', api.state.data.days['2026-08-05'].meetings.length === 1);
}

console.log('');
console.log('[3] 同一天兩場同名會議不可被壓成一場(舊版的 latent bug)');
{
  seed({
    '2026-08-06': { meetings: [
      { catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500, start: '08:00', end: '09:00' },
      { catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500, start: '15:00', end: '16:00' },
    ] },
  });
  api.setMeetingDates(M, 'm1', '6');
  const ms = api.state.data.days['2026-08-06'].meetings;
  check('兩場都在', ms.length === 2, '實際 ' + ms.length + ' 場');
  check('各自的時間都對', ms[0].start === '08:00' && ms[1].start === '15:00', JSON.stringify(ms.map(x => x.start)));
}

console.log('');
console.log('[4] 日期被移除 → 該天的會議要刪掉(不能因為保留邏輯而刪不掉)');
{
  seed({
    '2026-08-07': { meetings: [{ catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500, start: '08:00', end: '09:00' }] },
    '2026-08-08': { meetings: [{ catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500 }] },
  });
  api.setMeetingDates(M, 'm1', '8');    // 只留 8 號
  check('7 號被刪掉', (api.state.data.days['2026-08-07'].meetings || []).length === 0);
  check('8 號還在', (api.state.data.days['2026-08-08'].meetings || []).length === 1);
}

console.log('');
console.log('[5] 新增日期 → 建新場次(沒有舊資料可保留時照常運作)');
{
  seed({ '2026-08-09': { meetings: [] } });
  api.setMeetingDates(M, 'm1', '9 10');
  check('9 號建起來', api.state.data.days['2026-08-09'].meetings.length === 1);
  check('10 號建起來(原本沒這天)', (api.state.data.days['2026-08-10'].meetings || []).length === 1);
  check('新場次沒有起訖(未填)', api.state.data.days['2026-08-09'].meetings[0].start === undefined);
}

console.log('');
console.log('[6] 別的會議不可被波及');
{
  seed({
    '2026-08-11': { meetings: [
      { catalogId: 'm1', role: '參與', name: '案例討論會', amount: 500, start: '08:00', end: '09:00' },
      { catalogId: 'm2', role: '主講', name: '晨會', amount: 3000, start: '07:30', end: '08:00' },
    ] },
  });
  api.setMeetingDates(M, 'm1', '11');
  const ms = api.state.data.days['2026-08-11'].meetings;
  const m2 = ms.find(x => x.catalogId === 'm2');
  check('m2 還在且時間沒被動', !!m2 && m2.start === '07:30' && m2.end === '08:00', JSON.stringify(ms));
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
