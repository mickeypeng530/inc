// 加價項(3D / 資源共享)分流測試(2026-07-26)
// 從 index.html 抽真函式跑 —— 函式改名要同步改這裡。
const fs = require('fs');
const src = fs.readFileSync('C:/Users/彭嗣翔/Claude_Work/Worknum/index.html', 'utf8');

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
function grabConstLine(decl) {
  const i = src.indexOf(decl);
  if (i < 0) throw new Error('抽不到 ' + decl);
  return src.slice(i, src.indexOf('\n', i));
}

// SEED 的實際 preset / atomic 定義(直接從檔案抽,catalog 改了測試才抓得到)
function grabSeedEntry(marker) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('SEED 找不到 ' + marker);
  const start = src.lastIndexOf('{', i);
  let d = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(start, j + 1); }
  }
}

const code = [
  grabConstLine('const ATOMIC_AS_ADDON ='),
  grabConstLine('const MS_ADDON_PRICE ='),
  grabFn('presetAsAddons'), grabFn('addAddonsToDay'), grabFn('msDetectAddon'),
].join('\n');

// 真實 SEED 條目
const P_D3   = eval('(' + grabSeedEntry("id: 'd3',             name: '3D'") + ')');
const P_RS   = eval('(' + grabSeedEntry("id: 'res_share',      name: '資源共享'") + ')');
const P_RS6  = eval('(' + grabSeedEntry("id: 'res_share_6',    name: '資源共享*6'") + ')');
const A_D3   = eval('(' + grabSeedEntry("id: 'd3',      name: '3D'") + ')');
const A_RS   = eval('(' + grabSeedEntry("id: 'res_share', name: '資源共享'") + ')');

const api = new Function(`
  const state = { data: { settings: { atomicItems: ${JSON.stringify([A_D3, A_RS])} } } };
  ${code}
  return { presetAsAddons, addAddonsToDay, msDetectAddon };
`)();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const J = JSON.stringify;

console.log('\n[1] SEED 的加價 preset 都要被認出來');
{
  const d3 = api.presetAsAddons(P_D3, 1);
  check('3D → type d3 / count 1 / 600', J(d3) === J([{ type: 'd3', count: 1, amount: 600 }]), J(d3));

  const rs = api.presetAsAddons(P_RS, 1);
  check('資源共享 → source / 1 / 100', J(rs) === J([{ type: 'source', count: 1, amount: 100 }]), J(rs));

  // 「資源共享*6」preset 存的是總額 600(單價 100 × 6)→ 要還原成 count 6
  const rs6 = api.presetAsAddons(P_RS6, 1);
  check('資源共享*6 → source / count 6 / 單價 100', J(rs6) === J([{ type: 'source', count: 6, amount: 100 }]), J(rs6));
}

console.log('\n[2] 真 procedure 不可以被攔截');
{
  const pcn = { id: 'pcn_ap', name: 'PCN+A-P', items: [{ atomicId: 'pcn', amount: 3000 }, { atomicId: 'ap', amount: 315 }] };
  check('PCN+A-P → null(照常存 procedure)', api.presetAsAddons(pcn, 1) === null);
  check('空 items → null', api.presetAsAddons({ id: 'x', items: [] }, 1) === null);
  check('undefined preset → null', api.presetAsAddons(undefined, 1) === null);
  // 混合包刻意不攔截(拆開會讓金額歸屬更難追)
  const mixed = { id: 'm', items: [{ atomicId: 'pcn', amount: 3000 }, { atomicId: 'd3', amount: 600 }] };
  check('混合包 → null(不拆)', api.presetAsAddons(mixed, 1) === null);
}

console.log('\n[3] 數量 ×N');
{
  const r = api.presetAsAddons(P_D3, 3);
  check('3D ×3 → count 3', J(r) === J([{ type: 'd3', count: 3, amount: 600 }]), J(r));
  const r6 = api.presetAsAddons(P_RS6, 2);
  check('資源共享*6 ×2 → count 12', J(r6) === J([{ type: 'source', count: 12, amount: 100 }]), J(r6));
}

console.log('\n[4] 併進當天:同 type 合併而非長出重複列');
{
  const day = {};
  api.addAddonsToDay(day, api.presetAsAddons(P_D3, 1));
  api.addAddonsToDay(day, api.presetAsAddons(P_D3, 2));
  check('3D 兩次 → 合併成 count 3', J(day.addons) === J([{ type: 'd3', count: 3, amount: 600 }]), J(day.addons));

  api.addAddonsToDay(day, api.presetAsAddons(P_RS, 1));
  check('不同 type 另起一列', day.addons.length === 2, J(day.addons));
}

console.log('\n[5] 與匯入路徑產出的 addon 合併(欄位形狀要相容)');
{
  const day = { addons: [{ type: 'd3', count: 2, amount: 600, _import: true }] };
  api.addAddonsToDay(day, api.presetAsAddons(P_D3, 1));
  check('併進既有匯入列 → count 3,不新增列', day.addons.length === 1 && day.addons[0].count === 3, J(day.addons));
}

console.log('\n[6] 貼上文字的加價項辨識(msDetectAddon)');
{
  check('3D', J(api.msDetectAddon('3D')) === J(['d3', 1]));
  check('資源共享*4 → count 4', J(api.msDetectAddon('資源共享*4')) === J(['source', 4]));
  check('帶病歷號前綴 7000001 3D', J(api.msDetectAddon('7000001 3D')) === J(['d3', 1]));
  check('PICC 不是加價項', api.msDetectAddon('7000001 PICC') === null);
  check('空行 → null', api.msDetectAddon('  ') === null);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
