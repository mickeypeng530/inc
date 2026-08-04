// 會議名單匯出(2026-08-04)
// 核心性質:匯出格式與「📥 匯入 → 會議」的貼上格式**對稱** —— 匯出的東西貼回去要一模一樣。
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

const CAT = [
  { id: 'ortho', role: '主講', name: '骨科手術案例討論', amount: 2400 },
  { id: 'core',  role: '主講', name: '住院醫師核心課程', amount: 3000 },
  { id: 'vs',    role: '參與', name: '主治醫師會議', amount: 500 },
  { id: 'cancer',role: '參與', name: '癌非癌', amount: 500 },
  { id: 'dept',  role: '參與', name: '部務會議', amount: 500 },
];
function makeApi(days, month) {
  let copied = null, toasted = null;
  const api = new Function('DAYS', 'CAT', 'MONTH', 'CAP', `
    const state = { currentMonth: MONTH, data: { days: DAYS, settings: { meetingCatalog: CAT } } };
    const toast = (m) => CAP.toast(m);
    const navigator = { clipboard: { writeText: (t) => { CAP.copy(t); return Promise.resolve(); } } };
    const prompt = () => {};
    ${grabFn('exportMeetingsTSV')}
    ${grabFn('parsePastedMeetings')}
    return { exportMeetingsTSV, parsePastedMeetings };
  `)(days, CAT, month, { copy: (t) => { copied = t; }, toast: (m) => { toasted = m; } });
  return { ...api, getCopied: () => copied, getToast: () => toasted };
}
const M = '2026-08';
const mk = (id) => { const c = CAT.find(x => x.id === id); return { catalogId: c.id, role: c.role, name: c.name, amount: c.amount }; };
function daysFrom(spec) {           // { 8: ['vs','ortho'], ... }
  const out = {};
  for (const [d, ids] of Object.entries(spec))
    out[`${M}-${String(d).padStart(2, '0')}`] = { meetings: ids.map(mk) };
  return out;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('');
console.log('[1] 重現使用者的舊 Excel 版式');
{
  const api = makeApi(daysFrom({
    1: ['ortho'], 8: ['ortho', 'vs'], 15: ['ortho'], 22: ['ortho'], 27: ['core', 'cancer'],
    28: ['dept'], 29: ['ortho'],
  }), M);
  api.exportMeetingsTSV();
  const out = api.getCopied();
  console.log(out.split('\n').map(l => '      ' + JSON.stringify(l)).join('\n'));
  const lines = out.split('\n');
  check('第一列 = 骨科(主講,5 場,總額 12000)',
        lines[0] === '1 8 15 22 29\t主講\t骨科手術案例討論\t12000', JSON.stringify(lines[0]));
  check('主講排在參與之前', lines[1].includes('主講'));
  check('角色之間有空列', lines[2] === '', JSON.stringify(lines[2]));
  check('參與組按第一個日期排序(8 → 27 → 28)',
        lines[3].startsWith('8\t') && lines[4].startsWith('27\t') && lines[5].startsWith('28\t'),
        JSON.stringify(lines.slice(3)));
  check('每列 4 欄(tab 分隔)', lines.filter(l => l).every(l => l.split('\t').length === 4));
}

console.log('');
console.log('[2] ⭐ Round-trip:匯出的內容貼回去要一模一樣');
{
  const spec = { 1: ['ortho'], 8: ['ortho', 'vs'], 15: ['ortho'], 27: ['core'], 28: ['dept'] };
  const api = makeApi(daysFrom(spec), M);
  api.exportMeetingsTSV();
  const { rows, errors } = api.parsePastedMeetings(api.getCopied(), M);
  check('沒有解析錯誤(空列不算錯)', errors.length === 0, JSON.stringify(errors));
  check('項目數一致', rows.length === 4, '實際 ' + rows.length);
  const ortho = rows.find(r => r.name === '骨科手術案例討論');
  check('骨科日期還原 [1,8,15]', JSON.stringify(ortho.dates) === '[1,8,15]', JSON.stringify(ortho.dates));
  check('骨科每場金額還原 2400', ortho.per === 2400, String(ortho.per));
  check('角色還原', ortho.role === '主講');
  check('catalogId 對得回去', ortho.catalogId === 'ortho' && ortho.matched === true);
}

console.log('');
console.log('[3] 同一天兩場同名 → 日期重複列出(否則再匯入時每場金額會被算高)');
{
  const days = { [`${M}-08`]: { meetings: [mk('vs'), mk('vs')] }, [`${M}-15`]: { meetings: [mk('vs')] } };
  const api = makeApi(days, M);
  api.exportMeetingsTSV();
  const line = api.getCopied().split('\n')[0];
  check('日期是「8 8 15」', line.startsWith('8 8 15\t'), JSON.stringify(line));
  check('總額 1500', line.endsWith('\t1500'), JSON.stringify(line));
  const { rows } = api.parsePastedMeetings(api.getCopied(), M);
  check('貼回去仍是 3 場、每場 500', rows[0].n === 3 && rows[0].per === 500,
        `n=${rows[0].n} per=${rows[0].per}`);
}

console.log('');
console.log('[4] 分組用 catalogId —— 設定頁改過名的舊筆不會裂成兩列');
{
  const days = {
    [`${M}-05`]: { meetings: [{ catalogId: 'vs', role: '參與', name: '主治醫師會議(舊名)', amount: 500 }] },
    [`${M}-12`]: { meetings: [mk('vs')] },
  };
  const api = makeApi(days, M);
  api.exportMeetingsTSV();
  const lines = api.getCopied().split('\n').filter(l => l);
  check('只有一列(沒有因為改名而裂開)', lines.length === 1, JSON.stringify(lines));
  check('名稱用最後一筆(新名)', lines[0].includes('主治醫師會議\t'), JSON.stringify(lines[0]));
}

console.log('');
console.log('[5] 邊界');
{
  const api = makeApi({}, M);
  api.exportMeetingsTSV();
  check('沒有會議 → 不複製、給提示', api.getCopied() === null && /沒有會議/.test(api.getToast() || ''),
        JSON.stringify(api.getToast()));

  const api2 = makeApi(daysFrom({ 3: ['vs'] }), M);
  api2.exportMeetingsTSV();
  check('只有一組 → 不多出空列', api2.getCopied().split('\n').length === 1, JSON.stringify(api2.getCopied()));

  // 別月的資料不可混進來
  const mixed = { ...daysFrom({ 3: ['vs'] }), '2026-07-20': { meetings: [mk('dept')] } };
  const api3 = makeApi(mixed, M);
  api3.exportMeetingsTSV();
  check('只取本月', api3.getCopied().split('\n').filter(l => l).length === 1, JSON.stringify(api3.getCopied()));
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
