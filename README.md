# Class Behavior Tracker

這是一個教室行為紀錄系統的範例骨架專案 (MVP)。

內容：
- backend/: Node.js + Express 範例伺服器
- frontend/: 簡易靜態頁面示範
- db/schema.sql: PostgreSQL 資料表定義

快速啟動（本機）

1) 後端
```bash
cd backend
npm install
npm run dev
```
後端會在 http://localhost:4000，檢查健康狀態：GET /health

2) 前端
直接開啟 frontend/index.html（或日後換成 React 開發）

3) 若要使用 Postgres，可用 Docker Compose（未包含在此範例）。

下一步我可以：
- 把後端改為完整 JWT + DB 的實作並建立 migration 與範例資料
- 加上前端 React 範例並串接 API
- 加上 Docker Compose 與啟動指令

我已把初始專案上傳到儲存庫。請依需求告訴我要繼續哪一部分的完整實作。