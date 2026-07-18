// Tier 1:髒路徑 diff 正確性測試（含 RTDB 陣列語意這個最大坑）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function extractFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
}
const { snapshotOf, diffUpdates } = new Function(
  extractFn('snapshotOf') + '\n' + extractFn('diffUpdates') + '\nreturn { snapshotOf, diffUpdates };')();

let pass = 0, fail = 0;
const chk = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  →  ' + JSON.stringify(extra) : '')); } };

const base = {
  days: {
    '2026-07-01': { counts: { ct: { opd: 3 } }, procedures: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], updatedAt: 'T1' },
    '2026-07-02': { counts: { ct: { opd: 5 } }, procedures: [], updatedAt: 'T1' },
  },
  settings: { theme: 'dark', atomicItems: [{ id: 'nb' }, { id: 'tae' }] },
  monthlyMeta: { '2026-07': { perfTotal: 500000 } },
  migrations: { specialV4: true },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log('--- 1. 沒有變動 → 不產生任何寫入 ---');
{
  const u = diffUpdates(snapshotOf(base), snapshotOf(clone(base)));
  chk('無變動時 payload 為空', Object.keys(u).length === 0, u);
}

console.log('--- 2. 只改一天 → 只寫那一天（不碰其他天/settings） ---');
{
  const next = clone(base);
  next.days['2026-07-01'].counts.ct.opd = 9;
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('只有一條路徑', Object.keys(u).length === 1, Object.keys(u));
  chk('路徑正確 days/2026-07-01', 'days/2026-07-01' in u, Object.keys(u));
  chk('未觸及 2026-07-02', !('days/2026-07-02' in u));
  chk('未觸及 settings', !('settings' in u));
  chk('值是整天物件', u['days/2026-07-01'].counts.ct.opd === 9);
}

console.log('--- 3. 陣列縮短 → 必須整段替換（RTDB update 不刪多餘 index） ---');
{
  const next = clone(base);
  next.days['2026-07-01'].procedures = [{ id: 'a' }];   // 3 筆刪到剩 1 筆
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('寫的是整天節點而非 procedures/0', 'days/2026-07-01' in u, Object.keys(u));
  chk('陣列長度正確為 1', u['days/2026-07-01'].procedures.length === 1,
      u['days/2026-07-01'] && u['days/2026-07-01'].procedures);
  chk('沒有殘留 index 1/2', !u['days/2026-07-01'].procedures[1] && !u['days/2026-07-01'].procedures[2]);
}

console.log('--- 4. settings 陣列重排 → 整棵 settings 替換 ---');
{
  const next = clone(base);
  next.settings.atomicItems = [{ id: 'tae' }];
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('settings 整棵送出', 'settings' in u && u.settings.atomicItems.length === 1, u.settings);
  chk('未連帶重寫 days', !Object.keys(u).some(k => k.startsWith('days/')), Object.keys(u));
}

console.log('--- 5. 刪掉一天 → 必須送 null ---');
{
  const next = clone(base);
  delete next.days['2026-07-02'];
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('days/2026-07-02 = null', u['days/2026-07-02'] === null, u);
}

console.log('--- 6. 新增一天 → 只寫新的那天 ---');
{
  const next = clone(base);
  next.days['2026-07-03'] = { counts: {}, procedures: [], updatedAt: 'T2' };
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('只有一條路徑', Object.keys(u).length === 1, Object.keys(u));
  chk('是 days/2026-07-03', 'days/2026-07-03' in u);
}

console.log('--- 7. migration 情境:雲端原始值為基準 → migration 改動被自動推上去 ---');
{
  const cloudRaw = { days: { '2026-07-01': { counts: {} } }, settings: { theme: 'dark' } };  // 無 migrations 旗標
  const baseSnap = snapshotOf(cloudRaw);              // 先照相（normalize 前）
  const migrated = clone(cloudRaw);
  migrated.migrations = { specialV4: true };          // runMigrations 補上
  migrated.pending = {};                              // _normalizeData 補上
  const u = diffUpdates(baseSnap, snapshotOf(migrated));
  chk('migrations 旗標會上雲', u.migrations && u.migrations.specialV4 === true, u);
  chk('normalize 補的 pending 也會上雲', 'pending' in u, Object.keys(u));
  chk('沒動到的 days 不重寫', !('days/2026-07-01' in u), Object.keys(u));
}

console.log('--- 8. 貼整月:改多天 + monthlyMeta → 單一原子 payload ---');
{
  const next = clone(base);
  next.days['2026-07-01'].counts.ct.opd = 1;
  next.days['2026-07-02'].counts.ct.opd = 2;
  next.days['2026-07-05'] = { counts: { bmd: 4 }, procedures: [] };
  next.monthlyMeta['2026-07'].perfTotal = 999;
  const u = diffUpdates(snapshotOf(base), snapshotOf(next));
  chk('一次 payload 含 3 天 + monthlyMeta', Object.keys(u).length === 4, Object.keys(u));
  chk('未牽連 settings', !('settings' in u));
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
