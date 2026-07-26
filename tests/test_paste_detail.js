// 貼上解析測試:純術式清單自動附加 + sheet 簡寫別名 + 排行歸一(2026-07-26)
// 從 index.html 抽真函式跑 —— 函式改名要同步改這裡。
const fs = require('fs');
const src = fs.readFileSync('C:/Users/彭嗣翔/Claude_Work/Worknum/index.html', 'utf8');

function grabFn(name) {
  const sig = 'function ' + name + '(';
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('括號沒配對 ' + name);
}
function grabConstBlock(name) {
  const i = src.indexOf('const ' + name);
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{' || c === '[') { d++; started = true; }
    else if (c === '}' || c === ']') { d--; if (started && d === 0) return src.slice(i, j + 1) + ';'; }
  }
  throw new Error('括號沒配對 ' + name);
}

const code = [
  grabConstBlock('MS_PROC_ALIAS'), grabConstBlock('MS_COMBO_PRICE'),
  grabConstBlock('MS_PRICE_DEFAULT'), grabConstBlock('MS_DISPLAY_NAME'),
  grabConstBlock('MS_ADDON_PRICE'), grabConstBlock('ATOMIC_AS_ADDON'),
  grabFn('msTsvToGrid'), grabFn('msNum'), grabFn('msDetectAddon'),
  grabFn('parseDetailCell'), grabFn('parsePastedDayColumn'), grabFn('applyPastedDayColumn'),
  grabFn('parsePastedProcedures'), grabFn('applyPastedProcedures'),
  grabFn('presetAsAddons'), grabFn('addAddonsToDay'), grabFn('procRankName'),
  grabFn('getDay'), grabFn('setCount'), grabFn('getCount'),
].join('\n');

// SEED 的 PICC+AV preset(真實條目)
const PRESETS = [
  { id: 'picc_av', name: 'PICC+AV', items: [{ atomicId: 'picc', amount: 1034 }, { atomicId: 'av', amount: 2100 }] },
  { id: 'arthro',  name: 'Arthro',  items: [{ atomicId: 'arthro', amount: 360 }] },
  { id: 'd3',      name: '3D',      items: [{ atomicId: 'd3', amount: 600 }] },
];
const ATOMICS = [
  { id: 'picc', name: 'PICC', amount: 1034 }, { id: 'av', name: 'AV', amount: 2100 },
  { id: 'arthro', name: 'Arthro', amount: 360 }, { id: 'd3', name: '3D', amount: 600 },
  { id: 'res_share', name: '資源共享', amount: 100 },
];
const SHEET_ORDER = [
  { key: 'ct.opd', label: 'CT OPD', enabled: true },
  { key: 'mr.opd', label: 'MR OPD', enabled: true },
];

const api = new Function(`
  const state = { data: { days: {}, settings: {
    presets: ${JSON.stringify(PRESETS)},
    atomicItems: ${JSON.stringify(ATOMICS)},
    sheetOrder: ${JSON.stringify(SHEET_ORDER)},
    unitPrices: { special: { eso_tbe: 231 } },
  } } };
  const storage = { save(){} };
  const touchDay = (d) => { const day = getDay(d); day.updatedAt = 'test'; return day; };
  const ensureSpecialOthers = (day) => { if(!day.counts) day.counts={}; if(!day.counts.special) day.counts.special={}; if(!Array.isArray(day.counts.special.others)) day.counts.special.others=[]; return day.counts.special.others; };
  ${code}
  return { parseDetailCell, parsePastedDayColumn, applyPastedDayColumn,
           parsePastedProcedures, applyPastedProcedures, procRankName,
           getState: () => state };
`)();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const J = JSON.stringify;

console.log('\n[1] 使用者的原始輸入:「326514 PICC」+ 換行 +「3D」→ 貼單日');
{
  const p = api.parsePastedDayColumn('326514 PICC\n3D', '2026-07-26');
  check('判定為純術式清單(detailOnly)', p.detailOnly === true);
  check('PICC 解析出來(sheet 簡寫 → 組合價 3134)',
    p.procedures.length === 1 && p.procedures[0].presetName === 'PICC'
      && p.procedures[0].items[0].amount === 3134 && p.procedures[0].medRecord === '326514',
    J(p.procedures));
  check('3D 解析成額外計費', J(p.addons.map(a => [a.type, a.count])) === J([['d3', 1]]), J(p.addons));
  check('沒有警告(不再嚇人)', p.warnings.length === 0, J(p.warnings));
}

console.log('\n[2] detailOnly 套用 = 附加,不動既有資料');
{
  const st = api.getState();
  st.data.days['2026-07-26'] = {
    counts: { ct: { opd: 5 } }, procedures: [{ presetName: '既有NB', items: [{ amount: 733 }] }],
    meetings: [], irRevenue: 5000, overtimeHours: 3,
  };
  const p = api.parsePastedDayColumn('326514 PICC\n3D', '2026-07-26');
  api.applyPastedDayColumn('2026-07-26', p);
  const d = st.data.days['2026-07-26'];
  check('既有 procedure 還在 + PICC 附加', d.procedures.length === 2 && d.procedures[0].presetName === '既有NB', J(d.procedures.map(x => x.presetName)));
  check('irRevenue 沒被刪掉', d.irRevenue === 5000, String(d.irRevenue));
  check('計數沒被動', d.counts.ct.opd === 5);
  check('加班沒被動', d.overtimeHours === 3);
  check('3D 進了 addons', J(d.addons.map(a => [a.type, a.count])) === J([['d3', 1]]), J(d.addons));
}

console.log('\n[3] 真正的整欄貼上不受影響(有計數數字 → 照舊整天覆蓋)');
{
  // 2 項計數 + detail1 + 日Total + 日IR + detail2(空) + 加班
  const p = api.parsePastedDayColumn('3\n5\n326514 PICC\n12500\n3000\n\n8', '2026-07-26');
  check('不是 detailOnly', !p.detailOnly);
  check('計數 2 項', p.filledCounts === 2, String(p.filledCounts));
  check('日 Total 12500 / IR 3000 / 加班 8', p.importedRevenue === 12500 && p.irRevenue === 3000 && p.overtimeHours === 8);
  check('PICC 在 detail 解析出來', p.procedures.length === 1 && p.procedures[0].presetName === 'PICC');
}

console.log('\n[4] modal「貼上匯入」也認 sheet 簡寫');
{
  const { rows } = api.parsePastedProcedures('326514 PICC\n1874176 Arthro\n999999 GB\n3D');
  check('PICC → resolved(組合 3134)', rows[0].matched && rows[0].resolved && rows[0].resolved[0].items[0].amount === 3134, J(rows[0]));
  check('Arthro 走原本 preset 比對', rows[1].matched && rows[1].preset && rows[1].preset.id === 'arthro');
  check('GB → PTGBD(sheet 別名)', rows[2].matched && rows[2].resolved && rows[2].resolved[0].presetName === 'PTGBD', J(rows[2].name));
  check('3D → 額外計費', !!rows[3].addon);

  const st = api.getState();
  st.data.days['2026-07-27'] = { procedures: [], meetings: [] };
  const n = api.applyPastedProcedures('2026-07-27', { rows });
  const d = st.data.days['2026-07-27'];
  check('套用:3 筆 procedure + 1 addon', d.procedures.length === 3 && d.addons.length === 1, J({ p: d.procedures.length, a: d.addons }));
  check('PICC 筆帶病歷號', d.procedures[0].medRecord === '326514');
}

console.log('\n[5] 排行歸一:PICC+AV 與 PICC 是同一件事');
{
  check('PICC+AV → PICC', api.procRankName({ presetName: 'PICC+AV', items: [] }) === 'PICC');
  check('PICC(匯入)→ PICC', api.procRankName({ presetName: 'PICC', presetId: 'picc', items: [] }) === 'PICC');
  check('PCN+A-P → PCN', api.procRankName({ presetName: 'PCN+A-P', items: [] }) === 'PCN');
  check('PTGBD+PTC → PTGBD', api.procRankName({ presetName: 'PTGBD+PTC', items: [] }) === 'PTGBD');
  check('TAME 歸類不受影響', api.procRankName({ presetName: 'sTAME', presetId: 'stame', items: [] }) === 'TAME');
  check('其他名稱原樣', api.procRankName({ presetName: 'Lung', items: [] }) === 'Lung');
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
