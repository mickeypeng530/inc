# Worknum — 放射科績效記錄與分析工具

> 最後更新:2026-05-10(Phase 1a 完成)
> 接手者請先看這份,30 分鐘內上手。詳細設計決策見 `~/.claude/plans/google-sheet-ct-mri-delightful-bunny.md`(plan v2)。

---

## 1. 這專案在做什麼

放射科主治醫師(deer530530@gmail.com)個人績效記錄工具,取代既有的 `VS會議 + 績效.xlsx`。記錄:

- **計數類**:CT(OPD/ER+ADM+自費 LDCT/健保 LDCT)、MR(OPD/ER+ADM+Health)、BMD、Special(Swal/HSG/IVP/UGI/...)、X-ray(OPD/ER)、會診、Sono、OPD 看診
- **Procedure**:從 28 個 preset 組合包選(如 `PCN+A-P 3315`),自動展開成原子項紀錄(PCN 3000 + A-P 315)
- **會議**:從 20 個 catalog 選,記出席費(主講/參與)
- **加班時數、值班、不值班、備註**

最終目標:單檔 SPA + Firebase RTDB(私有)+ Google login(只認 deer530530)+ GitHub Pages 部署 + 迷你 PWA 釘工作列 + 完整分析 dashboard。**過渡期 parallel 用 sheet** — 新工具計數可一鍵 export TSV 貼回 sheet,procedure 暫時繼續走舊 sheet 下拉,等 dashboard 齊全後完全切換。

---

## 2. 現在進度到哪

### ✅ Phase 1a 完成(本地 localStorage MVP)

**單檔 `index.html`(~1200 行,含內嵌 CSS + ES module JS)** ,在 file:// 直接打開即可用:

| 區塊 | 功能 |
|---|---|
| 今日 tab | 三欄(計數輸入 / Procedure+會議 / 當日統計),計數 ±1 按鈕 + 直填,procedure 下拉選 preset 一鍵 ×N 加多筆,會議下拉選,加班/值班/備註欄位 |
| 月表 tab | 計數 pivot(項目 × 1-31 + 月計),「📋 複製整月計數」TSV export,月份切換,本月 procedure 分項統計表(套 includeInStats + countsAs 邏輯) |
| 設定 tab | 基礎單價、Atomic Items(改金額自動 cascade modal 提示連動 preset)、Presets 列表、會議目錄、迷你視窗顯示項勾選、Sheet 列順序、JSON 匯入/匯出/重設 |
| 迷你模式 | URL `?mode=quick` 進入,主畫面點 `🪟 迷你` 按鈕開新視窗(340×560),只顯示 settings.miniLayout 勾選的計數項,金額預設 blur,點 👁 切換 |
| 主題 | dark/light(沿 OPD playbook CSS 變數模式) |
| 跨視窗同步 | BroadcastChannel,主視窗 ↔ 迷你視窗即時同步 |
| 自動儲存 | debounced 350ms,localStorage key `worknum_v1` |
| Header 快捷 | `📋 當日`(複製當日計數 TSV)、`🪟 迷你`、`🌓` 主題、JSON 匯出/匯入(設定頁) |

### ⏳ 待做

| Phase | 內容 | 建議模型 |
|---|---|---|
| 1b | Firebase Auth + RTDB,storage adapter 從 localStorage 換成 Firebase | Sonnet 4.6 |
| 2 | Python 一次性 import 腳本(30 個月歷史)+ 月表加 procedure pivot 完整版 | **Opus 4.7**(schema 推論決策階段)→ 切 Sonnet 寫 |
| 3 | 分析 dashboard(趨勢、占比、CT vs MR、加班 vs 收入、月底預估、紀錄牆) | Opus 4.7(設計階段)→ 切 Sonnet 寫 |
| 4 | PWA manifest + service worker + 行事曆 view | Sonnet 4.6 |
| 5 | git init + GitHub Pages + Firebase Console 設定 + 更新本文件 | Haiku 4.5 |

---

## 3. 架構速覽

### 檔案

```
C:\Users\彭嗣翔\Claude_Work\Worknum\
├── VS會議 + 績效.xlsx          源資料(read-only,30 個月份分頁 + 參照表 + 每日工作清單)
├── index.html                  整個 SPA(目前唯一檔案)
├── CLAUDE.md                   本文件
└── (後續)
    ├── firebase-init.js        Phase 1b
    ├── database.rules.json     Phase 1b
    ├── manifest.webmanifest    Phase 4
    ├── sw.js                   Phase 4
    ├── icon-192.png/icon-512.png  Phase 4
    └── scripts/
        ├── import_xlsx_to_firebase.py    Phase 2
        ├── mapping.json
        └── requirements.txt
```

### 資料模型(localStorage,日後同樣套用 Firebase RTDB)

```js
{
  days: {
    "YYYY-MM-DD": {
      counts: {
        ct: { opd, er_adm_self, ldct_health },
        mr: { opd, er_adm_health },
        bmd: <int>,
        special: { swal, hsg, ivp, ugi, lgi, eso, sbs, vcug, intu, ttube, other },
        xray: { opd, er },
        consult, sono, opd: <int>
      },
      procedures: [
        { presetId, presetName, items: [{atomicId, name, amount}], time, note? }
      ],
      meetings: [{ catalogId, role, name, amount, time }],
      overtimeHours: <number>,
      schedule: { onCall, noDuty },
      notes: <string>,
      updatedAt: <ISO>
    }
  },
  settings: {
    unitPrices: { ct, mr, bmd, special, xray, consult, sono, opd },
    atomicItems: [{ id, name, amount, includeInStats, countsAs? }],
    presets: [{ id, name, items: [{atomicId, amount}] }],
    meetingCatalog: [{ id, role, name, amount }],
    sheetOrder: [{ key, label, enabled }],
    miniLayout: [<key>, ...],
    miniShowMoney: <bool>,
    overtimeRate: <number>,
    theme: 'dark' | 'light'
  }
}
```

### 關鍵程式區塊(index.html 內)

| Section | 行數區間(大略) | 內容 |
|---|---|---|
| `<style>` | ~16-460 | CSS 變數、layout、components、modal、mini-mode、money-blur |
| `SEED` | JS 上半部 | 預設 catalog(28 presets、~36 atomic、20 meetings、unitPrices、sheetOrder、miniLayout) |
| `COUNTS_SCHEMA` | SEED 後 | 計數欄位的 group/child 結構,渲染計數面板 + 月表 + 統計都用這個 |
| `storage` | 中段 | localStorage adapter(load/save/reset),save 時 broadcast |
| `state` | 中段 | currentDate/currentMonth/data/isMini |
| `getCount/setCount/getDay` | 中段 | 巢狀 counts 操作工具 |
| `calcBaseRevenue` 等 | 中段 | 收入計算(基礎/proc/會議/加班) |
| `renderToday/Month/Settings/Mini` | 後半 | 各 view render,事件 handler 直接綁在 element 上 |
| `onAtomicAmountChange + showCascadeModal` | 後半 | 改 atomic 金額時 scan presets + 彈 cascade modal |
| `exportDayTSV/exportMonthTSV` | 後半 | TSV 剪貼簿匯出 |
| `init()` | 最尾 | 載入 → render → 綁 listener |

### 重要設計(plan v2 的關鍵決定)

1. **金額快照**:`days[].procedures[].items[].amount` 是「當下填入金額」的快照,改 `settings.atomicItems[].amount` **不會回頭改歷史**
2. **連動編輯提示**:改 atomic 金額時,scan 所有 preset 中 `it.amount === oldAmount` 的(嚴格比對),彈 cascade modal 列出可一起更新的 preset
3. **統計分項客製化**:`atomicItems[].includeInStats` 控制是否獨立統計;`countsAs` 控制計次歸入哪個 bucket(例 c(s)TAME 收 8800 但歸 sTAME 計次)
4. **金額照實算 + 計次套規則**:收入合計 = 所有 procedure items 金額直接加總(不受 stats 設定影響);分項計次表才套 `includeInStats` + `countsAs`
5. **過渡期 parallel sheet**:TSV export **只處理計數**,procedure 過渡期繼續走舊 sheet 下拉
6. **CT/MR/X-ray 計費分來源**:CT 三類(OPD 350 / ER+ADM+自 420 / 健保 LDCT 554)、MR 兩類(OPD 700 / ER+ADM+Health 840)、X-ray 兩類(OPD 25 / ER 33)— 已從 sheet rows 26-39 抽出當預設

---

## 4. 常見坑 / 防雷

### Sheet 名年月對應規則

`VS會議 + 績效.xlsx` 命名:**有衝突才加年份前綴**,以最近未衝突月份為無前綴。對應 today=2026-05:
- `01..05` = 2026-01 ~ 2026-05
- `08..12` = 2025-08 ~ 2025-12
- `2501..2507` = 2025-01 ~ 2025-07
- `2401..2412` = 2024 全年
- `2312` = 2023-12

Phase 2 import 腳本用此規則自動推 `YYYY-MM`。

### Procedure 清單會增減,**不是**改名

`Celiaco2`、`Aorta A`、`Pelvic` 等不同月份 row 35-57 內容變動,是**新項目加入/舊項目停做**,不是同項目換名。Import 腳本取所有月份 row labels 的**聯集**,不需 alias 表。

### 金額漂移 — 以最新版為主

procedure 金額隨時間微調 + 做完才知實收。**Import 時 procedureCatalog 取最新月份「參照表」當權威值**,各日紀錄存當下 amount 快照。

### Preset = 該檢查通常一起做的子項目集合

`PCN+A-P 3315` = `PCN 3000 + A-P 315`(展開成原子項紀錄)。月份 sheet rows 35-57 是各原子項當月 breakdown。設定頁的 cascade modal 用嚴格金額比對(`item.amount === oldAmount`),已被手改過跟 atomic 不一致的 item 不會自動偵測為連動目標。

### Mini 視窗

- 從主畫面 `🪟 迷你` 開,跳 `?mode=quick` popup window(340×560)
- 主畫面與 mini 用 BroadcastChannel `worknum` 同步資料變動
- 金額預設 blur,點 👁 toggle(state 存在 `settings.miniShowMoney`)
- 顯示哪些計數項由設定頁勾選(`settings.miniLayout`)

### iOS PWA 將來支援(Phase 4)

走 popup,**不要 redirect**。詳見 `~/.claude/playbooks/firebase-auth-ios.md`。Auth domain 用預設 `*.firebaseapp.com`,**不要改**。

### Firebase 帳號 = deer530530@gmail.com

不是 mickeypeng530530。Rules 鎖 email 也要寫這個。

### Special 細項單價先全設 231

(SBS/VCUG/Eso/LGI/UGI/IVP/Intu/T-tube/Other),實際金額待 user 確認,設定頁可改。

### 歷年最高/最低紀錄牌(Phase 3)

雙來源:① import 完 30 個月後 compute、② 保留 sheet 內手動紀錄當另一個維度(來源位置 import 時跟 user 確認)。

### CT/MR 主項+sub 與 sheet 對齊問題

新工具 CT 拆三類(OPD / ER+ADM+自費 LDCT / 健保 LDCT),sheet 上 CT 主項 + sub 結構可能對不上 — 第一次 export 後與 sheet 比對,設定頁可重新映射 sheetOrder。

---

## 5. 接手者 cheatsheet

### 開發環境

```powershell
# 直接開
start C:\Users\彭嗣翔\Claude_Work\Worknum\index.html

# 開 mini 視窗測試
start "C:\Users\彭嗣翔\Claude_Work\Worknum\index.html?mode=quick"

# 看歷史資料(Python)
python3 -c "
import openpyxl
wb = openpyxl.load_workbook(r'C:\Users\彭嗣翔\Claude_Work\Worknum\VS會議 + 績效.xlsx', data_only=True)
print(wb.sheetnames)
"
```

### 開發 / debug

```js
// 在 console 看當下 state
state         // currentDate, data, isMini
state.data.days['2026-05-10']  // 當日紀錄
state.data.settings.atomicItems  // catalog

// 強制 reload seed
storage.reset(); location.reload();

// 清空當日
delete state.data.days[state.currentDate]; storage.save(state.data); renderAll();

// 匯出整包資料(設定頁也有按鈕)
copy(JSON.stringify(state.data, null, 2))
```

### 加新功能 SOP

1. 改資料模型 → 同步更新 SEED + COUNTS_SCHEMA(若涉及計數)
2. 新增 render function → 在 `renderAll()` 或對應 view 的 render 串起來
3. 新增 event → 在 `init()` 末段 wire 上
4. 改 storage 結構 → load() 內加 forward-compat 預設值合併
5. 動到 catalog 形狀 → 設定頁加對應編輯 row

### 何時切換模型(重要)

| 狀況 | 建議模型 | 原因 |
|---|---|---|
| 改 UI、加按鈕、調 CSS、加新計數項 | **Sonnet 4.6** | 重複套路,Sonnet 又快又穩 |
| Phase 1b Firebase 接線(playbook recipe) | **Sonnet 4.6** | 模式化工作 |
| Phase 2 import 腳本 schema 推論決策 | **Opus 4.7** | 30 個月 pivot 不一致需 judgment |
| Phase 3 dashboard 邏輯設計(紀錄牆、預估算法) | **Opus 4.7** | 「該怎麼定義」設計題 |
| Firebase rules debug + iOS Safari Auth 卡關 | **Opus 4.7** | 跨領域交互 bug |
| 部署、寫 README、批次改 catalog | **Haiku 4.5** | 又快又便宜 |

主動提醒使用者切換時機(別讓他問)。

### 對 user 的偏好(從 plan 對話歸納)

- 中文為主
- 簡潔,不奉承
- 表格 > 條列 > 段落
- ✅/❌/🟡/⏳ 分類回報
- 有想法先講邏輯再寫 code
- 不過度設計
- 不要動 reviewed=true 內容(本專案目前沒有這種 flag,但保留意識)
- 時間戳 ISO `new Date().toISOString()`

### Plan / 規格參考

- `~/.claude/plans/google-sheet-ct-mri-delightful-bunny.md`(plan v2,完整需求)
- `~/.claude/playbooks/single-file-spa.md`(13 章模式)
- `~/.claude/playbooks/firebase-auth-ios.md`(iOS Safari login recipe)
- `~/.claude/projects/.../memory/firebase_account.md`(Firebase 用 deer530530)

---

## 6. 文件維護規則(自我約束)

> 給下一個接手者(包括未來的自己)。

- **主動更新時機**(不需 user 提醒):
  - 結構/Schema/介面變動 → 更新對應段落
  - 抓到/修 notable bug → 加進「常見坑」
  - Context 用量 > 60% → 主動 checkpoint
  - 單次 session 工具呼叫 > 30 → 中段 checkpoint
  - `/compact` 之前 → 強制更新並提示
  - Phase 完成、Session 結束前
- **不需更新**:純 UI 微調、typo、純查詢
- **不寫 changelog 細節**(git log 已有)— 只記「現況」
- **數字要新鮮** — 進度條跟 reality 同步
- **何時建議使用者切模型** → 主動提出
