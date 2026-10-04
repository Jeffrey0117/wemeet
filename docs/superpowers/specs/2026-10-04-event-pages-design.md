# 揪可樂活動頁系統（Luma 結構 × 揪可樂皮膚）

> 2026-10-04 Jeff 核准。目標：每場活動有自己的精緻獨立頁（學 Luma），分享出去專業、
> 點報名才進表單，整站一致體系。

## 路由與資料流

- `GET /e/{eventId}`：server 讀 `public/event.html` 模板，注入：
  - 該場專屬 OG（title/description/og:image/og:url）— 沿用 `/signup?event=` 的注入 pattern。
    OG 圖優先 `ev.og`（橫版 1200x630），fallback 站的 og.png。past 場也注入（分享回顧連結）。
  - `window.__EVENT__` = `publicEvents()` 公開形狀（FOMO/hideVenue/hideCount 邏輯全沿用，
    不開新洩漏口）。JSON 以 `<` 轉義防 `</script>` 注入。
  - 場次不存在或 hidden → 302 轉 `/#events`。
- `GET /api/events/{id}/attendees`：回 `{ names: string[], more: number }`。
  - 只取該場**非候補**報名者的 `name`（trim、截 12 字），最多 20 筆，其餘算進 `more`。
  - `ratio`（hideCount）場次回空陣列（不破壞稀缺機制）。hidden/不存在 → 404。

## 活動頁版面（public/event.html + event.js + style.css 的 .ev- 區段）

- 桌機雙欄（Luma 結構）：
  - 左欄：海報大圖（無 poster → 活動 type 品牌漸層卡＋logo）、主辦方卡
    （Chill Club 揪可樂 + IG 連結）、「誰要來」：字首圓頭像＋稱呼牆＋「還有 N 人」。
  - 右欄：標題、日期時間 chip（月/日/週幾）、地點＋導航（hideVenue → 「報名後解鎖」）、
    sticky 報名卡（剩 N 名額 / FOMO left / 包場進度條 / 已滿候補文案，邏輯同 app.js
    buildEventCard）、About 長介紹（`desc` markdown-lite）、agenda 流程表、feeNote。
- 手機單欄，報名 CTA sticky 底欄。
- past/ended：顯示「這場已圓滿結束」＋導回 `/#events` 看下一場。
- 視覺：沿用 style.css 既有 token（--cream/--fizz/--cola、Iansui 標題、squiggle），
  學 Luma 的留白、置頂資訊卡與 sticky 報名卡，不另起爐灶。

## markdown-lite（desc 欄位）

先 escape HTML，再支援：`## ` → h3、`**粗體**`、`- ` 列表、空行分段。沒填 desc
fallback 顯示 note。admin 現有 JSON 編輯器直接編，不加後台欄位。

## 動線改接（app.js）

- 活動卡「報名這場」按鈕與卡片標題 → 改連 `/e/{id}`（Luma 式：先進活動頁，頁上
  sticky 報名卡的 CTA 才帶 `/signup?event={id}` 進既有表單，秒報名流程不動）。
- 過往時間軸維持現狀。

## 驗證

本機 `PORT=4999 node server.js` 起測試實例（唯讀測試，不打 POST /api/signup）：
`/e/{id}` 200＋OG 注入正確、不存在轉址、attendees API 形狀、past 場顯示、
手機寬度版面。驗完 commit + push，cloudpipe 自動部署，線上以行為指紋驗證。
