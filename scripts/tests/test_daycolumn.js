// 「單日整欄」貼上解析 — fixture 用醫師 2026-07-08 / 07-09 的實際欄位
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function F(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found: ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
function C(name) {
  const m = src.match(new RegExp('const ' + name + ' = '));
  const s = m.index;
  let i = src.indexOf('=', s), d = 0, started = false;
  for (; i < src.length; i++) {
    if ('{[('.includes(src[i])) { d++; started = true; }
    else if ('}])'.includes(src[i])) { d--; if (started && !d) return src.slice(s, i + 1) + ';'; }
  }
}

const SHEET_ORDER = [
  { key: 'ct.opd', label: 'CT (主)' }, { key: 'ct.er_adm_self', label: 'CT 子' },
  { key: 'ct.ldct_health', label: 'LDCT' }, { key: 'mr.opd', label: 'MR (主)' },
  { key: 'mr.er_adm_health', label: 'MR 子' }, { key: 'bmd', label: 'BMD' },
  { key: 'special.total', label: 'Special' }, { key: 'special.swal', label: '(Swal)' },
  { key: 'special.hsg', label: '(HSG)' }, { key: 'xray.opd', label: 'X ray' },
  { key: 'xray.er', label: '(ER)' }, { key: 'consult', label: '會診' },
  { key: 'sono', label: 'Sono' }, { key: 'opd', label: 'OPD' },
].map(o => ({ ...o, enabled: true }));

const ctx = `
'use strict';
const state = { data: { settings: { sheetOrder: ${JSON.stringify(SHEET_ORDER)} } } };
${C('MS_PROC_ALIAS')}
${C('MS_COMBO_PRICE')}
${C('MS_PRICE_DEFAULT')}
${C('MS_DISPLAY_NAME')}
${C('MS_ADDON_PRICE')}
${F('msTsvToGrid')}
${F('msNum')}
${F('msDetectAddon')}
${F('parseDetailCell')}
${F('parsePastedDayColumn')}
return { parsePastedDayColumn, parseDetailCell };
`;
const { parsePastedDayColumn, parseDetailCell } = new Function(ctx)();

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

// Excel 剪貼簿：含 \n 的 cell 會被 "..." 包住
const DETAIL_0708 = '"507510 NB\n1736240 NB\n933657 NB\nG36487 NB\nY11134 NB"';
const COL_0708 = [
  '8',            // row1 日期
  '5', '', '', '', '', '28', '', '1', '1', '19', '', '', '2', '25',   // row2-15 計數
  DETAIL_0708,    // row16 detail
  '23691',        // row17 日 Total
  '4865',         // row18 日 IR
  DETAIL_0708,    // row19 detail（同內容）
  '1',            // row20 加班
].join('\r\n');

const COL_0709 = [
  '9',
  '15', '1', '', '3', '2', '13', '1', '1', '1', '25', '', '1', '', '',
  '339804 cTAME',
  '22466',
  '9400',
  '"339804 cTAME & 1500 SONO\n資源共享\n3D"',
  '3',
].join('\r\n');

console.log('--- 7/8：5 筆 NB，detail 重複兩次不得變 10 筆 ---');
{
  const p = parsePastedDayColumn(COL_0708, '2026-07-08');
  chk('略過首列日期編號', p.droppedDayHeader === true);
  chk('無警告', p.warnings.length === 0, p.warnings);
  chk('日 Total = 23691', p.importedRevenue === 23691, p.importedRevenue);
  chk('日 IR = 4865', p.irRevenue === 4865, p.irRevenue);
  chk('加班 = 1', p.overtimeHours === 1, p.overtimeHours);
  chk('procedure 恰 5 筆（未重複）', p.procedures.length === 5, p.procedures.length);
  chk('全部是 NB', p.procedures.every(x => x.presetName === 'NB'), p.procedures.map(x => x.presetName));
  chk('病歷號正確', p.procedures.map(x => x.medRecord).join(',') === '507510,1736240,933657,G36487,Y11134', p.procedures.map(x => x.medRecord));
  const c = Object.fromEntries(p.counts.map(x => [x.key, x.value]));
  chk('CT主=5', c['ct.opd'] === 5, c);
  chk('BMD=28', c['bmd'] === 28, c);
  chk('Swal=1 / HSG=1', c['special.swal'] === 1 && c['special.hsg'] === 1, c);
  chk('X ray=19', c['xray.opd'] === 19, c);
  chk('Sono=2 / OPD=25', c['sono'] === 2 && c['opd'] === 25, c);
  chk('空欄位為 null（不覆蓋）', c['ct.ldct_health'] === null && c['consult'] === null, c);
  chk('無 addon', p.addons.length === 0, p.addons);
}

console.log('--- 7/9：後面那格才有 資源共享 / 3D ---');
{
  const p = parsePastedDayColumn(COL_0709, '2026-07-09');
  chk('日 Total = 22466', p.importedRevenue === 22466, p.importedRevenue);
  chk('日 IR = 9400', p.irRevenue === 9400, p.irRevenue);
  chk('加班 = 3', p.overtimeHours === 3, p.overtimeHours);
  chk('procedure 恰 1 筆 cTAME（未重複）', p.procedures.length === 1 && p.procedures[0].presetName === 'cTAME', p.procedures.map(x => x.presetName));
  chk('病歷號 339804', p.procedures[0] && p.procedures[0].medRecord === '339804', p.procedures[0]);
  chk('抓到 2 個 addon', p.addons.length === 2, p.addons);
  chk('含 資源共享(source)', p.addons.some(a => a.type === 'source'), p.addons);
  chk('含 3D', p.addons.some(a => a.type === 'd3'), p.addons);
  chk('提示兩格 detail 不同', p.warnings.some(w => w.includes('採用後面')), p.warnings);
  const c = Object.fromEntries(p.counts.map(x => [x.key, x.value]));
  chk('CT主=15 / CT子=1', c['ct.opd'] === 15 && c['ct.er_adm_self'] === 1, c);
  chk('MR主=3 / MR子=2', c['mr.opd'] === 3 && c['mr.er_adm_health'] === 2, c);
  chk('BMD=13', c['bmd'] === 13, c);
  chk('會診=1', c['consult'] === 1, c);
}

console.log('--- 不含首列日期編號（使用者從 CT 那列開始選）---');
{
  const noHeader = COL_0708.split('\r\n').slice(1).join('\r\n');
  const p = parsePastedDayColumn(noHeader, '2026-07-08');
  chk('不誤刪計數', p.droppedDayHeader === false && p.counts[0].value === 5, { d: p.droppedDayHeader, v: p.counts[0].value });
  chk('其餘照常', p.importedRevenue === 23691 && p.overtimeHours === 1 && p.procedures.length === 5);
}

console.log('--- 該天沒有 procedure（detail 兩格皆空）---');
{
  const col = ['8', '5', '', '', '', '', '28', '', '', '', '19', '', '', '', '', '', '12000', '', '', '2'].join('\r\n');
  const p = parsePastedDayColumn(col, '2026-07-08');
  chk('日 Total = 12000', p.importedRevenue === 12000, p.importedRevenue);
  chk('IR 為空 → null', p.irRevenue === null, p.irRevenue);
  chk('加班 = 2', p.overtimeHours === 2, p.overtimeHours);
  chk('procedure 0 筆', p.procedures.length === 0);
}

console.log('--- parseDetailCell：& 附註不影響術式判定 ---');
{
  const r = parseDetailCell('339804 cTAME & 1500 SONO\n資源共享\n3D', '2026-07-09');
  chk('1 筆 procedure', r.procedures.length === 1, r.procedures.map(p => p.presetName));
  chk('判定為 cTAME', r.procedures[0].presetName === 'cTAME');
  chk('2 個 addon', r.addons.length === 2, r.addons);
  chk('資源共享×1', r.addons.find(a => a.type === 'source').count === 1);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
