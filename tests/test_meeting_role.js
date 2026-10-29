// 會議角色改成「逐場」(2026-10-29)
// 歷史資料:案例討論會 參與 12 / 主講 1;Journal reading 有一筆「參與 $3000」、骨科MM「參與 $3000」
// —— 改不了角色只好改金額留下的痕跡。現在今日 tab 點角色就切換,金額帶預設(主講 3000 / 參與 500)。
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
  }
}
const grabLine = (p) => src.split('\n').find(l => l.trim().startsWith(p)).trim();

let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };
const CAT = [
  { id: 'case', role: '參與', name: '案例討論會', amount: 500 },
  { id: 'ortho', role: '主講', name: '骨科手術案例討論', amount: 3000 },
  { id: 'office', role: '參與', name: '科務會議', amount: 0 },
];

// ---- 純函式 ----
const R = new Function(`${grabLine('const MTG_ROLE_DEFAULT')} ${grabFn('mtgRoleAmount')} ${grabFn('toggleMeetingRole')} return { mtgRoleAmount, toggleMeetingRole };`)();

console.log('\n[1] 切換角色 + 金額規則(主講 3000 / 參與 500;回到目錄角色就用目錄金額)');
{
  const m = { catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 };
  check('參與 → 主講', R.toggleMeetingRole(m, CAT) === '主講' && m.role === '主講');
  check('⭐ 金額變 $3000', m.amount === 3000, m.amount);
  R.toggleMeetingRole(m, CAT);
  check('切回參與 → 用目錄金額 $500', m.role === '參與' && m.amount === 500, m);
  const o = { catalogId: 'ortho', role: '主講', amount: 3000 };
  R.toggleMeetingRole(o, CAT);
  check('目錄是主講的會議切成參與 → $500', o.role === '參與' && o.amount === 500, o);
  const z = { catalogId: 'office', role: '參與', amount: 0 };
  R.toggleMeetingRole(z, CAT); R.toggleMeetingRole(z, CAT);
  check('目錄金額 $0 的會議切回來仍是 $0(不被預設 500 蓋掉)', z.amount === 0, z);
  const imp = { catalogId: 'imp_xxx', role: '參與', amount: 500 };
  R.toggleMeetingRole(imp, CAT);
  check('目錄沒有的(匯入 imp_)→ 用預設 $3000', imp.role === '主講' && imp.amount === 3000, imp);
  const blank = { catalogId: 'case', amount: 500 };
  check('沒有 role 欄位當參與 → 切成主講', R.toggleMeetingRole(blank, CAT) === '主講');
}

// ---- setMeetingDates:改月表日期字串時,逐場角色不可被重設 ----
console.log('\n[2] ⭐ 月表重打日期字串 → 今日 tab 切過的角色/金額要保住');
{
  const api = new Function('CAT', `
    const state = { data: { days: {}, settings: { meetingCatalog: CAT } } };
    let INFO = null;
    const getMeetingInfo = () => INFO;
    const touchDay = (d) => { if (!state.data.days[d]) state.data.days[d] = { meetings: [] }; return state.data.days[d]; };
    const storage = { save(){} };
    const renderMeetingPanel = () => {}, renderDayMeetingPanel = () => {}, renderStatsPanel = () => {};
    ${grabFn('setMeetingDates')}
    return { setMeetingDates, state, setInfo: (i) => { INFO = i; } };
  `)(CAT);
  api.state.data.days = {
    '2026-10-06': { meetings: [{ catalogId: 'case', role: '主講', name: '案例討論會', amount: 3000, start: '07:30', end: '08:30' }] },
    '2026-10-13': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
  };
  api.setInfo({ id: 'case', role: '參與', name: '案例討論會(改名)', amount: 500 });
  api.setMeetingDates('2026-10', 'case', '6 13 20');
  const d6 = api.state.data.days['2026-10-06'].meetings[0];
  check('⭐ 10/6 仍是主講', d6.role === '主講', d6);
  check('⭐ 10/6 金額仍是 $3000', d6.amount === 3000, d6.amount);
  check('起訖時間保住', d6.start === '07:30' && d6.end === '08:30', d6);
  check('名稱跟隨目錄', d6.name === '案例討論會(改名)', d6.name);
  const d20 = api.state.data.days['2026-10-20'].meetings[0];
  check('新加的 10/20 用目錄預設(參與 $500)', d20.role === '參與' && d20.amount === 500, d20);
}

// ---- 匯出:同會議同月有主講也有參與 → 兩列;貼回去對得上 ----
console.log('\n[3] 匯出依角色分列,貼回 parsePastedMeetings 角色與金額不變');
{
  const days = {
    '2026-10-06': { meetings: [{ catalogId: 'case', role: '主講', name: '案例討論會', amount: 3000 }] },
    '2026-10-13': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
    '2026-10-20': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
  };
  let copied = null;
  const api = new Function('DAYS', 'CAT', 'CAP', `
    const state = { currentMonth: '2026-10', data: { days: DAYS, settings: { meetingCatalog: CAT } } };
    const toast = () => {};
    const navigator = { clipboard: { writeText: (t) => { CAP(t); return Promise.resolve(); } } };
    const prompt = () => {};
    ${grabFn('exportMeetingsTSV')}
    ${grabFn('parsePastedMeetings')}
    return { exportMeetingsTSV, parsePastedMeetings };
  `)(days, CAT, (t) => { copied = t; });
  api.exportMeetingsTSV();
  const lines = copied.split('\n').filter(Boolean);
  check('⭐ 兩列(主講一列、參與一列)', lines.length === 2, copied);
  check('主講列:6 / $3000', lines[0] === '6\t主講\t案例討論會\t3000', lines[0]);
  check('參與列:13 20 / $1000', lines[1] === '13 20\t參與\t案例討論會\t1000', lines[1]);
  const back = api.parsePastedMeetings(copied, '2026-10');
  const rows = back.rows || back;
  const sp = (Array.isArray(rows) ? rows : []).find(r => r.role === '主講');
  check('貼回:主講那列每場 $3000', sp && sp.per === 3000, rows);
}

// ---- 月表:一列 = 會議 × 角色,依實際角色分區;整列切換;日期欄依角色寫入 ----
function monthApi(days) {
  return new Function('CAT', 'DAYS', `
    const state = { data: { days: DAYS, settings: { meetingCatalog: CAT } } };
    const touched = [];
    const touchDay = (d) => { touched.push(d); if (!state.data.days[d]) state.data.days[d] = { meetings: [] }; return state.data.days[d]; };
    const storage = { save(){} };
    const renderMeetingPanel = () => {}, renderDayMeetingPanel = () => {}, renderStatsPanel = () => {};
    ${grabLine('const MTG_ROLE_DEFAULT')}
    ${grabFn('mtgRoleAmount')} ${grabFn('toggleMeetingRole')} ${grabFn('getMeetingInfo')}
    ${grabFn('monthMeetingGroups')} ${grabFn('toggleMonthMeetingRole')} ${grabFn('setMeetingDates')}
    return { monthMeetingGroups, toggleMonthMeetingRole, setMeetingDates, state, touched };
  `)(CAT, days);
}
const occ = (api, d) => (api.state.data.days[d]?.meetings || []).map(m => `${m.catalogId}:${m.role}:${m.amount}`).join(',');

console.log('\n[4] ⭐ 分區依實際角色(使用者回報:29 號主講卻排在「參與」底下)');
{
  const api = monthApi({
    '2026-10-29': { meetings: [{ catalogId: 'case', role: '主講', name: '案例討論會', amount: 3000 }] },
    '2026-10-06': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
    '2026-10-07': { meetings: [{ catalogId: 'ortho', name: '骨科手術案例討論', amount: 3000 }] },   // 舊紀錄沒有 role 欄
  });
  const g = api.monthMeetingGroups('2026-10');
  check('⭐ 案例討論會 29 號 → 主講那一列', g.has('case|主講') && g.get('case|主講').days.join() === '29', [...g.keys()]);
  check('同月混合 → 自動拆兩列(參與那列只有 6 號)', g.get('case|參與') && g.get('case|參與').days.join() === '6', [...g.keys()]);
  check('沒有 role 欄的舊紀錄 → 視為目錄角色(主講)', g.has('ortho|主講'), [...g.keys()]);
  check('每列金額只加自己角色的', g.get('case|主講').total === 3000 && g.get('case|參與').total === 500);
}

console.log('\n[5] ⭐ 整列切換:這個月這個角色的每一場一起切,別的角色那列不動');
{
  const api = monthApi({
    '2026-10-06': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500, start: '07:30', end: '08:30' }] },
    '2026-10-13': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
    '2026-10-20': { meetings: [{ catalogId: 'case', role: '主講', name: '案例討論會', amount: 3000 }] },
    '2026-11-03': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
  });
  const to = api.toggleMonthMeetingRole('2026-10', 'case', '參與');
  check('回傳新角色 主講', to === '主講', to);
  check('⭐ 6、13 號都變主講 $3000', occ(api, '2026-10-06') === 'case:主講:3000' && occ(api, '2026-10-13') === 'case:主講:3000',
        [occ(api, '2026-10-06'), occ(api, '2026-10-13')]);
  check('起訖時間保住', api.state.data.days['2026-10-06'].meetings[0].start === '07:30');
  check('原本就主講的 20 號不被切成參與', occ(api, '2026-10-20') === 'case:主講:3000', occ(api, '2026-10-20'));
  check('別的月份不動', occ(api, '2026-11-03') === 'case:參與:500', occ(api, '2026-11-03'));
  check('只蓋有改到的天的 updatedAt', api.touched.join() === '2026-10-06,2026-10-13', api.touched);
  check('合併成同一列 case|主講 ×3', api.monthMeetingGroups('2026-10').get('case|主講').days.length === 3);
  check('沒有東西可切 → null', api.toggleMonthMeetingRole('2026-10', 'case', '參與') === null);
  // 舊紀錄沒有 role 欄位(目錄角色是主講)→ 也要切得動
  const b = monthApi({ '2026-10-07': { meetings: [{ catalogId: 'ortho', name: '骨科手術案例討論', amount: 3000 }] } });
  check('沒有 role 欄的舊紀錄也切得動(主講 → 參與 $500)',
        b.toggleMonthMeetingRole('2026-10', 'ortho', '主講') === '參與' && occ(b, '2026-10-07') === 'ortho:參與:500', occ(b, '2026-10-07'));
}

console.log('\n[6] ⭐ 日期欄依角色寫入:在主講那列打日期 → 建成主講;刪日期只刪這個角色的');
{
  const api = monthApi({
    '2026-10-06': { meetings: [{ catalogId: 'case', role: '參與', name: '案例討論會', amount: 500 }] },
    '2026-10-29': { meetings: [{ catalogId: 'case', role: '主講', name: '案例討論會', amount: 3000, start: '12:00', end: '13:00' }] },
  });
  api.setMeetingDates('2026-10', 'case', '29 30', '主講');
  check('⭐ 新加的 30 號建成主講 $3000(不是目錄的參與 $500)', occ(api, '2026-10-30') === 'case:主講:3000', occ(api, '2026-10-30'));
  check('29 號原樣保住(含起訖)', occ(api, '2026-10-29') === 'case:主講:3000' && api.state.data.days['2026-10-29'].meetings[0].start === '12:00');
  check('⭐ 參與那列的 6 號完全不受影響', occ(api, '2026-10-06') === 'case:參與:500', occ(api, '2026-10-06'));
  api.setMeetingDates('2026-10', 'case', '30', '主講');
  check('從主講那列刪掉 29 → 只刪 29 的主講場次', occ(api, '2026-10-29') === '' && occ(api, '2026-10-06') === 'case:參與:500',
        [occ(api, '2026-10-29'), occ(api, '2026-10-06')]);
  api.setMeetingDates('2026-10', 'case', '', '參與');
  check('清空參與那列 → 主講的 30 號還在', occ(api, '2026-10-06') === '' && occ(api, '2026-10-30') === 'case:主講:3000',
        [occ(api, '2026-10-06'), occ(api, '2026-10-30')]);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
