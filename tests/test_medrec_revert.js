// 病歷號打到一半「回溯」—— 後面打的字消失(2026-10-15)
//
// 重現路徑(全部用 index.html 抽出來的真函式):
//   ① 第一次存檔完成後,lastSynced = nextSnap = **本機形態**(插入序 key、帶空容器)
//   ② 第二次存檔的守門 guardDayUpdates 用**裸 JSON.stringify** 比「雲端該天」vs 基準 →
//      雲端是 RTDB 形態(字典序、空容器被丟掉)→ 永遠不相等 → 判定「有人動過」→ 走合併
//   ③ _writeDirty 合併分支在 await update() 回來後 `state.data.days[date] = m` ——
//      m 是**送出那一刻**的內容。update 往返期間使用者又打的字被整個蓋掉 + renderAll
//      重建欄位 → 畫面「回溯」;之後 debounce 存的是被蓋過的值 → 永久遺失。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fn(name) {
  const s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('not found ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
function afn(name) {
  const s = src.indexOf('async function ' + name + '(');
  if (s < 0) throw new Error('not found async ' + name);
  let i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
}
const storageSrc = src.match(/const storage = \{[\s\S]*?\n\};/)[0];

let pass = 0, fail = 0;
const chk = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e !== undefined ? '  → ' + JSON.stringify(e) : '')); } };

// RTDB 存進去再讀出來的形態:key 字典序、空物件/空陣列/null 消失(空字串 "" 會保留)
function rtdbShape(v) {
  if (Array.isArray(v)) { const a = v.map(rtdbShape).filter(x => x !== undefined); return a.length ? a : undefined; }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) { const s = rtdbShape(v[k]); if (s !== undefined) o[k] = s; }
    return Object.keys(o).length ? o : undefined;
  }
  if (v === null || v === undefined) return undefined;
  return v;
}

function build(cloud, hooks) {
  const harness = `
'use strict';
let cloudReady = true, bootDone = true, offlineEdits = false, syncSeq = 0;
let lastSynced = null;
const STORAGE_KEY = 'k';
const userPath = 'users/u1/worknum';
const userDataRef = {};
const fbDB = {};
const localStorage = { store:{}, setItem(k,v){this.store[k]=v;}, getItem(k){return this.store[k]??null;}, removeItem(k){delete this.store[k];} };
const bcChannel = null;
const state = { data: null };
const sentValues = new Map();
const SENT_CAP = 12;
const CLOUD_TIMEOUT_MS = 1000;
const ref = (db, p) => ({ path: p });
const get = async (r) => {
  const key = r.path.includes('/days/') ? r.path.split('/days/')[1] : r.path.split('/').pop();
  const v = __cloud[key];
  return { exists: () => v !== undefined, val: () => v === undefined ? null : JSON.parse(JSON.stringify(v)) };
};
const update = async (r, u) => {
  await __hooks.duringUpdate();                        // 往返期間使用者繼續打字
  for (const [p, v] of Object.entries(u)) {
    const key = p.startsWith('days/') ? p.slice(5) : p;
    const s = __rtdbShape(v);
    if (s === undefined) delete __cloud[key]; else __cloud[key] = s;
  }
};
const set = async () => {};
const renderAll = () => { __hooks.rendered++; };
${fn('getCount')}
${fn('getSpecialOthers')}
${fn('specialOthersTotalRev')}
${fn('calcProcRevenue')}
${fn('getDayProcRevenue')}
${fn('calcAddonRevenue')}
${fn('calcBaseRevenue')}
${fn('stampRevenue')}
${fn('snapshotOf')}
${fn('diffUpdates')}
${fn('merge3')}
${fn('canonJSON')}
${fn('noteSent')}
${fn('isStaleEcho')}
${fn('withTimeout')}
${afn('guardDayUpdates')}
${afn('guardTopUpdates')}
${afn('_writeDirty')}
${fn('_writeFull')}
${storageSrc}
return {
  storage,
  setBaseline: (raw) => { lastSynced = snapshotOf(raw); },
  setState: (d) => { state.data = d; },
  getState: () => state.data,
};
`;
  return new Function('__cloud', '__hooks', '__rtdbShape', harness)(cloud, hooks, rtdbShape);
}

const D = '2026-10-15';
const S = { unitPrices: { bmd:120, consult:200, ct:{er_adm_self:420, ldct_health:554, opd:350, ph:350},
  mr:{er_adm_health:840, opd:700, ph:700}, opd:500, sono:150, special:{swal:231, hsg:210},
  xray:{er:33, opd:25, portable:25, ph:25} } };
const tick = () => new Promise(r => setTimeout(r, 5));

(async () => {

console.log('');
console.log('[1] ⭐ 第二次存檔的 update 往返期間繼續打字 → 不可以被蓋回去');
{
  // 本機形態(_normalizeData 之後):插入序 + 空容器
  const local = { days: { [D]: { counts: {}, procedures: [{ presetId: 'pcn', presetName: 'PCN', medRecord: '', items: [{ atomicId: 'pcn', name: 'PCN', amount: 3000 }] }],
                                 meetings: [], overtimeHours: 0, schedule: {}, notes: '' } }, settings: S };
  const cloud = { [D]: rtdbShape(local.days[D]), settings: rtdbShape(S) };
  const hooks = { rendered: 0, duringUpdate: async () => {} };
  const h = build(cloud, hooks);
  h.setBaseline({ days: { [D]: cloud[D] }, settings: cloud.settings });   // boot:基準 = 雲端原始形態
  h.setState(local);

  // 第一次存檔:打了「700」
  local.days[D].procedures[0].medRecord = '700';
  local.days[D].updatedAt = '2026-10-15T01:00:00.000Z';
  h.storage.save(local);
  await tick();
  chk('第一次存檔寫上雲端', cloud[D].procedures[0].medRecord === '700', cloud[D].procedures[0]);

  // 第二次存檔:打到「70000」;往返期間又打了「01」
  local.days[D].procedures[0].medRecord = '70000';
  local.days[D].updatedAt = '2026-10-15T01:00:01.000Z';
  hooks.duringUpdate = async () => {
    const st = h.getState();
    st.days[D].procedures[0].medRecord = '7000001';
    st.days[D].updatedAt = '2026-10-15T01:00:02.000Z';
  };
  h.storage.save(local);
  await tick();
  hooks.duringUpdate = async () => {};
  const mr = h.getState().days[D].procedures[0].medRecord;
  chk('⭐ 往返期間打的字還在(7000001,不是 70000)', mr === '7000001', mr);
  chk('⭐ 沒有人並發時不應該重繪(重繪 = 重建正在打的欄位)', hooks.rendered === 0, hooks.rendered);

  // 之後那次 debounce 存檔要把 7000001 送上去
  h.storage.save(h.getState());
  await tick();
  chk('最終雲端 = 7000001', cloud[D].procedures[0].medRecord === '7000001', cloud[D].procedures[0]);
}

console.log('');
console.log('[2] 真的有並發(桌寵改了 counts)→ 仍要合併,且往返期間的打字也要保住');
{
  const local = { days: { [D]: { counts: { ct: { opd: 3 } }, procedures: [{ presetId: 'pcn', presetName: 'PCN', medRecord: '', items: [{ atomicId: 'pcn', name: 'PCN', amount: 3000 }] }],
                                 meetings: [], overtimeHours: 0, schedule: {}, notes: '' } }, settings: S };
  const cloud = { [D]: rtdbShape(local.days[D]), settings: rtdbShape(S) };
  const hooks = { rendered: 0, duringUpdate: async () => {} };
  const h = build(cloud, hooks);
  h.setBaseline({ days: { [D]: cloud[D] }, settings: cloud.settings });
  h.setState(local);

  cloud[D].counts.ct.opd = 4;                         // 桌寵 +1(web 還沒收到)
  local.days[D].procedures[0].medRecord = '70000';
  local.days[D].updatedAt = '2026-10-15T02:00:00.000Z';
  hooks.duringUpdate = async () => {
    const st = h.getState();
    st.days[D].procedures[0].medRecord = '7000001';
  };
  h.storage.save(local);
  await tick();
  const day = h.getState().days[D];
  chk('桌寵的 +1 有併進來(opd=4)', day.counts.ct.opd === 4, day.counts);
  chk('雲端也是 opd=4', cloud[D].counts.ct.opd === 4, cloud[D].counts);
  chk('⭐ 往返期間打的字還在', day.procedures[0].medRecord === '7000001', day.procedures[0].medRecord);
  chk('合併後空容器沒有被弄丟(meetings 仍是陣列)', Array.isArray(day.meetings), Object.keys(day));
}

console.log('');
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
})();
