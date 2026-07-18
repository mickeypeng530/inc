# 存檔 / 同步邏輯測試

對應 `SYNC_REVIEW_2026-07-18.md` 的 12 條 findings + Tier 1/2 架構改動。
**改動 `index.html` 的存檔/同步邏輯後請重跑。**

```
node scripts/tests/run_all.js
```

## 運作方式

沒有 build step、沒有測試框架。每支腳本用**大括號配對**直接從 `index.html` 抽出
函式原始碼(`snapshotOf` / `diffUpdates` / `merge3` / `applyIncoming` / `storage` …),
注入 mock 的 Firebase(`get` / `set` / `update`)與 `localStorage` 後執行。

好處:驗證的是**真正出貨的那份程式碼**,不是複製品。
代價:**函式改名時,測試裡的抽取名稱要跟著改**(會直接報 `not found: xxx`)。

## 各支涵蓋範圍

| 檔案 | 涵蓋 |
|---|---|
| `test_tier1.js` | 髒路徑 diff:只寫變動的天、陣列縮短整段替換、刪除天送 null、migration 上雲、貼整月單一原子 payload |
| `test_tier2.js` | 三方合併規則:本機沒動跟隨雲端、動過以本機為準、陣列不可分割、刪除語意 |
| `test_tier2_e2e.js` | 端對端守門:桌寵並發改 counts 同時 web 改加班兩邊都保住、讀取失敗不盲蓋、合併後基準收斂 |
| `test_issue3.js` | debounce flush 收得齊、遠端更新不蒸發未存編輯、回音不重繪、settings 本機優先 |
| `test_save_gate.js` | 寫入路徑選擇:離線完全不寫、無變動不寫、有基準走 update、saveFull 走 set、undefined 保險絲 |
| `test_peekday.js` | `peekDay` 純瀏覽不建檔、無 updatedAt、計算回 0、誤寫在 strict mode 會 throw |
| `test_batch2.js` | #4 special 匯出口徑、#9 migration 不洗自訂 isMSK、#10 跨午夜跳日、#5/#8/#11 |

## 注意

- 測試只讀 `index.html`,**不連真的 Firebase、不讀任何含病歷號的檔案**,不會動到雲端資料。
- fixture 全是假資料(病歷號/金額皆為捏造),因此本目錄有納入版控
  (`scripts/` 其餘內容仍在 gitignore:金鑰、備份、含病歷號的匯入 JSON)。
- `test_tier2_e2e.js` 有一項刻意測「讀雲端失敗」,會在 stderr 印出一段紅字堆疊,**那是預期行為**。
