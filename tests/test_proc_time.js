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
  ${grabFn('spanMinutes')}
  ${grabFn('procDuration')}
  ${grabFn('mtgDuration')}
  ${grabFn('fmtDur')}
  ${grabFn('setProcTimeField')}
  return { spanMinutes, procDuration, mtgDuration, fmtDur, setProcTimeField };
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
console.log(`===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
