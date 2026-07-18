// #3：遠端更新不得蒸發未存編輯 / 不得無謂重繪；debounce flush 收得齊
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function fn(name, kw = 'function ') {
  const s = src.indexOf(kw + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

function build(initialData, baselineData) {
  const saved = [];
  const rendered = { n: 0 };
  const harness = `
'use strict';
const STORAGE_KEY='k';
const localStorage={store:{},setItem(k,v){this.store[k]=v;},getItem(k){return this.store[k]??null;},removeItem(k){delete this.store[k];}};
const state={ data:__init, saveDebounce:null, noteDebounce:null, schedDebounce:null, monthSaveDebounce:null, mmDebounce:null };
const storage={ save(d){ __saved.push(JSON.parse(JSON.stringify(d))); } };
const renderAll=()=>{ __rendered.n++; };
const _normalizeData=(d)=>{ d.days=d.days||{}; d.settings=d.settings||{}; return d; };
let lastSynced=null;
const _pendingFlush = new Map();
${fn('snapshotOf')}
${fn('merge3')}
${fn('scheduleSave')}
${fn('flushPendingSaves')}
${fn('applyIncoming')}
lastSynced = snapshotOf(__base);
return { state, applyIncoming, scheduleSave, flushPendingSaves, getPending: () => _pendingFlush.size, getLastSynced: () => lastSynced, localStorage };
`.replace('__init', JSON.stringify(initialData)).replace('__base', JSON.stringify(baselineData));
  const api = new Function('__saved', '__rendered', harness)(saved, rendered);
  return { ...api, saved, rendered };
}

console.log('--- 1. flush 會把排隊中的存檔立刻執行 ---');
{
  const h = build({ days: {}, settings: {} }, { days: {}, settings: {} });
  h.scheduleSave('saveDebounce', () => h.saved.push('A'), 9999);
  h.scheduleSave('mmDebounce', () => h.saved.push('B'), 9999);
  chk('有 2 個待執行', h.getPending() === 2, h.getPending());
  h.flushPendingSaves();
  chk('flush 後全部執行', h.saved.includes('A') && h.saved.includes('B'), h.saved);
  chk('佇列已清空', h.getPending() === 0);
}

console.log('--- 2. 同 key 重複排程只保留最後一次(debounce 語意不變)---');
{
  const h = build({ days: {}, settings: {} }, { days: {}, settings: {} });
  h.scheduleSave('saveDebounce', () => h.saved.push('old'), 9999);
  h.scheduleSave('saveDebounce', () => h.saved.push('new'), 9999);
  h.flushPendingSaves();
  chk('只執行最後一次', h.saved.length === 1 && h.saved[0] === 'new', h.saved);
}

console.log('--- 3. 遠端更新到達時,未存編輯先落盤(不蒸發)---');
{
  const base = { days: { '2026-07-08': { counts: { ct: { opd: 3 } } } }, settings: {} };
  const local = JSON.parse(JSON.stringify(base));
  local.days['2026-07-08'].overtimeHours = 8;          // 使用者剛打的，還在 debounce
  const h = build(local, base);
  let flushed = false;
  h.scheduleSave('saveDebounce', () => { flushed = true; }, 9999);
  const remote = { days: { '2026-07-08': { counts: { ct: { opd: 5 } } } }, settings: {} };  // 桌寵
  h.applyIncoming(remote);
  chk('未存編輯已被 flush', flushed === true);
  chk('本機加班保住 (8)', h.state.data.days['2026-07-08'].overtimeHours === 8, h.state.data.days['2026-07-08']);
  chk('桌寵 counts 進來 (5)', h.state.data.days['2026-07-08'].counts.ct.opd === 5, h.state.data.days['2026-07-08'].counts);
}

console.log('--- 4. 自己的回音(內容相同)→ 完全不重繪 ---');
{
  const base = { days: { '2026-07-08': { counts: { ct: { opd: 3 } } } }, settings: {} };
  const h = build(JSON.parse(JSON.stringify(base)), base);
  h.applyIncoming(JSON.parse(JSON.stringify(base)));
  chk('沒有觸發 renderAll', h.rendered.n === 0, h.rendered.n);
  chk('基準仍更新', !!h.getLastSynced());
}

console.log('--- 5. 真的有變化 → 會重繪 ---');
{
  const base = { days: { '2026-07-08': { counts: { ct: { opd: 3 } } } }, settings: {} };
  const h = build(JSON.parse(JSON.stringify(base)), base);
  h.applyIncoming({ days: { '2026-07-08': { counts: { ct: { opd: 9 } } } }, settings: {} });
  chk('有重繪', h.rendered.n === 1, h.rendered.n);
  chk('採用遠端值 9', h.state.data.days['2026-07-08'].counts.ct.opd === 9);
}

console.log('--- 6. 遠端新增一天 → 本機跟著出現 ---');
{
  const base = { days: {}, settings: {} };
  const h = build({ days: {}, settings: {} }, base);
  h.applyIncoming({ days: { '2026-07-09': { counts: { bmd: 2 } } }, settings: {} });
  chk('新的一天出現', h.state.data.days['2026-07-09'].counts.bmd === 2, h.state.data.days);
}

console.log('--- 7. 本機新增、遠端還沒有 → 不被遠端抹掉 ---');
{
  const base = { days: {}, settings: {} };
  const local = { days: { '2026-07-10': { counts: { bmd: 1 } } }, settings: {} };
  const h = build(local, base);
  h.applyIncoming({ days: {}, settings: {} });
  chk('本機新增的天保留', h.state.data.days['2026-07-10'] !== undefined, h.state.data.days);
}

console.log('--- 8. settings：本機改過就不被遠端覆蓋 ---');
{
  const base = { days: {}, settings: { theme: 'dark' } };
  const local = { days: {}, settings: { theme: 'light' } };   // 本機剛切主題
  const h = build(local, base);
  h.applyIncoming({ days: {}, settings: { theme: 'dark' } });
  chk('保留本機 light', h.state.data.settings.theme === 'light', h.state.data.settings);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
