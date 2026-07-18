// Tier 2：三方合併 + days 覆寫守門（模擬桌寵並發寫入）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function extractFn(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
const merge3 = new Function(extractFn('merge3') + '\nreturn merge3;')();
const snapshotOf = new Function(extractFn('snapshotOf') + '\nreturn snapshotOf;')();

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

console.log('--- A. 桌寵改 counts、web 改別的欄位 → 兩邊都保住（核心情境）---');
{
  const base  = { counts: { ct: { opd: 3 } }, overtimeHours: 0, updatedAt: 'T0' };
  const cloud = { counts: { ct: { opd: 5 } }, overtimeHours: 0, updatedAt: 'T1' };  // 桌寵 +2
  const local = { counts: { ct: { opd: 3 } }, overtimeHours: 8, updatedAt: 'T2' };  // web 改加班
  const m = merge3(base, local, cloud);
  chk('桌寵的 counts 保留 (opd=5)', m.counts.ct.opd === 5, m.counts);
  chk('web 的加班保留 (8)', m.overtimeHours === 8, m.overtimeHours);
}

console.log('--- B. web 也改了同一個 count → 以 web 為準 ---');
{
  const base  = { counts: { ct: { opd: 3 } } };
  const cloud = { counts: { ct: { opd: 5 } } };
  const local = { counts: { ct: { opd: 9 } } };   // web 明確改成 9
  const m = merge3(base, local, cloud);
  chk('web 的 9 勝出', m.counts.ct.opd === 9, m.counts);
}

console.log('--- C. 桌寵新增一個 web 沒有的計數欄位 → 保留 ---');
{
  const base  = { counts: { ct: { opd: 3 } } };
  const cloud = { counts: { ct: { opd: 3 }, mr: { opd: 2 } } };
  const local = { counts: { ct: { opd: 3 } }, notes: 'hi' };
  const m = merge3(base, local, cloud);
  chk('桌寵新增的 mr 保留', m.counts.mr && m.counts.mr.opd === 2, m.counts);
  chk('web 新增的 notes 保留', m.notes === 'hi');
}

console.log('--- D. 陣列視為整體：web 刪掉中間一筆 procedure 不會殘留 ---');
{
  const base  = { procedures: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const cloud = { procedures: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const local = { procedures: [{ id: 'a' }, { id: 'c' }] };   // 刪掉中間的 b
  const m = merge3(base, local, cloud);
  chk('長度為 2', m.procedures.length === 2, m.procedures);
  chk('內容正確 a,c', m.procedures[0].id === 'a' && m.procedures[1].id === 'c', m.procedures);
}

console.log('--- E. 本機刪除欄位 → 合併後確實消失 ---');
{
  const base  = { counts: {}, irRevenue: 4000 };
  const cloud = { counts: {}, irRevenue: 4000 };
  const local = { counts: {} };                  // web 清掉 irRevenue
  const m = merge3(base, local, cloud);
  chk('irRevenue 已移除', !('irRevenue' in m), m);
}

console.log('--- F. 雲端刪除、本機沒動 → 跟隨雲端刪除 ---');
{
  const base  = { counts: {}, irRevenue: 4000 };
  const cloud = { counts: {} };
  const local = { counts: {}, irRevenue: 4000 };
  const m = merge3(base, local, cloud);
  chk('irRevenue 跟隨雲端消失', !('irRevenue' in m), m);
}

console.log('--- G. 沒有基準（該天雲端本來不存在）---');
{
  const m = merge3(null, { counts: { ct: { opd: 1 } } }, {});
  chk('本機值完整保留', m.counts.ct.opd === 1, m);
}

console.log('--- H. 守門觸發條件：雲端與基準相同 → 不該合併 ---');
{
  const day = { counts: { ct: { opd: 3 } }, updatedAt: 'T0' };
  const baseStr = JSON.stringify(day);
  const cloudStr = JSON.stringify(JSON.parse(JSON.stringify(day)));
  chk('內容相同判定為「無人改動」', cloudStr === baseStr);
}
{
  const base = { counts: { ct: { opd: 3 } }, updatedAt: 'T0' };
  const cloud = { counts: { ct: { opd: 5 } }, updatedAt: 'T1' };
  chk('內容不同判定為「有人改動」', JSON.stringify(cloud) !== JSON.stringify(base));
}

console.log('--- I. snapshotOf 基準可供守門查詢 ---');
{
  const s = snapshotOf({ days: { '2026-07-08': { counts: { ct: { opd: 3 } } } }, settings: {} });
  chk('可取出該天基準字串', typeof s.days['2026-07-08'] === 'string');
  chk('內容可還原', JSON.parse(s.days['2026-07-08']).counts.ct.opd === 3);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
