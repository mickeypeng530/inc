// 本院 CT 加「CTA coa」(ct.cta_coa,2026-11-08,單價暫定 $2,000)
// 重點:使用者雲端的 unitPrices 不會跟 SEED 合併 → 舊設定裡沒有 cta_coa,
//       ① 收入計算不可因 undefined 變 NaN ② migration 只補缺的、不蓋使用者改過的
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
// 使用者雲端實際的單價形狀(2026-10-16 讀到的):CT 只有三項,沒有 ph、沒有 cta_coa
const userPrices = () => ({ bmd: 120, consult: 200, ct: { er_adm_self: 420, ldct_health: 554, opd: 350 },
  mr: { er_adm_health: 840, opd: 700 }, opd: 500, sono: 150, special: { swal: 231, hsg: 210 },
  xray: { er: 33, opd: 25, portable: 25 } });

console.log('\n[1] 計數清單');
{
  const ct = api.COUNTS_SCHEMA.find(g => g.group === 'CT').children;
  const c = ct.find(x => x.key === 'ct.cta_coa');
  check('CT 群組有 ct.cta_coa', !!c, ct.map(x => x.key));
  check('今日 tab 也顯示(不是 monthOnly)', c && !c.monthOnly);
  check('排在 LDCT 之後、PH 之前', ct.map(x => x.key).join() === 'ct.opd,ct.er_adm_self,ct.ldct_health,ct.cta_coa,ct.ph', ct.map(x => x.key).join());
}

console.log('\n[2] ⭐ 舊設定(沒有 cta_coa)也不會算出 NaN');
{
  const S = { unitPrices: userPrices() };
  const day = { counts: { ct: { opd: 3 } } };
  const r = api.calcBaseRevenue(day, S);
  check('⭐ 收入是數字(不是 NaN)', Number.isFinite(r), r);
  check('= 3 × 350 = 1,050', r === 1050, r);
  check('dayReadingByCat 的 CT 也不是 NaN', Number.isFinite(api.dayReadingByCat(day, S.unitPrices).ct));
}

console.log('\n[3] ⭐ migration:沒有值才補 $2,000,改過的不動');
{
  // 抽 runMigrations 裡 CTA 那段(整支 runMigrations 依賴太多 SEED 結構,這段本身是獨立的)
  const blk = src.slice(src.indexOf('if (data.settings?.unitPrices?.ct && data.settings.unitPrices.ct.cta_coa === undefined)'));
  const body = blk.slice(0, blk.indexOf('\n  }') + 4);
  const mig = new Function('data', body + '\nreturn data;');
  const a = mig({ settings: { unitPrices: userPrices() } });
  check('⭐ 舊設定補上 cta_coa = 2000', a.settings.unitPrices.ct.cta_coa === 2000, a.settings.unitPrices.ct);
  check('其他 CT 單價不動', a.settings.unitPrices.ct.opd === 350 && a.settings.unitPrices.ct.er_adm_self === 420);
  const b = mig({ settings: { unitPrices: { ...userPrices(), ct: { opd: 350, cta_coa: 1800 } } } });
  check('使用者改成 1800 → 不被蓋回 2000', b.settings.unitPrices.ct.cta_coa === 1800, b.settings.unitPrices.ct.cta_coa);
  const z = mig({ settings: { unitPrices: { ...userPrices(), ct: { opd: 350, cta_coa: 0 } } } });
  check('使用者改成 0 → 不被蓋回 2000', z.settings.unitPrices.ct.cta_coa === 0);
  check('沒有 settings 也不爆', !!mig({}));
  check('冪等:跑兩次結果一樣', mig(mig({ settings: { unitPrices: userPrices() } })).settings.unitPrices.ct.cta_coa === 2000);

  const S = a.settings;
  const day = { counts: { ct: { opd: 3, cta_coa: 2 } } };
  check('⭐ CTA 2 份 + CT OPD 3 → 2×2000 + 3×350 = 5,050', api.calcBaseRevenue(day, S) === 5050, api.calcBaseRevenue(day, S));
  check('各類報告收入的 CT 也含 CTA(4,000 + 1,050)', api.dayReadingByCat(day, S.unitPrices).ct === 5050);
  check('getUnitPriceForKey 查得到 2000', api.getUnitPriceForKey('ct.cta_coa', S) === 2000);
}

console.log('\n[4] SEED 預設');
check('新使用者的預設單價有 cta_coa 2000', /ct:\s*\{[^}]*cta_coa:\s*2000/.test(src));

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
