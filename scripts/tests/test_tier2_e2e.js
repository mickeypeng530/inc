// Tier 2 端對端：storage.save → guardDayUpdates → update，模擬桌寵並發寫入
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
function fn(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
function afn(name) {   // async function
  const s = src.indexOf('async function ' + name + '(');
  if (s < 0) throw new Error('not found async ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
const storageSrc = src.match(/const storage = \{[\s\S]*?\n\};/)[0];

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

function build(cloudDays, opts = {}) {
  const calls = { update: [], set: [] };
  const harness = `
'use strict';
let cloudReady = true, bootDone = true, offlineEdits = false, suppressNextOnValue = false, syncSeq = 0;
let lastSynced = null;
const STORAGE_KEY = 'k';
const userPath = 'users/u1/worknum';
const userDataRef = {};
const fbDB = {};
const localStorage = { store:{}, setItem(k,v){this.store[k]=v;}, getItem(k){return this.store[k]??null;}, removeItem(k){delete this.store[k];} };
const bcChannel = null;
const state = { data: null };
const ref = (db, path) => ({ path });
const get = async (r) => {
  if (__opts.failRead) throw new Error('offline');
  const date = r.path.split('/days/')[1];
  const v = __cloud[date];
  return { exists: () => v !== undefined, val: () => v };
};
const update = async (r, u) => { __calls.update.push(JSON.parse(JSON.stringify(u))); Object.assign(__applied, u); };
const set = async (r, d) => { __calls.set.push(d); };
const renderAll = () => { __rendered.n++; };
${fn('snapshotOf')}
${fn('diffUpdates')}
${fn('merge3')}
${afn('guardDayUpdates')}
${afn('_writeDirty')}
${fn('_writeFull')}
${storageSrc}
return {
  storage,
  setBaseline: (d) => { lastSynced = snapshotOf(d); },
  setState: (d) => { state.data = d; },
  peek: () => ({ lastSynced, syncSeq }),
  getState: () => state.data,
};
`;
  const applied = {}, rendered = { n: 0 };
  const api = new Function('__calls', '__cloud', '__opts', '__applied', '__rendered', harness)(calls, cloudDays, opts, applied, rendered);
  return { ...api, calls, applied, rendered };
}

const wait = () => new Promise(r => setTimeout(r, 10));

(async () => {

console.log('--- 1. 桌寵在 web 載入後改了 counts；web 改加班 → 兩邊都保住 ---');
{
  const baseline = { days: { '2026-07-08': { counts: { ct: { opd: 3 } }, overtimeHours: 0, updatedAt: 'T0' } }, settings: { theme: 'dark' } };
  const cloud = { '2026-07-08': { counts: { ct: { opd: 5 } }, overtimeHours: 0, updatedAt: 'T1' } };  // 桌寵寫入
  const h = build(cloud);
  h.setBaseline(baseline);
  const local = JSON.parse(JSON.stringify(baseline));
  local.days['2026-07-08'].overtimeHours = 8;                 // web 改加班
  local.days['2026-07-08'].updatedAt = 'T2';
  h.setState(local);
  h.storage.save(local);
  await wait();
  const written = h.calls.update[0] && h.calls.update[0]['days/2026-07-08'];
  chk('有寫入', !!written, h.calls.update);
  chk('桌寵 counts 保留 opd=5', written && written.counts.ct.opd === 5, written && written.counts);
  chk('web 加班保留 8', written && written.overtimeHours === 8, written && written.overtimeHours);
  chk('合併結果回寫本地 state', h.getState().days['2026-07-08'].counts.ct.opd === 5, h.getState().days['2026-07-08'].counts);
  chk('有觸發 renderAll 讓畫面同步', h.rendered.n === 1, h.rendered.n);
}

console.log('--- 2. 雲端與基準一致（無人並發）→ 直接寫，不做合併、不 renderAll ---');
{
  const baseline = { days: { '2026-07-08': { counts: { ct: { opd: 3 } }, updatedAt: 'T0' } }, settings: {} };
  const cloud = { '2026-07-08': { counts: { ct: { opd: 3 } }, updatedAt: 'T0' } };
  const h = build(cloud);
  h.setBaseline(baseline);
  const local = JSON.parse(JSON.stringify(baseline));
  local.days['2026-07-08'].counts.ct.opd = 7;
  h.setState(local);
  h.storage.save(local);
  await wait();
  const w = h.calls.update[0] && h.calls.update[0]['days/2026-07-08'];
  chk('寫入 web 的值 7', w && w.counts.ct.opd === 7, w && w.counts);
  chk('沒有多餘 renderAll', h.rendered.n === 0, h.rendered.n);
}

console.log('--- 3. 讀雲端失敗 → 該天從 payload 移除，絕不盲蓋 ---');
{
  const baseline = { days: { '2026-07-08': { counts: { ct: { opd: 3 } }, updatedAt: 'T0' } }, settings: { theme: 'dark' } };
  const h = build({}, { failRead: true });
  h.setBaseline(baseline);
  const local = JSON.parse(JSON.stringify(baseline));
  local.days['2026-07-08'].counts.ct.opd = 7;
  local.settings.theme = 'light';        // 同時改 settings（非 day，不受守門影響）
  h.setState(local);
  h.storage.save(local);
  await wait();
  const u = h.calls.update[0] || {};
  chk('該天未被寫入', !('days/2026-07-08' in u), Object.keys(u));
  chk('settings 仍正常寫入', u.settings && u.settings.theme === 'light', u.settings);
}

console.log('--- 4. 雲端該天不存在（新的一天）→ 正常寫入 ---');
{
  const baseline = { days: {}, settings: {} };
  const h = build({});
  h.setBaseline(baseline);
  const local = { days: { '2026-07-09': { counts: { bmd: 2 } } }, settings: {} };
  h.setState(local);
  h.storage.save(local);
  await wait();
  const w = h.calls.update[0] && h.calls.update[0]['days/2026-07-09'];
  chk('新的一天正常寫入', w && w.counts.bmd === 2, h.calls.update[0]);
}

console.log('--- 5. 合併後基準收斂 → 立刻再存一次不應再寫 ---');
{
  const baseline = { days: { '2026-07-08': { counts: { ct: { opd: 3 } }, overtimeHours: 0, updatedAt: 'T0' } }, settings: {} };
  const cloud = { '2026-07-08': { counts: { ct: { opd: 5 } }, overtimeHours: 0, updatedAt: 'T1' } };
  const h = build(cloud);
  h.setBaseline(baseline);
  const local = JSON.parse(JSON.stringify(baseline));
  local.days['2026-07-08'].overtimeHours = 8;
  h.setState(local);
  h.storage.save(local);
  await wait();
  const firstCount = h.calls.update.length;
  // 合併後 state 已收斂；雲端也更新成合併值
  cloud['2026-07-08'] = h.getState().days['2026-07-08'];
  h.storage.save(h.getState());
  await wait();
  chk('第二次存檔沒有再寫雲端', h.calls.update.length === firstCount, h.calls.update.length);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
})();
