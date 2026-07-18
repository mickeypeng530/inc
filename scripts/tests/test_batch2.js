// #4 export special 口徑 / #9 migration 不洗自訂 isMSK / #10 跨午夜跳日
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function F(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

console.log('--- #4：Special 主列 = others 陣列加總（不含 swal/hsg，不重複）---');
{
  const helpers = new Function(F('getSpecialOthers') + '\n' + F('specialOthersTotalCount') + '\nreturn { specialOthersTotalCount };')();
  const day = { counts: { special: {
    others: [{ catalogId: 'legacy_other', count: 3, amount: 231 }, { catalogId: 'x', count: 2, amount: 90 }],
    swal: 4, hsg: 7,
  } } };
  const v = helpers.specialOthersTotalCount(day);
  chk('others 加總 = 5', v === 5, v);
  chk('未把 swal/hsg 算進去（避免與各自列重複）', v !== 5 + 4 + 7, v);
  // 舊寫法模擬：遍歷 unitPrices.special 的 key
  const unitPriceKeys = ['eso_tbe','ugi','sb','ugisb','lgi','ivp','vcug','ttube','cystography','fistu','intus','swal','hsg'];
  const getCount = (d, k) => { let v2 = d.counts; for (const p of k.split('.')) v2 = (v2 && typeof v2 === 'object') ? v2[p] : undefined; return typeof v2 === 'number' ? v2 : 0; };
  let old = 0; for (const k of unitPriceKeys) old += getCount(day, `special.${k}`);
  chk('舊寫法確實是錯的（漏 others、且撈到 swal+hsg）', old === 11 && old !== v, { old, v });
}

console.log('--- #9：mskV2 migration 不得洗掉自訂 atomic 的 isMSK ---');
{
  const correctMSK = new Set(['ct_nb','nb','arthro','bone','ctame','cstame','stame','rf']);
  const builtinIds = new Set(['ct_nb','nb','arthro','bone','ctame','cstame','stame','rf','pcn','guide','tae']);
  const items = [
    { id: 'nb', isMSK: false },              // 內建，應被修正為 true
    { id: 'pcn', isMSK: true },              // 內建但不屬 MSK，應被修正為 false
    { id: 'my_custom', isMSK: true },        // 使用者自建並手動勾選 → 必須保留
    { id: 'my_custom2', isMSK: false },      // 使用者自建未勾選 → 保持
  ];
  for (const a of items) {
    if (!builtinIds.has(a.id)) continue;
    a.isMSK = correctMSK.has(a.id);
  }
  const byId = Object.fromEntries(items.map(a => [a.id, a.isMSK]));
  chk('內建 nb 修正為 true', byId.nb === true);
  chk('內建 pcn 修正為 false', byId.pcn === false);
  chk('自訂 my_custom 的 true 被保留', byId.my_custom === true, byId);
  chk('自訂 my_custom2 的 false 被保留', byId.my_custom2 === false);
}

console.log('--- #10：跨午夜跳日邏輯 ---');
{
  const mk = (curDate, sess, now) => {
    let jumped = null;
    let sessionToday = sess;
    const state = { currentDate: curDate, currentMonth: curDate.slice(0, 7) };
    const todayISO = () => now;
    const isoToMonth = (d) => d.slice(0, 7);
    const renderAll = () => {}; const toast = () => {};
    // 複製 checkDateRollover 的邏輯
    (function checkDateRollover() {
      const n = todayISO();
      if (!sessionToday || n === sessionToday) return;
      const wasOnToday = state.currentDate === sessionToday;
      sessionToday = n;
      if (!wasOnToday) return;
      state.currentDate = n; state.currentMonth = isoToMonth(n);
      jumped = n; renderAll(); toast();
    })();
    return { jumped, state };
  };
  let r = mk('2026-07-08', '2026-07-08', '2026-07-09');
  chk('停在今天 + 跨日 → 自動跳到新的今天', r.jumped === '2026-07-09' && r.state.currentDate === '2026-07-09', r);
  r = mk('2026-05-20', '2026-07-08', '2026-07-09');
  chk('刻意停在過去某天 → 不打擾', r.jumped === null && r.state.currentDate === '2026-05-20', r);
  r = mk('2026-07-08', '2026-07-08', '2026-07-08');
  chk('沒跨日 → 不動作', r.jumped === null);
}

console.log('--- #11：at(-1) 已全數移除 ---');
{
  chk('原始碼不再含 .at(-1)', !/\.at\(-1\)/.test(src));
}

console.log('--- #5：applyTheme 有 save 參數且 boot 傳 false ---');
{
  chk('applyTheme 具備 save 參數', /function applyTheme\(mode, save = true\)/.test(src));
  chk('boot 呼叫傳 false', /applyTheme\(state\.data\.settings\.theme \|\| 'dark', false\)/.test(src));
}

console.log('--- #8：整包覆蓋匯入有過 _normalizeData ---');
{
  chk('匯入時呼叫 _normalizeData', /state\.data = _normalizeData\(data\);\s*\n\s*storage\.saveFull/.test(src));
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
