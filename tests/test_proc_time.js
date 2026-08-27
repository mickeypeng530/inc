// procedure 起訖時間 / 耗時計算(2026-07-30)
// 從 index.html 抽真函式 → 函式改名要同步改這裡。
const fs = require('fs');
const src = fs.readFileSync('C:/Users/彭嗣翔/Claude_Work/Worknum/index.html', 'utf8');
function grabFn(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('抽不到 ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('括號沒配對 ' + name);
}
const api = new Function(`
  ${grabFn('normalizeTime')}
  ${grabFn('spanMinutes')}
  ${grabFn('procDuration')}
  ${grabFn('mtgDuration')}
  ${grabFn('fmtDur')}
  ${grabFn('setProcTimeField')}
  ${grabFn('opdSlots')} ${grabFn('opdSlotMinutes')} ${grabFn('opdTotalMinutes')} ${grabFn('migrateOpdSlots')}
  return { normalizeTime, spanMinutes, procDuration, mtgDuration, fmtDur, setProcTimeField,
           opdSlots, opdSlotMinutes, opdTotalMinutes, migrateOpdSlots };
`)();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('');
console.log('[1] 基本耗時');
check('09:00 → 09:45 = 45 分', api.procDuration({ startTime: '09:00', endTime: '09:45' }) === 45);
check('14:30 → 16:10 = 100 分', api.procDuration({ startTime: '14:30', endTime: '16:10' }) === 100);
check('同時間 = 0 分', api.procDuration({ startTime: '10:00', endTime: '10:00' }) === 0);

console.log('');
console.log('[2] 跨午夜不可以算成負值(值班常見)');
check('23:40 → 00:20 = 40 分', api.procDuration({ startTime: '23:40', endTime: '00:20' }) === 40,
      '實際 = ' + api.procDuration({ startTime: '23:40', endTime: '00:20' }));
check('22:00 → 01:30 = 210 分', api.procDuration({ startTime: '22:00', endTime: '01:30' }) === 210);

console.log('');
console.log('[3] 選填 —— 缺一邊或格式壞掉一律回 null(不顯示耗時,不當 0)');
check('只有開始 → null', api.procDuration({ startTime: '09:00' }) === null);
check('只有結束 → null', api.procDuration({ endTime: '09:00' }) === null);
check('兩邊都沒有 → null', api.procDuration({}) === null);
check('undefined rec → null', api.procDuration(undefined) === null);
check('空字串 → null', api.procDuration({ startTime: '', endTime: '10:00' }) === null);
check('壞格式 → null', api.procDuration({ startTime: 'abc', endTime: '10:00' }) === null);

console.log('');
console.log('[4] 顯示格式');
check('45 → 「45 分」', api.fmtDur(45) === '45 分', api.fmtDur(45));
check('60 → 「1 時 0 分」', api.fmtDur(60) === '1 時 0 分', api.fmtDur(60));
check('100 → 「1 時 40 分」', api.fmtDur(100) === '1 時 40 分', api.fmtDur(100));
check('null → 空字串', api.fmtDur(null) === '');

console.log('');
console.log('[5] 清空一律 delete,不留 undefined(RTDB 遇巢狀 undefined 會同步 throw)');
{
  const rec = { presetId: 'p', startTime: '09:00', endTime: '10:00' };
  api.setProcTimeField(rec, 'startTime', '');
  check('清空後 key 不存在', !('startTime' in rec), JSON.stringify(rec));
  check('JSON 不含 undefined', JSON.stringify(rec) === '{"presetId":"p","endTime":"10:00"}', JSON.stringify(rec));
  api.setProcTimeField(rec, 'startTime', ' 08:30 ');
  check('有值會 trim 後寫入', rec.startTime === '08:30', rec.startTime);
}

console.log('');
// ============================================================
console.log('');
console.log('[6] normalizeTime —— 自製時間欄的格式化(取代 native type=time)');
// ------------------------------------------------------------
// 換掉原生的兩個理由:①zh-TW 的 AM/PM 段選完不會自動跳,且段間無法程式化移動
// ②分鐘只打一位數 value 就已合法(08:1 → 08:01),任何「填完就跳」都會提早觸發。
{
  const T = api.normalizeTime;
  check('空 → 空字串', T('') === '' && T(null) === '' && T('   ') === '');
  check('「8」→ 08:00', T('8') === '08:00', T('8'));
  check('「12」→ 12:00', T('12') === '12:00', T('12'));
  check('「830」→ 08:30', T('830') === '08:30', T('830'));
  check('「0815」→ 08:15', T('0815') === '08:15', T('0815'));
  check('「1430」→ 14:30', T('1430') === '14:30', T('1430'));
  check('「2359」→ 23:59(邊界)', T('2359') === '23:59', T('2359'));
  check('「0000」→ 00:00(邊界)', T('0000') === '00:00', T('0000'));
  check('已格式化的「08:15」原樣通過', T('08:15') === '08:15', T('08:15'));
  check('「8:5」→ 08:05', T('8:5') === '08:05', T('8:5'));
  check('小時 24 → null(不合法)', T('2400') === null, String(T('2400')));
  check('分鐘 60 → null(不合法)', T('0860') === null, String(T('0860')));
  check('純文字 → null', T('abc') === null, String(T('abc')));
  check('超過 4 位數只取前 4', T('12345') === '12:34', T('12345'));
  // ⚠ 編輯既有值的關鍵路徑:「08:15」刪一個字 → 不可被判成不合法而清掉資料
  check('編輯中的「08:5」→ 08:05(不可清空)', T('08:5') === '08:05', String(T('08:5')));
  check('編輯中的「08:」→ 08:00', T('08:') === '08:00', String(T('08:')));
  check('編輯中的「1:」→ 01:00', T('1:') === '01:00', String(T('1:')));
  check('冒號版仍會驗範圍「25:00」→ null', T('25:00') === null, String(T('25:00')));
}

console.log('');
console.log('[7] 焦點保護:病歷號欄必須有 data-focus-key');
// renderAll 重建 DOM 後,只有標了 data-focus-key 的欄位會被 withFocusPreserved 放回游標。
// 病歷號欄漏標過(2026-08-20 修):打到一半重繪 → 焦點掉到 body → 後面打的字全部消失,
// 而緊鄰的時間欄一直都有 key,所以症狀只出現在病歷號。
// 行為在 DOM 層、單元測試搆不到,所以直接掃原始碼。
{
  const lines = src.split('\n');
  // 只看 JS 的 el('input') 屬性(CSS 裡也有這個 class 名,會誤判)
  const hits = lines.map((l, i) => ({ l, i })).filter(x => /class: '[^']*proc-item-medrec/.test(x.l));
  check('找得到病歷號輸入欄(今日 / 月表清單 / 當天 modal)', hits.length >= 3, '實際 ' + hits.length + ' 處');
  for (const x of hits) {
    const block = lines.slice(x.i, x.i + 8).join('\n');   // el() 的屬性物件可能換行
    check('第 ' + (x.i + 1) + ' 行的病歷號欄有 data-focus-key', /data-focus-key/.test(block));
  }
  // ⚠ key 必須全域唯一:月表清單與當天 modal 可能同時顯示同一天,前綴要分開
  const keys = src.match(/data-focus-key':\s*`[^`]*\|mr`/g) || [];
  check('三個入口的 mr key 各自不同', keys.length >= 3 && new Set(keys).size === keys.length,
        JSON.stringify(keys));
  // 病歷號不該進瀏覽器自動填入(隱私 + 下拉會吃按鍵)
  const noAuto = hits.filter(x => !/autocomplete/.test(lines.slice(x.i, x.i + 8).join('\n')));
  check('病歷號欄都關掉 autocomplete', noAuto.length === 0,
        noAuto.map(x => '第 ' + (x.i + 1) + ' 行').join(', '));
}

console.log('');
console.log('[8] 門診多段時段(opdSlots)');
// 零星約診常散在一天不同時段 → 一天一組起訖記不下來,改成陣列。
// 舊資料是單一組 opdStart/opdEnd,必須無痛併進 opdSlots[0](使用者不用重填)。
{
  const M = api.migrateOpdSlots;

  const a = M({ opdStart: '08:25', opdEnd: '12:03' });
  check('舊的單一組 → opdSlots[0]',
        JSON.stringify(a.opdSlots) === JSON.stringify([{ s: '08:25', e: '12:03' }]), JSON.stringify(a));
  check('遷移後舊欄位要清掉(否則兩份會漂移)', !('opdStart' in a) && !('opdEnd' in a), JSON.stringify(a));

  check('只有開始也搬', JSON.stringify(M({ opdStart: '09:00' }).opdSlots) === JSON.stringify([{ s: '09:00' }]));
  check('只有結束也搬', JSON.stringify(M({ opdEnd: '09:00' }).opdSlots) === JSON.stringify([{ e: '09:00' }]));
  check('沒有舊欄位 → 不動', !('opdSlots' in M({ counts: {} })));
  check('已經是新格式 → 不動',
        JSON.stringify(M({ opdSlots: [{ s: '09:00', e: '10:00' }] }).opdSlots)
        === JSON.stringify([{ s: '09:00', e: '10:00' }]));
  // 理論上不該同時存在,但真的遇到要把舊的排前面(它是比較早的那段)
  const mix = M({ opdStart: '08:00', opdEnd: '09:00', opdSlots: [{ s: '14:00', e: '15:00' }] });
  check('新舊並存 → 舊的插到最前面', mix.opdSlots.length === 2 && mix.opdSlots[0].s === '08:00',
        JSON.stringify(mix.opdSlots));
  check('遷移可重複執行(第二次不再多一段)',
        JSON.stringify(M(M({ opdStart: '08:25', opdEnd: '12:03' })).opdSlots)
        === JSON.stringify([{ s: '08:25', e: '12:03' }]));

  const T = api.opdTotalMinutes;
  check('兩段加總 = 218 + 20 = 238 分',
        T({ opdSlots: [{ s: '08:25', e: '12:03' }, { s: '15:00', e: '15:20' }] }) === 238,
        String(T({ opdSlots: [{ s: '08:25', e: '12:03' }, { s: '15:00', e: '15:20' }] })));
  check('只填一半的那段不計(不當 0 也不當整天)',
        T({ opdSlots: [{ s: '09:00', e: '09:30' }, { s: '15:00' }] }) === 30,
        String(T({ opdSlots: [{ s: '09:00', e: '09:30' }, { s: '15:00' }] })));
  check('空陣列 → 0', T({ opdSlots: [] }) === 0);
  check('沒有欄位 → 0', T({}) === 0 && T(undefined) === 0);
  check('壞值不爆', T({ opdSlots: [{ s: 'abc', e: 'zzz' }] }) === 0);
  check('跨午夜那段仍算得出來(值班門診)',
        T({ opdSlots: [{ s: '23:40', e: '00:20' }] }) === 40,
        String(T({ opdSlots: [{ s: '23:40', e: '00:20' }] })));

  check('opdSlots() 對非陣列一律回空陣列',
        api.opdSlots({ opdSlots: 'x' }).length === 0 && api.opdSlots(undefined).length === 0);
}

console.log('');
console.log('[9] 時間欄的焦點設計不變式(掃原始碼,行為在 DOM 層測不到)');
{
  const BT = String.fromCharCode(96);
  const calls = [...src.matchAll(new RegExp('timeField\\(([^' + BT + ']*)' + BT + '([^' + BT + ']+)' + BT + '\\)', 'g'))];
  check('抓得到 timeField 呼叫點', calls.length >= 10, '實際 ' + calls.length + ' 個');

  // ① key 樣板必須互不重複 —— 重複的話 querySelector 會選到錯的那格
  //    (月表清單 ml| 與當天 modal md| 可能同時顯示同一天,前綴就是為此分開)
  const tpl = calls.map(m => m[2].replace(/\$\{[^}]+\}/g, '<v>'));
  const dup = [...new Set(tpl.filter((k, i) => tpl.indexOf(k) !== i))];
  check('key 樣板互不重複', dup.length === 0, dup.join(', '));

  // ② callback 不可以直接重建 DOM
  const badCb = calls.filter(m => /\b(render[A-Z]\w*|mpRefresh)\s*\(/.test(m[1]));
  check('沒有 timeField callback 直接呼叫 render', badCb.length === 0, String(badCb.length) + ' 個');

  // ③ 那些 setter / refresh 只能改值,不能動結構
  const body = (fn) => {
    const i = src.indexOf('function ' + fn + '(');
    if (i < 0) return null;
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === '{') { d++; st = true; }
      else if (c === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
    return null;
  };
  for (const fn of ['updateProcTime', 'mpProcTime', 'updateMtgTime', 'setOpdSlot', 'setDayTime',
                    'refreshProcDur', 'refreshMtgDur', 'refreshOpdDur', 'refreshDayDur']) {
    const b = body(fn);
    const hits = b && b.match(/innerHTML|appendChild|replaceChildren|\brender[A-Z]\w*\(|mpRefresh\(/);
    check(fn + ' 只改值不重建 DOM', !!b && !hits, b ? (hits ? hits[0] : '') : '找不到函式');
  }

  // ④ ⭐ 含時間欄的面板必須包 withFocusPreserved。
  //    2026-08-26 的實例:Special 金額欄是 onblur → renderCountsPanel(),
  //    在那裡打完字直接點進門診時間欄,blur 會先重建、把剛點進去的格子砍掉。
  //    這是從結果端擋,不是逐一修觸發點。
  for (const fn of ['renderCountsPanel', 'renderMonth']) {
    const b = body(fn);
    check(fn + ' 有包 withFocusPreserved', !!b && /withFocusPreserved\(/.test(b),
          b ? b.split('\n')[1] : '找不到');
  }
}

console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
