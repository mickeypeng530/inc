// 過期回音閘門的回歸測試(2026-07-21)
// 從 index.html 抽出真正的函式來跑,不重寫一份邏輯。
// 用大括號配對抽取 → 函式改名要同步改這裡。
const fs = require('fs');
const path = 'C:/Users/彭嗣翔/Claude_Work/Worknum/index.html';
const src = fs.readFileSync(path, 'utf8');

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
function grabConst(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('抽不到 ' + decl);
  const end = src.indexOf('\n', i);
  return src.slice(i, end);
}

const code = [
  grabConst('const sentValues = new Map()'),
  grabConst('const SENT_CAP ='),
  grabFn('canonJSON'), grabFn('noteSent'), grabFn('isStaleEcho'),
  grabFn('snapshotOf'), grabFn('merge3'), grabFn('applyIncoming'),
].join('\n');

// --- 環境替身 ---
let renderCount = 0;
const harness = `
  let lastSynced = null;
  const state = { data: null };
  const STORAGE_KEY = 'k';
  const localStorage = { setItem(){}, getItem(){ return null; } };
  const flushPendingSaves = () => {};
  const _normalizeData = (d) => d;          // 測試資料已是正規形態
  const stampRevenue = () => {};            // revenue 衍生值與本測試無關
  const renderAll = () => { __render(); };
  ${code}
  return {
    applyIncoming, noteSent, isStaleEcho, snapshotOf,
    setBase: (s) => { lastSynced = s; },
    getBase: () => lastSynced,
    setData: (d) => { state.data = d; },
    getData: () => state.data,
  };
`;
const api = new Function('__render', harness)(() => renderCount++);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ============================================================
console.log('\n[1] 病根重現:打「38」,「3」的回音在基準推進之後才到');
// ------------------------------------------------------------
{
  const data = { days: {}, pending: { ct_adm: 0 }, settings: { a: 1 } };
  api.setData(clone(data));
  api.setBase(api.snapshotOf(data));

  // 敲「3」→ 本機 3 → 寫入#1 送出
  api.getData().pending.ct_adm = 3;
  api.noteSent('pending', { ct_adm: 3 });

  // 敲「8」→ 本機 38 → 寫入#2 送出,基準被最新寫入推進到 38
  api.getData().pending.ct_adm = 38;
  api.noteSent('pending', { ct_adm: 38 });
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_adm: 38 }, settings: { a: 1 } }));

  const before = renderCount;
  // 寫入#1 的過期回音(內容 = 3)現在才到
  api.applyIncoming({ days: {}, pending: { ct_adm: 3 }, settings: { a: 1 } });

  check('值沒有被蓋回 3', api.getData().pending.ct_adm === 38, '實際 = ' + api.getData().pending.ct_adm);
  check('沒有 renderAll(焦點不會被吃掉)', renderCount === before);

  // 寫入#2 的正常回音接著到 → 收斂,一樣不重繪
  const b2 = renderCount;
  api.applyIncoming({ days: {}, pending: { ct_adm: 38 }, settings: { a: 1 } });
  check('最新回音到達後值仍是 38', api.getData().pending.ct_adm === 38);
  check('最新回音也不重繪', renderCount === b2);
}

// ============================================================
console.log('\n[2] 真正的遠端變更不可以被當成回音吞掉');
// ------------------------------------------------------------
{
  const data = { days: {}, pending: { ct_adm: 0 }, settings: { a: 1 } };
  api.setData(clone(data));
  api.setBase(api.snapshotOf(data));

  api.getData().pending.ct_adm = 5;
  api.noteSent('pending', { ct_adm: 5 });
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_adm: 5 }, settings: { a: 1 } }));

  // 桌寵/另一台裝置寫了 99(我們從沒送出過這個值)
  api.applyIncoming({ days: {}, pending: { ct_adm: 99 }, settings: { a: 1 } });
  check('遠端新值有被採用', api.getData().pending.ct_adm === 99, '實際 = ' + api.getData().pending.ct_adm);
  check('閘門已解除(不會永久 defer)', api.isStaleEcho('pending', { ct_adm: 5 }) === false);
}

// ============================================================
console.log('\n[3] days 路徑:病歷號打字中,舊回音不得蓋掉');
// ------------------------------------------------------------
{
  const D = '2026-07-21';
  const mk = (mr) => ({ counts: {}, procedures: [{ presetId: 'p', medRecord: mr }], meetings: [], updatedAt: 't' + mr.length });
  const data = { days: { [D]: mk('137') }, pending: {}, settings: {} };
  api.setData(clone(data));
  api.setBase(api.snapshotOf(data));

  // 打到 1371380,期間送出兩次
  api.getData().days[D].procedures[0].medRecord = '13713';
  api.noteSent('days/' + D, mk('13713'));
  api.getData().days[D].procedures[0].medRecord = '1371380';
  api.noteSent('days/' + D, mk('1371380'));
  api.setBase(api.snapshotOf({ days: { [D]: mk('1371380') }, pending: {}, settings: {} }));

  const before = renderCount;
  api.applyIncoming({ days: { [D]: mk('13713') }, pending: {}, settings: {} });   // 過期回音
  check('病歷號沒被截短', api.getData().days[D].procedures[0].medRecord === '1371380',
        '實際 = ' + api.getData().days[D].procedures[0].medRecord);
  check('沒有 renderAll', renderCount === before);
}

// ============================================================
console.log('\n[4] 桌寵寫同一天 counts 仍要收得到(不能被閘門擋掉)');
// ------------------------------------------------------------
{
  const D = '2026-07-21';
  const mine = { counts: { ct: { opd: 2 } }, procedures: [], meetings: [], updatedAt: 't1' };
  const data = { days: { [D]: mine }, pending: {}, settings: {} };
  api.setData(clone(data));
  api.setBase(api.snapshotOf(data));

  api.noteSent('days/' + D, mine);
  // 桌寵把 opd 加到 5(我們沒送出過這個形態)
  const theirs = { counts: { ct: { opd: 5 } }, procedures: [], meetings: [], updatedAt: 't2' };
  api.applyIncoming({ days: { [D]: theirs }, pending: {}, settings: {} });
  check('桌寵的 counts 有進來', api.getData().days[D].counts.ct.opd === 5,
        '實際 = ' + JSON.stringify(api.getData().days[D].counts));
}

// ============================================================
console.log('\n[5] key 順序不同不影響比對(SDK 重建物件的順序不保證)');
// ------------------------------------------------------------
{
  sentValuesReset();
  function sentValuesReset() {}
  const data = { days: {}, pending: {}, settings: { b: 2, a: 1 } };
  api.setData(clone(data));
  api.setBase(api.snapshotOf(data));

  api.noteSent('settings', { a: 1, b: 2, c: 3 });
  api.noteSent('settings', { a: 1, b: 2, c: 4 });
  // 回音把 key 順序打亂,但內容 = 我們寫過的舊值
  check('亂序的過期回音仍被認出', api.isStaleEcho('settings', { c: 3, b: 2, a: 1 }) === true);
}

// ============================================================
console.log('\n[6] 回音登記上限:超過 SENT_CAP 的久遠舊值不再被記得');
// ------------------------------------------------------------
{
  for (let i = 0; i < 20; i++) api.noteSent('probe', { v: i });
  check('最舊的已被丟出(v0)', api.isStaleEcho('probe', { v: 0 }) === false);
  for (let i = 0; i < 20; i++) api.noteSent('probe', { v: i });
  check('近期的仍認得(v15)', api.isStaleEcho('probe', { v: 15 }) === true);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
