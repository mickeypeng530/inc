// storage.save / saveFull 寫入路徑選擇（Tier 1/2 + #3 後）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function grab(name, kw) {
  const s = src.indexOf(kw + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
const F = (n) => grab(n, 'function ');
const A = (n) => grab(n, 'async function ');
const storageSrc = src.match(/const storage = \{[\s\S]*?\n\};/)[0];

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };
const wait = () => new Promise(r => setTimeout(r, 10));

function build({ cloudReady, bootDone, lastSynced, cloudDays = {} }) {
  const calls = { set: [], update: [] };
  const harness = `
'use strict';
let cloudReady=__CR__, bootDone=__BD__, offlineEdits=false, syncSeq=0;
let lastSynced=__LS__;
const STORAGE_KEY='k';
const userPath='users/u1/worknum';
const userDataRef={}, fbDB={};
const localStorage={store:{},setItem(k,v){this.store[k]=v;},getItem(k){return this.store[k]??null;},removeItem(k){delete this.store[k];}};
const bcChannel=null;
const state={ data:{ days:{} } };
const renderAll=()=>{};
const ref=(db,p)=>({path:p});
const get=async(r)=>{ const d=r.path.split('/days/')[1]; const v=__cloud[d]; return { exists:()=>v!==undefined, val:()=>v }; };
const set=async(r,d)=>{ __calls.set.push(d); };
const update=async(r,u)=>{ __calls.update.push(JSON.parse(JSON.stringify(u))); };
${F('snapshotOf')}
${F('diffUpdates')}
${F('merge3')}
${A('guardDayUpdates')}
${A('_writeDirty')}
${F('_writeFull')}
${storageSrc}
return { storage, peek:()=>({cloudReady,offlineEdits,lastSynced}), ls:localStorage, setState:(d)=>{state.data=d;} };
`.replace('__CR__', cloudReady).replace('__BD__', bootDone).replace('__LS__', lastSynced ? JSON.stringify(lastSynced) : 'null');
  const api = new Function('__calls', '__cloud', harness)(calls, cloudDays);
  return { ...api, calls };
}

const data = { days: { '2026-07-08': { counts: { ct: { opd: 1 } } } }, settings: { theme: 'dark' } };
const snapOf = new Function(F('snapshotOf') + '\nreturn snapshotOf;')();

(async () => {

console.log('--- 離線（cloudReady=false）→ 一律不寫雲端 ---');
{
  const h = build({ cloudReady: false, bootDone: true, lastSynced: null });
  h.storage.save(data); await wait();
  chk('不呼叫 set', h.calls.set.length === 0);
  chk('不呼叫 update', h.calls.update.length === 0);
  chk('仍寫 localStorage', !!h.ls.store['k']);
  chk('標記 offlineEdits', h.peek().offlineEdits === true);
}

console.log('--- boot 期間離線 → 不誤標 offlineEdits ---');
{
  const h = build({ cloudReady: false, bootDone: false, lastSynced: null });
  h.storage.save(data); await wait();
  chk('不寫雲端', h.calls.set.length === 0 && h.calls.update.length === 0);
  chk('offlineEdits 維持 false', h.peek().offlineEdits === false);
}

console.log('--- 已連線 + 有基準 → 走 update 且只含髒路徑 ---');
{
  const baseline = snapOf(data);
  const cloud = { '2026-07-08': data.days['2026-07-08'] };
  const h = build({ cloudReady: true, bootDone: true, lastSynced: baseline, cloudDays: cloud });
  const next = JSON.parse(JSON.stringify(data));
  next.days['2026-07-08'].counts.ct.opd = 7;
  h.setState(next);
  h.storage.save(next); await wait();
  chk('不走全樹 set', h.calls.set.length === 0);
  chk('走 update', h.calls.update.length === 1, h.calls.update);
  chk('只有一條 days 路徑', h.calls.update[0] && Object.keys(h.calls.update[0]).length === 1, h.calls.update[0] && Object.keys(h.calls.update[0]));
}

console.log('--- 已連線但資料沒變 → 完全不寫 ---');
{
  const h = build({ cloudReady: true, bootDone: true, lastSynced: snapOf(data) });
  h.storage.save(JSON.parse(JSON.stringify(data))); await wait();
  chk('沒有任何雲端寫入', h.calls.set.length === 0 && h.calls.update.length === 0);
}

console.log('--- 沒有基準 → 保守走全樹 set ---');
{
  const h = build({ cloudReady: true, bootDone: true, lastSynced: null });
  h.storage.save(data); await wait();
  chk('走 set', h.calls.set.length === 1);
  chk('不走 update', h.calls.update.length === 0);
}

console.log('--- saveFull → 一律全樹 set ---');
{
  const h = build({ cloudReady: true, bootDone: true, lastSynced: snapOf(data) });
  h.storage.saveFull(data); await wait();
  chk('走 set', h.calls.set.length === 1);
  chk('不走 update', h.calls.update.length === 0);
}

console.log('--- undefined 保險絲仍有效（#1）---');
{
  const h = build({ cloudReady: true, bootDone: true, lastSynced: null });
  h.storage.save({ ...data, monthlyMeta: { '2026-07': { perfTotal: undefined, dutyNote: 'x' } } }); await wait();
  const p = h.calls.set[0];
  chk('payload 無 perfTotal key', p && !('perfTotal' in p.monthlyMeta['2026-07']), p && p.monthlyMeta);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
