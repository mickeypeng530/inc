// 設定頁 preset「+ 加項目」後換品項,價格要跟著換(2026-10-29)
// 病根:新項目先塞清單第一項(PCN $3000),舊版只在 amount 為 0 時才帶預設價 → 永遠卡在 $3000
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
  }
}
const applyPresetItemAtom = new Function(grabFn('applyPresetItemAtom') + '; return applyPresetItemAtom;')();
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const ATOMS = [{ id: 'pcn', amount: 3000 }, { id: 'ap', amount: 315 }, { id: 'sono', amount: 600 }, { id: 'nb', amount: 1093 }];

console.log('\n[1] ⭐ 使用者回報的情境:+ 加項目(預設 PCN $3000)→ 改選 Sono');
{
  const it = { atomicId: 'pcn', amount: 3000 };
  applyPresetItemAtom(it, ATOMS, 'sono');
  check('品項換成 sono', it.atomicId === 'sono');
  check('⭐ 價格跟著變成 $600(舊版卡在 $3000)', it.amount === 600, it.amount);
  applyPresetItemAtom(it, ATOMS, 'nb');
  check('再換一次 → $1093', it.amount === 1093, it.amount);
}

console.log('\n[2] 手動改過的價格要保留');
{
  const it = { atomicId: 'pcn', amount: 2500 };          // 改過,不等於 PCN 預設 3000
  applyPresetItemAtom(it, ATOMS, 'sono');
  check('品項換成 sono', it.atomicId === 'sono');
  check('價格保留 $2500', it.amount === 2500, it.amount);
}

console.log('\n[3] 邊界');
{
  const a = { atomicId: 'pcn', amount: 0 }; applyPresetItemAtom(a, ATOMS, 'ap');
  check('原本 $0 → 帶新預設 $315', a.amount === 315, a.amount);
  const b = { atomicId: '', amount: undefined }; applyPresetItemAtom(b, ATOMS, 'ap');
  check('原本空 → 帶新預設', b.amount === 315, b.amount);
  const c = { atomicId: 'gone', amount: 777 }; applyPresetItemAtom(c, ATOMS, 'ap');
  check('舊品項已被刪(查不到)且價格非 0 → 保守保留', c.amount === 777, c.amount);
  const d = { atomicId: 'pcn', amount: '3000' }; applyPresetItemAtom(d, ATOMS, 'ap');
  check('字串型金額也認得是預設價', d.amount === 315, d.amount);
  const e = { atomicId: 'pcn', amount: 3000 }; applyPresetItemAtom(e, ATOMS, 'nope');
  check('新品項查不到 → 價格不動', e.atomicId === 'nope' && e.amount === 3000, e);
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
