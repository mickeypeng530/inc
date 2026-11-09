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
function grabConst(name) {
  const i = src.indexOf('const ' + name);
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{' || c === '[') { d++; st = true; } else if (c === '}' || c === ']') { d--; if (st && !d) return src.slice(i, j + 1) + ';'; } }
}
// const PAIN_ME = 'Peng' 沒有括號 → grabConst 會一路抓到下一個常數;改抽整行
const ME_LINE = src.split(/\r?\n/).find(l => l.startsWith('const PAIN_ME ='));
if (!ME_LINE) throw new Error('抽不到 PAIN_ME');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const FNS = ['getCount', 'procRankName', 'painMonthDates', 'painDefaultOpdDoc', 'painOpdEntry', 'painOpdDoc', 'painOpdCount',
  'painOpdWrite', 'cyclePainOpdDoc', 'setPainOpdN', 'painOpdMonth', 'painInjKind', 'painMyMonth', 'painManual', 'painTameCount', 'painCell',
  'setPainManual', 'painTameRows', 'ensurePainTame', 'painTameUpdate', 'painCleanMrn', 'painMineKey', 'painMine', 'painMineUpdate',
  'painMyTameRows', 'painAllTameRows', 'painParseDate', 'painDocName', 'parsePainTamePaste', 'painTameKey', 'painClassifyRows',
  'addPainTameRows', 'painTameAoa'];
function build(days, pain) {
  return new Function('DAYS', 'PAIN', `
    const state = { data: { days: DAYS, pain: PAIN } };
    let saves = 0;
    const scheduleSave = () => { saves++; };
    const storage = { save() { saves++; } };
    const refreshPainTotals = () => {};
    ${grabConst('PAIN_DOCTORS')} ${ME_LINE} ${grabConst('PAIN_METRICS')} ${grabConst('PAIN_OPD_RULES')}
    ${FNS.map(grabFn).join('\n')}
    return { state, ${FNS.join(', ')}, saves: () => saves };
  `)(days, pain);
}
const P = (presetId, presetName, medRecord) => ({ presetId, presetName, medRecord, items: [] });

console.log('\n[1] ⭐ 門診預設排班:Peng 第 2、4 個星期三 · Wu 第 1、3、5 個星期三 · Yen 每週五');
{
  const a = build({});
  // 2026-11:星期三 = 4, 11, 18, 25;星期五 = 6, 13, 20, 27
  check('11/4(第 1 個週三)→ Wu', a.painDefaultOpdDoc('2026-11-04') === 'Wu');
  check('11/11(第 2 個週三)→ Peng', a.painDefaultOpdDoc('2026-11-11') === 'Peng');
  check('11/18(第 3 個週三)→ Wu', a.painDefaultOpdDoc('2026-11-18') === 'Wu');
  check('11/25(第 4 個週三)→ Peng', a.painDefaultOpdDoc('2026-11-25') === 'Peng');
  check('週五 → Yen', ['06', '13', '20', '27'].every(d => a.painDefaultOpdDoc('2026-11-' + d) === 'Yen'));
  check('其他天 → 沒門診', a.painDefaultOpdDoc('2026-11-02') === null && a.painDefaultOpdDoc('2026-11-07') === null);
  // 2026-09:星期三 = 2, 9, 16, 23, 30 → 第 5 個週三 30 號 = Wu
  check('第 5 個週三(9/30)→ Wu', a.painDefaultOpdDoc('2026-09-30') === 'Wu');
  const m = a.painOpdMonth('2026-11');
  check('11 月:Peng 2 診、Wu 2 診、Yen 4 診', m.Peng.days === 2 && m.Wu.days === 2 && m.Yen.days === 4, m);
}

console.log('\n[2] ⭐ 名字切換(Peng → Yen → Wu → 取消 → Peng)');
{
  const a = build({});
  const D = '2026-11-11';                                // 預設 Peng
  check('Peng → Yen', a.cyclePainOpdDoc(D) === 'Yen' && a.painOpdDoc(D) === 'Yen');
  check('→ Wu', a.cyclePainOpdDoc(D) === 'Wu');
  check('→ 取消(放假)', a.cyclePainOpdDoc(D) === null && a.painOpdDoc(D) === null && a.state.data.pain.opd[D].doc === 'none');
  check('→ 回到 Peng', a.cyclePainOpdDoc(D) === 'Peng');
  check('⭐ 回到預設 → 不存覆寫,整個節點 delete', !(a.state.data.pain && a.state.data.pain.opd), a.state.data.pain);
  check('空白日點一下 → 加一診 Peng', a.cyclePainOpdDoc('2026-11-02') === 'Peng' && a.painOpdDoc('2026-11-02') === 'Peng');
}

console.log('\n[3] ⭐ 門診人數:Peng 自動帶今日 tab 的 OPD;其他醫師手填');
{
  const a = build({
    '2026-11-11': { counts: { opd: 26 } },   // Peng 的診
    '2026-11-25': { counts: { opd: 22 } },   // Peng 的診
    '2026-11-04': { counts: { opd: 2 } },    // Wu 的診,我只有零星 2 人
  });
  a.setPainOpdN('2026-11-04', '35');         // Wu
  a.setPainOpdN('2026-11-06', '40');         // Yen
  a.setPainOpdN('2026-11-13', '38');
  const m = a.painOpdMonth('2026-11');
  check('⭐ Peng = 26 + 22(自動)', m.Peng.n === 48, m.Peng);
  check('Wu = 35(我的零星 2 人不算進 Wu)', m.Wu.n === 35, m.Wu);
  check('Yen = 40 + 38', m.Yen.n === 78, m.Yen);
  check('painCell 門診三人都看月曆', a.painCell('2026-11', 'Peng', 'opd') === 48 && a.painCell('2026-11', 'Yen', 'opd') === 78);
  a.cyclePainOpdDoc('2026-11-25'); a.cyclePainOpdDoc('2026-11-25'); a.cyclePainOpdDoc('2026-11-25');   // → 取消
  check('取消那診 → 不算', a.painOpdMonth('2026-11').Peng.n === 26);
  a.setPainOpdN('2026-11-04', '');
  check('清空人數 → delete', !('n' in a.painOpdEntry('2026-11-04')));
}

console.log('\n[4] ⭐ 打針 = CT NB + NB arthro + RF/pRF,單純 Arthro 不算');
{
  const k = build({}).painInjKind;
  check('ct_nb / CT NB & 2000 site / CT NB & 1500', k(P('ct_nb', 'CT NB')) === 'CT NB' && k(P('other', 'CT NB & 2000 site')) === 'CT NB' && k(P('preset_1787821408439', 'CT NB & 1500')) === 'CT NB');
  check('nb_arthro / nb_arthro_1500', k(P('nb_arthro', 'NB arthro')) === 'NB arthro' && k(P('nb_arthro_1500', 'NB Arthro 1500')) === 'NB arthro');
  check('rf / rf2pt / pRF3', k(P('rf', 'RF')) === 'RF' && k(P('rf2pt', 'pRF2')) === 'RF' && k(P('rf3pt', 'pRF3')) === 'RF');
  check('⭐ 單純 Arthro 不算', k(P('arthro', 'Arthro')) === null);
  check('TAME / NB simple / CB / PICC 不算', [P('ctame', 'cTAME'), P('nb_simple', 'NB simple'), P('cb_nb', 'CB'), P('picc', 'PICC')].every(p => k(p) === null));
  check('自訂 preset id 開頭 preset_ 不會被當成 pRF', k(P('preset_1', 'Something')) === null);
  const a = build({ '2026-10-07': { procedures: [P('ct_nb', 'CT NB'), P('arthro', 'Arthro'), P('stame', 'sTAME'), P('tae', 'TAE'), P('rf2pt', 'pRF2')] } });
  const m = a.painMyMonth('2026-10');
  check('Peng 10 月:打針 2、TAME 1(TAE 不算)', m.inj === 2 && m.tame === 1, m);
}

console.log('\n[5] 其他醫師的打針手填;TAME = TAME 表的列數(2026-11-10 改)');
{
  const a = build({}, { tame: [
    { id: 'a', date: '2026-10-03', doctor: 'Yen' }, { id: 'b', date: '2026-10-20', doctor: 'Yen' },
    { id: 'c', date: '2026-11-02', doctor: 'Yen' }, { id: 'd', date: '2026-10-08', doctor: 'Wu' },
    { id: 'e', date: '2026-10-09', doctor: '' } ] });
  a.setPainManual('2026-10', 'Yen', 'inj', '22');
  check('打針手填存進 pain.monthly', a.painCell('2026-10', 'Yen', 'inj') === 22);
  check('沒填 → null', a.painCell('2026-10', 'Wu', 'inj') === null);
  check('⭐ Yen 10 月 TAME = 表上 2 列(11 月那列不算)', a.painCell('2026-10', 'Yen', 'tame') === 2, a.painCell('2026-10', 'Yen', 'tame'));
  check('Wu 10 月 TAME = 1', a.painCell('2026-10', 'Wu', 'tame') === 1);
  check('沒寫醫師的列不算進任何人', a.painCell('2026-10', 'Yen', 'tame') + a.painCell('2026-10', 'Wu', 'tame') === 3);
  a.setPainManual('2026-10', 'Yen', 'tame', '9');
  check('⭐ 舊的手填 TAME 不再有作用(單一來源 = 表)', a.painCell('2026-10', 'Yen', 'tame') === 2);
  a.setPainManual('2026-10', 'Yen', 'inj', ''); a.setPainManual('2026-10', 'Yen', 'tame', '');
  check('清空 → monthly 整個 delete', !('monthly' in a.state.data.pain), a.state.data.pain);
}

console.log('\n[6] ⭐ 我的 TAME 自動帶入當月名單');
{
  const a = build({
    '2026-11-11': { procedures: [P('ctame', 'cTAME', '600011 / 600011 cTAME R knee'), P('ct_nb', 'CT NB', '600012')] },
    '2026-11-20': { procedures: [P('stame', 'sTAME', '600013'), P('stame', 'sTAME', '600013')] },   // 同日同人兩筆
    '2026-10-21': { procedures: [P('stame', 'sTAME', '600014')] },
  });
  const r = a.painMyTameRows('2026-11');
  check('只有 TAME、只有 11 月 → 3 列', r.length === 3 && r.every(x => x.auto && x.doctor === 'Peng'), r.map(x => x.date));
  check('⭐ 病歷號清掉夾帶文字', r[0].mrn === '600011', r[0].mrn);
  check('同日同人兩筆 → key 不撞', r[1].key !== r[2].key, [r[1].key, r[2].key]);
  check('key 只有英數與 - _(RTDB 安全)', r.every(x => /^[\w-]+$/.test(x.key)), r.map(x => x.key));
  a.painMineUpdate(r[0].key, 'dx', 'Knee OA');
  a.painMineUpdate(r[0].key, 'ageSex', '70/F');
  const r2 = a.painMyTameRows('2026-11');
  check('⭐ 補填的欄位跟著那一列', r2[0].dx === 'Knee OA' && r2[0].ageSex === '70/F', r2[0]);
  a.painMineUpdate(r[0].key, 'dx', ''); a.painMineUpdate(r[0].key, 'ageSex', '');
  check('清空 → tameMine 整個 delete', !('tameMine' in a.state.data.pain), a.state.data.pain);
  check('全部範圍 = 4 列', a.painMyTameRows('').length === 4);
}

console.log('\n[7] ⭐ 貼上原 Excel「Other doctor」:Peng 的列補進自動列、其他醫師新增、重複略過');
{
  const a = build({ '2026-10-27': { procedures: [P('stame', 'sTAME', '600001')] } });
  const text = ['Date \t\t\tSite\t\t\t\tDoctor', '',
    '26-10-27\t600001\tLateral epicondylitis\tR elbow\tTAME\t45/M\t\tPeng',     // 對得上我的 procedure
    '26-10-28\t600002\tPlantar fasciitis\tR foot\tTAME\t50/M\t一日住院\tyen',
    '2026/9/3\t600003\tFinger OA\tR hand\tTAME\t60/F\t\tWu',
    '26-9-10\t600004\tTrigger finger\tL hand\tTAME\t55/F\t\tPeng'].join('\n');   // Peng 但沒有 procedure
  const p = a.parsePainTamePaste(text);
  check('解析 4 筆,表頭/空白跳過', p.rows.length === 4 && p.skipped.length === 1, p.skipped);
  check('yy-m-d / yyyy/m/d 都認', p.rows[0].date === '2026-10-27' && p.rows[2].date === '2026-09-03' && p.rows[3].date === '2026-09-10');
  const res = a.addPainTameRows(p.rows);
  check('⭐ 1 筆補進我的自動列、3 筆新增', res.merged === 1 && res.added === 3, res);
  const mine = a.painMyTameRows('2026-10')[0];
  check('⭐ 自動列拿到 Dx / Site / Age', mine.dx === 'Lateral epicondylitis' && mine.site === 'R elbow' && mine.ageSex === '45/M', mine);
  check('⭐ 對得上的那筆不會變成重複的手動列', a.painAllTameRows('2026-10').length === 2, a.painAllTameRows('2026-10').map(r => r.mrn));
  check('對不上 procedure 的 Peng 列 → 手動列', a.painTameRows().some(r => r.doctor === 'Peng' && r.date === '2026-09-10'));
  const again = a.addPainTameRows(p.rows);
  check('重貼:手動列全部略過', again.added === 0 && again.dup === 3, again);
  check('醫師名大小寫歸一(yen → Yen)', a.painTameRows().some(r => r.doctor === 'Yen'));
}

console.log('\n[7b] ⭐ 病歷號對不上時退回「那天只剩一筆」配對(原 Excel 實測 35 筆有 4 筆是這樣)');
{
  const a = build({
    '2026-10-07': { procedures: [P('stame', 'sTAME', '600021')] },                               // Excel 寫成 600091
    '2026-10-14': { procedures: [P('stame', 'sTAME', '600022'), P('ctame', 'cTAME', '600023')] },  // 同天兩台
  });
  const rows = a.parsePainTamePaste([
    '26-10-7\t600091\tKnee OA\tR knee\tTAME\t70/F\t\tPeng',      // 病歷號不同、那天只有一台 → 靠日期
    '26-10-14\t600022\tShoulder\tL shoulder\tTAME\t60/M\t\tPeng', // 精確配對
    '26-10-14\t600099\tHip\tR hip\tTAME\t55/M\t\tPeng',           // 病歷號不同,但那天另一台還沒被配 → 剛好剩一筆 → 靠日期
  ].join('\n')).rows;
  const c = a.painClassifyRows(rows);
  check('3 筆都併進自動列、沒有新增重複列', c.toMine.length === 3 && c.toAdd.length === 0, c);
  check('其中 2 筆是只靠日期(要提醒核對)', c.byDate === 2, c.byDate);
  check('⭐ 精確配對優先:600022 那筆配到自己,不被日期配對搶走',
        c.toMine.find(x => x.r.mrn === '600022').key.includes('600022'), c.toMine.map(x => [x.r.mrn, x.key]));
  check('每個自動列只被認領一次', new Set(c.toMine.map(x => x.key)).size === 3);
  const b = build({ '2026-10-14': { procedures: [P('stame', 'sTAME', '600022'), P('ctame', 'cTAME', '600023')] } });
  const c2 = b.painClassifyRows(b.parsePainTamePaste('26-10-14\t600099\tHip\tR hip\tTAME\t55/M\t\tPeng').rows);
  check('那天剩兩筆沒配 → 不猜,當手動列', c2.toMine.length === 0 && c2.toAdd.length === 1, c2);
  const c3 = b.painClassifyRows(b.parsePainTamePaste('26-10-14\t600099\tHip\tR hip\tTAME\t55/M\t\tYen').rows);
  check('別的醫師不會被日期配對拉進我的列', c3.toMine.length === 0 && c3.toAdd.length === 1);
}

console.log('\n[8] 輸出版面:照原 Excel,而且不含 Doctor 欄');
{
  const a = build({});
  const aoa = a.painTameAoa([{ date: '2026-10-27', mrn: '600001', dx: 'Dx', site: 'R elbow', proc: 'TAME', ageSex: '45/M', doctor: 'Yen' }]);
  check('第 1 列只有 Date / Site', JSON.stringify(aoa[0]) === JSON.stringify(['Date', '', '', 'Site', '', '', '']));
  check('第 2 列空白、第 3 列起 7 欄', aoa[1].length === 0 && aoa[2].length === 7);
  check('⭐ 沒有醫師名', !aoa.flat().includes('Yen'));
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
