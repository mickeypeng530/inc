// 本院 CT 加「Ca」(ct.ca,2026-11-14,院內 $120)—— 與 CTA coa 同一套做法(見 test_cta.js)
// 重點:使用者雲端的 unitPrices 不會跟 SEED 合併 → 舊設定裡沒有 ca,
//       ① 收入計算不可因 undefined 變 NaN ② migration 只補缺的、不蓋使用者改過的
// ⚠ 與中興的 Ca(day.xh.ca,$200)是兩件事:中興帳完全隔離,這裡只動本院
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{') { d++; st = true; } else if (c === '}') { d--; if (st && !d) return src.slice(i, j + 1); } }
}
function grabConst(name) {
  const i = src.indexOf('const ' + name);
  let d = 0, st = false;
  for (let j = i; j < src.length; j++) { const c = src[j]; if (c === '{' || c === '[') { d++; st = true; } else if (c === '}' || c === ']') { d--; if (st && !d) return src.slice(i, j + 1) + ';'; } }
}
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')); } };

const api = new Function(`
  ${grabConst('COUNTS_SCHEMA')}
  ${grabFn('getCount')} ${grabFn('getSpecialOthers')} ${grabFn('specialOthersTotalRev')}
  ${grabFn('calcBaseRevenue')} ${grabFn('dayReadingByCat')} ${grabFn('getUnitPriceForKey')}
  return { COUNTS_SCHEMA, calcBaseRevenue, dayReadingByCat, getUnitPriceForKey };
`)();
// 使用者雲端的單價形狀:有 cta_coa(上次 migration 補的),沒有 ca
const userPrices = () => ({ bmd: 120, consult: 200, ct: { er_adm_self: 420, ldct_health: 554, opd: 350, cta_coa: 2000 },
  mr: { er_adm_health: 840, opd: 700 }, opd: 500, sono: 150, special: { swal: 231, hsg: 210 },
  xray: { er: 33, opd: 25, portable: 25 } });

console.log('\n[1] 計數清單');
{
  const ct = api.COUNTS_SCHEMA.find(g => g.group === 'CT').children;
  const c = ct.find(x => x.key === 'ct.ca');
  check('CT 群組有 ct.ca', !!c, ct.map(x => x.key));
  check('標籤 = Ca', c && c.label === 'Ca');
  check('今日 tab 也顯示(不是 monthOnly)', c && !c.monthOnly);
  check('排在 CTA coa 之後、PH 之前', ct.map(x => x.key).join() === 'ct.opd,ct.er_adm_self,ct.ldct_health,ct.cta_coa,ct.ca,ct.ph', ct.map(x => x.key).join());
}

console.log('\n[2] ⭐ 舊設定(沒有 ca)也不會算出 NaN');
{
  const S = { unitPrices: userPrices() };
  const day = { counts: { ct: { opd: 2, ca: 3 } } };
  const r = api.calcBaseRevenue(day, S);
  check('⭐ 收入是數字(不是 NaN)', Number.isFinite(r), r);
  check('沒單價時 Ca 先算 0 → 2 × 350 = 700', r === 700, r);
  check('dayReadingByCat 的 CT 也不是 NaN', Number.isFinite(api.dayReadingByCat(day, S.unitPrices).ct));
}

console.log('\n[3] ⭐ migration:沒有值才補 $120,改過的不動');
{
  const blk = src.slice(src.indexOf('if (data.settings?.unitPrices?.ct && data.settings.unitPrices.ct.ca === undefined)'));
  const body = blk.slice(0, blk.indexOf('\n  }') + 4);
  const mig = new Function('data', body + '\nreturn data;');
  const a = mig({ settings: { unitPrices: userPrices() } });
  check('⭐ 舊設定補上 ca = 120', a.settings.unitPrices.ct.ca === 120, a.settings.unitPrices.ct);
  check('其他 CT 單價不動(含 CTA coa)', a.settings.unitPrices.ct.opd === 350 && a.settings.unitPrices.ct.cta_coa === 2000);
  const b = mig({ settings: { unitPrices: { ...userPrices(), ct: { opd: 350, ca: 150 } } } });
  check('使用者改成 150 → 不被蓋回 120', b.settings.unitPrices.ct.ca === 150);
  const z = mig({ settings: { unitPrices: { ...userPrices(), ct: { opd: 350, ca: 0 } } } });
  check('使用者改成 0 → 不被蓋回 120', z.settings.unitPrices.ct.ca === 0);
  check('沒有 settings 也不爆', !!mig({}));

  const S = a.settings;
  const day = { counts: { ct: { opd: 2, cta_coa: 1, ca: 3 } } };
  check('⭐ Ca 3 + CTA 1 + OPD 2 → 3×120 + 2000 + 2×350 = 3,060', api.calcBaseRevenue(day, S) === 3060, api.calcBaseRevenue(day, S));
  check('各類報告收入的 CT 也含 Ca', api.dayReadingByCat(day, S.unitPrices).ct === 3060, api.dayReadingByCat(day, S.unitPrices).ct);
  check('getUnitPriceForKey 查得到 120', api.getUnitPriceForKey('ct.ca', S) === 120);
}

console.log('\n[4] 中興的 Ca 不受影響');
{
  const S = { unitPrices: { ...userPrices(), ct: { ...userPrices().ct, ca: 120 } } };
  const day = { counts: { ct: { opd: 1 } }, xh: { ca: 8 } };
  check('⭐ 中興 8 個 Ca 不進本院收入(只算 CT OPD 350)', api.calcBaseRevenue(day, S) === 350, api.calcBaseRevenue(day, S));
}

console.log('\n[5] SEED 與設定頁');
check('新使用者的預設單價有 ca 120', /ct:\s*\{[^}]*\bca:\s*120/.test(src));
check('設定頁單價表有「CT Ca(院內)」', src.includes("['CT Ca(院內)', 'ct.ca']"));

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
