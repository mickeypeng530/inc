// 開機冒煙測試：把 index.html 的 Firebase import 換成 stub，用真實備份資料
// 跑完整個 enterApp（含 renderAll → renderMonth / renderToday / renderSettings），
// 再點過四個 tab，檢查有沒有 runtime error。
//
//   node scripts/tests/gen_smoke.js            → 用工作區的 index.html
//   node scripts/tests/gen_smoke.js <gitref>   → 用某個 commit 的版本（回歸對照用）
//
// 產生 _smoke*.html 後用瀏覽器打開，頁面右上角會顯示 PASS / FAIL。
//
// ⚠️ 產出的 HTML 內嵌整份 RTDB 備份（含病歷號）→ 已在 .gitignore，絕不可 commit。
//
// 為什麼需要這支：其他測試都只抽出「個別函式」來跑，抓不到「整個 render 流程
// 在真實資料下 throw」這類問題。實際發生過：renderMonth 因 ReferenceError
// (colspan is not defined) 中斷 → enterApp 後面的 tab 事件綁定從未執行 → 整個
// app 點不動，而語法檢查與單元測試全都是綠的。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const ref = process.argv[2];

let html = ref
  ? execFileSync('git', ['show', ref + ':index.html'], { cwd: ROOT, encoding: 'buffer' }).toString('utf8')
  : fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 找最新一份備份當 fixture
const bkDir = path.join(ROOT, 'scripts', 'backups');
const bk = fs.readdirSync(bkDir).filter(f => /^worknum-.*\.json$/.test(f)).sort().pop();
if (!bk) { console.error('✗ 找不到 scripts/backups/worknum-*.json'); process.exit(1); }
const backup = JSON.parse(fs.readFileSync(path.join(bkDir, bk), 'utf8'));
// 備份有兩種格式:RTDB dump(users/{uid}/worknum 包層)與 app「匯出 JSON」(直接就是資料)
const wn = backup.users
  ? backup.users[Object.keys(backup.users)[0]].worknum
  : backup;
if (!wn || !wn.days) { console.error('✗ 備份格式無法辨識:' + bk); process.exit(1); }

const STUBS = `
const __DATA = window.__WORKNUM_FIXTURE;
const initializeApp = () => ({});
const getAuth = () => ({});
class GoogleAuthProvider {}
const signInWithPopup = async () => ({});
const signOut = async () => {};
const onAuthStateChanged = (a, cb) => { setTimeout(() => cb({ uid: 'u1', email: 'deer530530@gmail.com' }), 0); };
const getDatabase = () => ({});
const ref = (db, path) => ({ path });
const set = async () => { window.__writes = (window.__writes || 0) + 1; };
const update = async () => { window.__writes = (window.__writes || 0) + 1; };
const get = async (r) => {
  const p = (r && r.path) || '';
  if (p.includes('/days/')) {
    const d = p.split('/days/')[1];
    const v = __DATA.days[d];
    return { exists: () => v !== undefined, val: () => v };
  }
  return { exists: () => true, val: () => JSON.parse(JSON.stringify(__DATA)) };
};
const onValue = () => {};
`;
html = html.replace(/import \{ initializeApp \}[\s\S]*?firebase-database\.js";/, STUBS);
if (!html.includes('__WORKNUM_FIXTURE')) { console.error('✗ Firebase import 區塊沒被替換'); process.exit(1); }

const HEAD = '<head>\n<script>\n'
  + 'window.__errors = [];\n'
  + "window.addEventListener('error', (e) => window.__errors.push(String(e.message)));\n"
  + "window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandled: ' + String((e.reason && e.reason.message) || e.reason)));\n"
  + 'window.__WORKNUM_FIXTURE = ' + JSON.stringify(wn) + ';\n'
  + '<' + '/script>';
html = html.replace('<head>', HEAD);

// 自我檢查：等 enterApp 跑完 → 點過四個 tab → 顯示結果
const SELFTEST = `
<script>
setTimeout(() => {
  const r = [];
  const add = (n, ok, extra) => r.push({ n, ok, extra });
  add('無 runtime error', window.__errors.length === 0, window.__errors.join(' | '));
  add('app 已顯示', getComputedStyle(document.getElementById('app-root')).display !== 'none');
  for (const name of ['month', 'stats', 'settings', 'today']) {
    const btn = document.querySelector('.tab[data-view="' + name + '"]');
    if (btn) btn.click();
    add('tab 可切換:' + name, !!document.getElementById('view-' + name) && document.getElementById('view-' + name).classList.contains('active'));
  }
  add('月表 pivot 有內容', document.querySelectorAll('#month-pivot tr').length > 5);
  add('月收入列存在', !!document.querySelector('.pivot-income-row'));
  add('加班統計列存在', !!document.querySelector('.pivot-ot-summary'));
  add('點完 tab 仍無 error', window.__errors.length === 0, window.__errors.join(' | '));
  const failed = r.filter(x => !x.ok);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;right:0;z-index:99999;padding:10px 14px;font:12px/1.6 monospace;'
    + 'white-space:pre;max-height:90vh;overflow:auto;color:#fff;background:' + (failed.length ? '#7a2d2d' : '#1f5c37');
  box.textContent = (failed.length ? '✗ FAIL ' + failed.length + '/' + r.length : '✓ PASS ' + r.length + '/' + r.length)
    + '\\n' + r.map(x => (x.ok ? '  ✓ ' : '  ✗ ') + x.n + (x.extra ? '  → ' + x.extra : '')).join('\\n');
  document.body.appendChild(box);
  window.__smokeResult = { pass: failed.length === 0, results: r };
}, 800);
<` + `/script>`;
html = html.replace('</body>', SELFTEST + '\n</body>');

const out = ref ? `_smoke_${ref}.html` : '_smoke.html';
fs.writeFileSync(path.join(ROOT, out), html, 'utf8');
console.log(`written ${out}  (fixture: ${bk})`);
console.log('用瀏覽器打開它，右上角會顯示 PASS / FAIL');
console.log('⚠️ 內含病歷號，已 gitignore，看完請刪除');
