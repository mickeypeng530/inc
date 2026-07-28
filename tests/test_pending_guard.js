// Tier 2 top-level 守門(pending)的回歸測試(2026-07-28)
// 背景:days/{date} 有守門、top-level 沒有 → 閒置(監聽已死、基準凍結)的視窗
// 只要改一個計數,就會把整包舊 pending 蓋回雲端 =「待打來回跳」。
// 從 index.html 抽真正的函式來跑,不重寫一份邏輯。用大括號配對抽取 → 函式改名要同步改這裡。
const fs = require('fs');
const path = 'C:/Users/彭嗣翔/Claude_Work/Worknum/index.html';
const src = fs.readFileSync(path, 'utf8');

function grabFn(name) {
  const sig = 'function ' + name + '(';
  let i = src.indexOf(sig);
  if (i < 0) throw new Error('抽不到 ' + name);
  if (src.slice(i - 6, i) === 'async ') i -= 6;   // async function 的 async 不能掉
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('括號沒配對 ' + name);
}

const code = [
  grabFn('canonJSON'), grabFn('merge3'), grabFn('snapshotOf'), grabFn('guardTopUpdates'),
].join('\n');

// --- 環境替身:雲端只有 users/{uid}/pending 這一個節點會被讀到 ---
let cloudPending = null;      // 測試前設定
let getShouldThrow = false;
let getCalls = 0;
const harness = `
  let lastSynced = null;
  const userPath = 'users/u/worknum';
  const fbDB = {};
  const CLOUD_TIMEOUT_MS = 1000;
  const withTimeout = (p) => p;                       // 逾時本身不是本測試的標的
  const ref = (_db, p) => p;
  const get = async (p) => {
    __call();
    if (__throws()) throw new Error('模擬讀取失敗');
    const v = __cloud();
    return { exists: () => v !== null, val: () => v };
  };
  ${code}
  return { guardTopUpdates, snapshotOf, setBase: (s) => { lastSynced = s; } };
`;
const api = new Function('__call', '__throws', '__cloud', harness)(
  () => getCalls++, () => getShouldThrow, () => cloudPending);

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// ============================================================
console.log('\n[1] 病根重現:閒置視窗只改了 ct_opd,不可以把別人改過的 mr_opd 一起蓋回去');
// ------------------------------------------------------------
// 基準(凍結於監聽斷掉那一刻)= {ct_opd:5, mr_opd:3}
// 本機:使用者在這個視窗把 ct_opd 改成 4(mr_opd 沒碰)
// 雲端:這期間桌寵寫了 MR 計數 → 主視窗補扣 → mr_opd 變成 1
{
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_opd: 5, mr_opd: 3 } }));
  cloudPending = { ct_opd: 5, mr_opd: 1 };
  const updates = { pending: { ct_opd: 4, mr_opd: 3 } };

  const m = api.guardTopUpdates(updates);
  return m.then((merged) => {
    check('有觸發合併', !!merged);
    check('本機動過的 ct_opd 以本機為準(4)', updates.pending.ct_opd === 4, '實際 = ' + updates.pending.ct_opd);
    check('本機沒動的 mr_opd 跟隨雲端(1),不被蓋回 3',
          updates.pending.mr_opd === 1, '實際 = ' + updates.pending.mr_opd);
    run2();
  });
}

// ============================================================
function run2() {
  console.log('\n[2] 雲端沒人動過 → 不必合併,照原樣寫(避免白跑 merge3)');
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_opd: 5, mr_opd: 3 } }));
  cloudPending = { mr_opd: 3, ct_opd: 5 };          // 鍵序不同,內容相同
  const updates = { pending: { ct_opd: 4, mr_opd: 3 } };
  api.guardTopUpdates(updates).then((merged) => {
    check('鍵序不同不算衝突(canonJSON 比對)', merged === null);
    check('payload 原封不動', updates.pending.ct_opd === 4 && updates.pending.mr_opd === 3);
    run3();
  });
}

// ============================================================
function run3() {
  console.log('\n[3] 讀不到雲端 → 從 payload 移除 pending(寧可不寫也不盲蓋)');
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_opd: 5 } }));
  getShouldThrow = true;
  const updates = { pending: { ct_opd: 4 }, 'days/2026-07-28': { counts: {} } };
  api.guardTopUpdates(updates).then((merged) => {
    getShouldThrow = false;
    check('回傳 null', merged === null);
    check('pending 已被移出 payload', !('pending' in updates));
    check('其他路徑不受影響', 'days/2026-07-28' in updates);
    run4();
  });
}

// ============================================================
function run4() {
  console.log('\n[4] payload 沒有 pending → 不該多打一次雲端');
  const before = getCalls;
  api.guardTopUpdates({ 'days/2026-07-28': { counts: {} } }).then((merged) => {
    check('回傳 null', merged === null);
    check('沒有多餘的 get()', getCalls === before, `多了 ${getCalls - before} 次`);
    run5();
  });
}

// ============================================================
function run5() {
  console.log('\n[5] 雲端還沒有 pending 節點(第一次寫)→ 直接採用本機,不炸');
  api.setBase(api.snapshotOf({ days: {}, pending: { ct_opd: 5 } }));
  cloudPending = null;
  const updates = { pending: { ct_opd: 4 } };
  api.guardTopUpdates(updates).then((merged) => {
    check('不 throw 且 ct_opd 保留本機值', updates.pending.ct_opd === 4, '實際 = ' + updates.pending.ct_opd);
    done();
  });
}

function done() {
  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail ? 1 : 0);
}
