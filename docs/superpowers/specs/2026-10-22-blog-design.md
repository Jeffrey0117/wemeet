# wemeet 部落格（揪可樂誌）

> 2026-10-22 Jeff 核准。需求：後台（任何電腦開 /admin）寫部落格；文章頁排版參考
> hypesphere 專欄（編輯型單欄：大標、作者列、寬行距、文末相關文章）。

## 資料

`data/posts.json`（fs JSON，deploy 不洗）：
`{ id, slug, title, category, cover, excerpt, md, published, createdAt, updatedAt }`
slug 限 `[a-z0-9-]`，唯一；md 為 markdown-lite（##/###、粗體、列表、引用、圖、連結、分隔線）。

## 路由

- Admin（requireAdmin）：GET/PUT `/api/admin/posts`、DELETE `/api/admin/posts/{id}`
- 公開：GET `/api/posts`（published 清單，不含 md）
- 頁面：`/blog`（列表）、`/blog/{slug}`（文章頁，server 注入 OG + `window.__POST__`；
  未發佈/不存在 → 302 /blog）

## 前台

活動頁同設計語言（米色紙感、襯線標題、落花層）。文章頁：分類＋日期 kicker →
襯線大標 → 「文 / Jeffrey」作者列 → 封面圖 → 窄欄內文（~720px、行距寬）→
文末「下一場小聚」卡（吃 events API，漏斗入口）＋「更多文章」三篇。
首頁/活動頁 nav 加「部落格」。

## 後台

admin 加「文章」分頁：文章列表（發佈切換/編輯/刪除/預覽連結）＋編輯器
（標題、slug、分類、封面連結、摘要、內文 textarea、存草稿/發佈）。

## 驗證

本機：admin API 建文 → /blog 列表、/blog/{slug} OG 與排版截圖 → deploy → 線上同測。
