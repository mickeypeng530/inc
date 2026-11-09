// 疼痛業務統計(2026-11-09)
// ⚠ 樣本病歷號全是合成值(600001…),不可從真實資料複製 —— 這個 repo 是 PUBLIC(見 CLAUDE.md)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); } }
}
const line = (p) => { const l = src.split(/\r?\n/).find(x => x.startsWith(p)); if (!l) throw new Error('抽不到 ' + p); return l; };
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

function build(days) {
  return new Function('DAYS', `
    const state = { data: { days: DAYS } };
    let saves = 0;
    const scheduleSave = () => { saves++; };
    const storage = { save() { saves++; } };
    const refreshPainTotals = () => {};
    ${line('const PAIN_DOCTORS')} ${line('const PAIN_ME')} ${line('const PAIN_METRICS')}
    ${grabFn('getCount')} ${grabFn('procRankName')}
    ${grabFn('painIsClinicDay')} ${grabFn('painInjKind')} ${grabFn('painMyMonth')}
    ${grabFn('painManual')} ${grabFn('painCell')} ${grabFn('setPainManual')}
    ${grabFn('painTameRows')} ${grabFn('ensurePainTame')} ${grabFn('painCleanMrn')} ${grabFn('painParseDate')}
    ${grabFn('painDocName')} ${grabFn('parsePainTamePaste')} ${grabFn('painTameKey')} ${grabFn('addPainTameRows')}
    ${grabFn('painMyTameCandidates')} ${grabFn('painTameAoa')}
    return { state, painIsClinicDay, painInjKind, painMyMonth, painCell, setPainManual, parsePainTamePaste,
             addPainTameRows, painMyTameCandidates, painTameAoa, painCleanMrn, painParseDate, saves: () => saves };
  `)(days);
}
const P = (presetId, presetName, medRecord) => ({ presetId, presetName, medRecord, items: [] });

console.log('\n[1] 固定門診日 = 星期三而且 ≥4 人');
{
  const a = build({});
  check('星期三 28 人 → 算', a.painIsClinicDay('2026-11-04', { counts: { opd: 28 } }));
  check('星期三 2 人(零星)→ 不算', !a.painIsClinicDay('2026-11-04', { counts: { opd: 2 } }));
  check('星期一 10 人 → 不算(不是星期三)', !a.painIsClinicDay('2026-11-02', { counts: { opd: 10 } }));
  check('星期三剛好 4 人 → 算', a.painIsClinicDay('2026-11-11', { counts: { opd: 4 } }));
}

console.log('\n[2] ⭐ 打針 = CT NB + NB arthro + RF/pRF,單純 Arthro 不算');
{
  const k = build({}).painInjKind;
  check('ct_nb → CT NB', k(P('ct_nb', 'CT NB')) === 'CT NB');
  check('CT NB & 2000 site(id other)→ CT NB', k(P('other', 'CT NB & 2000 site')) === 'CT NB');
  check('CT NB & 1500(自訂 preset id)→ CT NB', k(P('preset_1787821408439', 'CT NB & 1500')) === 'CT NB');
  check('nb_arthro → NB arthro', k(P('nb_arthro', 'NB arthro')) === 'NB arthro');
  check('nb_arthro_1500 → NB arthro', k(P('nb_arthro_1500', 'NB Arthro 1500')) === 'NB arthro');
  check('rf / rf2pt / pRF3 → RF', k(P('rf', 'RF')) === 'RF' && k(P('rf2pt', 'pRF2')) === 'RF' && k(P('rf3pt', 'pRF3')) === 'RF');
  check('⭐ 單純 Arthro 不算', k(P('arthro', 'Arthro')) === null);
  check('TAME 不算打針', k(P('ctame', 'cTAME')) === null);
  check('NB simple / CB / PICC 不算', k(P('nb_simple', 'NB simple')) === null && k(P('cb_nb', 'CB')) === null && k(P('picc', 'PICC')) === null);
  check('自訂 preset id 開頭 preset_ 不會被當成 pRF', k(P('preset_1', 'Something')) === null);
}

console.log('\n[3] ⭐ Peng 每月自動數字');
{
  const a = build({
    '2026-10-07': { counts: { opd: 25 }, procedures: [P('ct_nb', 'CT NB'), P('arthro', 'Arthro')] },   // 星期三
    '2026-10-14': { counts: { opd: 2 } },                                                              // 星期三但零星
    '2026-10-05': { counts: { opd: 9 }, procedures: [P('nb_arthro', 'NB arthro'), P('ctame', 'cTAME')] }, // 星期一
    '2026-10-21': { counts: { opd: 30 }, procedures: [P('stame', 'sTAME'), P('tae', 'TAE'), P('rf2pt', 'pRF2')] },
    '2026-11-04': { counts: { opd: 20 }, procedures: [P('ct_nb', 'CT NB')] },                          // 別月
  });
  const m = a.painMyMonth('2026-10');
  check('門診 = 25 + 30(只算星期三 ≥4)', m.opd === 55, m);
  check('打針 = CT NB + NB arthro + pRF2 = 3(Arthro 不算)', m.inj === 3, m);
  check('TAME = cTAME + sTAME = 2(TAE 不算)', m.tame === 2, m);
  check('別月不混進來', a.painMyMonth('2026-11').opd === 20 && a.painMyMonth('2026-11').inj === 1);
}

console.log('\n[4] 其他醫師手動輸入');
{
  const a = build({});
  a.setPainManual('2026-10', 'Yen', 'opd', '120');
  a.setPainManual('2026-10', 'Yen', 'tame', '3');
  check('存進 pain.monthly[月][醫師]', a.painCell('2026-10', 'Yen', 'opd') === 120 && a.painCell('2026-10', 'Yen', 'tame') === 3);
  check('沒填 → null(不是 0)', a.painCell('2026-10', 'Wu', 'inj') === null);
  a.setPainManual('2026-10', 'Yen', 'opd', '-5');
  check('負數夾 0', a.painCell('2026-10', 'Yen', 'opd') === 0);
  a.setPainManual('2026-10', 'Yen', 'opd', ''); a.setPainManual('2026-10', 'Yen', 'tame', '');
  check('⭐ 清空 → 整個月份節點 delete(RTDB 不存空物件)', !('2026-10' in a.state.data.pain.monthly), a.state.data.pain.monthly);
  check('有排存檔', a.saves() > 0);
}

console.log('\n[5] TAME 表:貼上(原 Excel「Other doctor」格式)');
{
  const a = build({});
  const text = ['Date \t\t\tSite\t\t\t\tDoctor', '',
    '26-10-27\t600001\tLateral epicondylitis\tR elbow\tTAME\t45/M\t\tPeng',
    '26-10-28\t600002\tPlantar fasciitis\tR foot\tTAME\t50/M\t一日住院\tyen',
    '2026/9/3\t600003\tFinger OA\tR hand\tTAME\t60/F\t\tWu'].join('\n');
  const p = a.parsePainTamePaste(text);
  check('解析 3 筆,表頭/空白跳過', p.rows.length === 3 && p.skipped.length === 1, p);
  check('⭐ yy-m-d(26-10-27)→ 2026-10-27', p.rows[0].date === '2026-10-27', p.rows[0].date);
  check('yyyy/m/d 也認', p.rows[2].date === '2026-09-03');
  check('醫師名大小寫歸一(yen → Yen)', p.rows[1].doctor === 'Yen');
  check('備註欄', p.rows[1].note === '一日住院');
  check('n1 = 3 筆加入', a.addPainTameRows(p.rows) === 3);
  check('⭐ 重貼不重複', a.addPainTameRows(p.rows) === 0 && a.state.data.pain.tame.length === 3);
  check('空欄位不存(不塞空字串)', !('note' in a.state.data.pain.tame[0]), a.state.data.pain.tame[0]);
}

console.log('\n[6] TAME 表:帶入我的 TAME');
{
  const a = build({
    '2026-10-07': { procedures: [P('ctame', 'cTAME', '600011 / 600011 cTAME R knee'), P('ct_nb', 'CT NB', '600012')] },
    '2026-10-21': { procedures: [P('stame', 'sTAME', '600013')] },
    '2026-09-02': { procedures: [P('stame', 'sTAME', '600014')] },
  });
  const c = a.painMyTameCandidates('2026-10');
  check('只帶 TAME、只帶該月', c.length === 2 && c.every(x => x.doctor === 'Peng'), c);
  check('⭐ 病歷號清掉夾帶的文字', c[0].mrn === '600011', c[0].mrn);
  check('依日期排序', c[0].date === '2026-10-07');
  a.addPainTameRows(c);
  check('再帶一次不重複', a.addPainTameRows(a.painMyTameCandidates('2026-10')) === 0);
  check('不指定月份 → 全部 3 筆', a.painMyTameCandidates('').length === 3);
}

console.log('\n[7] ⭐ 輸出版面:照原 Excel,而且不含 Doctor 欄');
{
  const a = build({});
  const aoa = a.painTameAoa([{ date: '2026-10-27', mrn: '600001', dx: 'Dx', site: 'R elbow', proc: 'TAME', ageSex: '45/M', doctor: 'Yen' }]);
  check('第 1 列只有 Date / Site 標題', JSON.stringify(aoa[0]) === JSON.stringify(['Date', '', '', 'Site', '', '', '']));
  check('第 2 列空白', aoa[1].length === 0);
  check('第 3 列起資料,7 欄', aoa[2].length === 7, aoa[2]);
  check('⭐ 沒有醫師名', !aoa.flat().includes('Yen'), aoa);
  check('術式空白補 TAME', a.painTameAoa([{ date: '2026-10-27' }])[2][4] === 'TAME');
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
