# LINE Bot Split Bill

一個已完成 MVP 功能的朋友分帳工具，支援：

- LINE Bot webhook
- 建立群組 / 綁定群組
- 新增支出 / 查看最近支出 / 查看結算
- 查看成員 / 新增成員 / 刪除成員
- 刪除最後一筆支出
- 成員付款設定頁

這份 README 已改成正式上線導向，預設部署方案為：

- 前端 / API：Vercel
- 資料庫：Neon Postgres
- ORM：Prisma
- LINE Bot webhook：正式 HTTPS 網址，不再依賴本機或 ngrok

## 為什麼選這個方案

這個專案本身就是 Next.js App Router + Route Handlers + Prisma + LINE webhook。

對目前這個架構來說，`Vercel + Neon Postgres` 是最省手動、最穩、最接近平台原生支援的組合：

- Vercel 對 Next.js App Router 部署相容度最高
- Prisma 官方有明確的 Vercel 部署建議，包含 `postinstall` 與 build 期間 `prisma generate`
- Neon 是 serverless Postgres，跟 Prisma / Vercel 的搭配成熟
- LINE webhook 只需要一個穩定 HTTPS 網址即可，不需要再開本機電腦或 ngrok

參考：

- [Prisma: Deploy to Vercel](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless)
- [Prisma: Neon](https://docs.prisma.io/docs/v6/orm/overview/databases/neon)
- [LINE: Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)

## 目前專案已做好的正式部署調整

- SQLite 已改成 PostgreSQL datasource
- Prisma schema 已加入 production 需要的 index / direct URL
- Prisma migration 已重建成 PostgreSQL baseline
- `postinstall` 已加上 `prisma generate`
- Vercel build 已改成自動執行 `prisma migrate deploy`
- webhook 已保留 raw request body 驗簽，不會先 parse 再驗簽
- `APP_BASE_URL` 已抽成共用 helper，正式環境不再依賴 `localhost` 或 ngrok
- 新增 `/api/health` 健康檢查路由
- `.env.example` 已整理成 production 版

## 正式環境需要的環境變數

把這些值設定在 Vercel Project Environment Variables：

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB_NAME?sslmode=require&pgbouncer=true&connect_timeout=15"
DIRECT_DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB_NAME?sslmode=require&connect_timeout=15"
APP_BASE_URL="https://your-project.vercel.app"
LINE_CHANNEL_SECRET="YOUR_LINE_CHANNEL_SECRET"
LINE_CHANNEL_ACCESS_TOKEN="YOUR_LINE_CHANNEL_ACCESS_TOKEN"
```

### 變數用途

- `DATABASE_URL`
  - App runtime 使用
  - 建議填 Neon 的 pooled 連線字串
- `DIRECT_DATABASE_URL`
  - Prisma CLI / migration 使用
  - 建議填 Neon 的 direct 連線字串
- `APP_BASE_URL`
  - 你的正式網站網址
  - 用來產出 LINE Bot 裡的成員付款設定連結
  - 如果你先用 Vercel 預設正式網域，可以先不填，系統會 fallback 到 `VERCEL_PROJECT_PRODUCTION_URL`
- `LINE_CHANNEL_SECRET`
  - LINE webhook 簽章驗證用
- `LINE_CHANNEL_ACCESS_TOKEN`
  - LINE reply API 回覆訊息用

## 本機開發與正式部署的差異

這份專案現在是正式部署版 schema，所以不再使用 SQLite。

如果你要在本機繼續測試 production 架構，也請把本機 `.env` 換成 Postgres 連線字串，而不是舊的：

```env
DATABASE_URL="file:./dev.db"
```

這種 SQLite 寫法。

## Prisma migration 策略

### 現在的 migration 狀態

舊的 SQLite migration 已經移除，改成新的 PostgreSQL baseline migration：

- `prisma/migrations/20260420190000_init_postgresql/migration.sql`

### 為什麼這樣做

因為你現在要正式上線的是雲端 PostgreSQL，不是沿用舊 SQLite。

若保留原本 SQLite migration，正式部署時 `prisma migrate deploy` 會因 provider 不同而失敗。

### 是否需要 seed

目前不需要。

這個產品本身就是從 LINE / UI 建立群組、成員與支出，不需要預設資料。

如果你未來要匯入舊 SQLite 測試資料，再另外做一次性 migration script 會比較安全。

## 健康檢查

正式部署後可以打：

```text
https://你的正式網址/api/health
```

如果一切正常，會回：

- env 是否齊全
- DB 是否連得上
- `APP_BASE_URL` 是否正確

## LINE webhook 設計

目前實作方式符合正式上線需求：

- 使用 `request.text()` 先取得 raw body
- 驗證 `x-line-signature`
- 通過後才 `JSON.parse`
- 使用 `Channel secret` 驗簽
- 使用 `Channel access token` 呼叫 LINE reply API
- route runtime 固定在 `nodejs`

這是 LINE 官方建議的驗簽方式，避免先改動 body 後導致 signature mismatch。

## Vercel 部署前專案內建設定

### scripts

```json
{
  "postinstall": "prisma generate",
  "build": "prisma generate && next build",
  "build:production": "prisma migrate deploy && prisma generate && next build"
}
```

### vercel.json

```json
{
  "buildCommand": "npm run build:production"
}
```

這表示：

- 你本機一般 build 不會被 production DB 強迫卡住
- Vercel 正式 build 會自動跑 migration deploy

## 最少手動操作部署 SOP

下面這份流程是壓到最低手動版。

### 第 1 步：把專案推到 GitHub

你需要做：

1. 登入 GitHub
2. 建一個 repo
3. 把目前專案 push 上去

我這邊已經幫你準備好：

- 正式部署用 schema
- Prisma migration
- Vercel build 設定
- env.example
- webhook / app URL 修正

### 第 2 步：建立 Neon 資料庫

你需要做：

1. 登入 [Neon](https://neon.tech/)
2. 建立一個 Postgres project
3. 建立資料庫後，複製兩條 connection string：
   - pooled connection string
   - direct connection string

你做完後手上會有：

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`

### 第 3 步：把 GitHub repo 匯入 Vercel

你需要做：

1. 登入 [Vercel](https://vercel.com/)
2. `Add New Project`
3. 選你的 GitHub repo
4. 按 Import

這一步不需要你改 framework，Vercel 會自動辨識 Next.js。

### 第 4 步：在 Vercel 填環境變數

你需要做：

在 Vercel Project Settings → Environment Variables 填入：

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `APP_BASE_URL`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

#### 實際對應

- `DATABASE_URL`
  - 貼 Neon 的 pooled URL
- `DIRECT_DATABASE_URL`
  - 貼 Neon 的 direct URL
- `APP_BASE_URL`
  - 如果你要直接固定正式網址或自訂網域，就填這個值
  - 如果先用 Vercel 預設正式網址，可以先略過
- `LINE_CHANNEL_SECRET`
  - 從 LINE Developers Console 複製
- `LINE_CHANNEL_ACCESS_TOKEN`
  - 從 LINE Developers Console 複製

### 第 5 步：按下 Deploy

你需要做：

1. 在 Vercel 按 deploy / redeploy

這一步之後，Vercel 會自動：

- install dependencies
- `prisma generate`
- `prisma migrate deploy`
- `next build`

### 第 6 步：確認正式網址

部署成功後，你需要做：

1. 打開 Vercel 提供的正式網址
2. 先測：
   - `/`
   - `/api/health`
   - `/api/line/webhook`

### 第 7 步：到 LINE Developers 後台改 webhook URL

你需要做：

1. 打開 LINE Developers Console
2. 找到 Messaging API channel
3. 把 webhook URL 改成：

```text
https://你的正式網址/api/line/webhook
```

4. 按 Verify
5. 打開 `Use webhook`

### 第 8 步：正式驗證

你需要做：

1. 私聊 Bot 測試
2. 群組測試
3. 查資料是否真的寫進 Neon

下面有完整檢查清單。

## 上線後完整測試清單

### 1. Health check

打開：

```text
https://你的正式網址/api/health
```

確認：

- `ok: true`
- `checks.env.databaseUrl = true`
- `checks.env.directDatabaseUrl = true`
- `checks.env.appBaseUrl = true`
- `checks.env.lineChannelSecret = true`
- `checks.env.lineChannelAccessToken = true`
- `checks.database.ok = true`

### 2. LINE Developers Verify

在 LINE Developers Console 按 `Verify`，確認成功。

### 3. Bot 私聊測試

輸入：

```text
小二
```

確認 Bot 有正常回覆。

### 4. 建立群組測試

輸入：

```text
1嘉義兩天一夜
```

確認：

- 建群成功
- Bot 自動綁定目前聊天室

### 5. 新增成員測試

輸入：

```text
8翔,濠,冠,魚,彤
```

確認：

- Bot 回覆新增成功
- `5` 能看到成員清單

### 6. 新增支出測試

輸入：

```text
7芋圓300翔濠魚
```

確認：

- Bot 回覆記帳成功
- `4` 能看到最近支出

### 7. 查看結算測試

輸入：

```text
3
```

確認：

- 有正常輸出誰該付誰多少
- 若收款人已設定付款方式，會一起顯示

### 8. 付款設定連結測試

輸入：

```text
10全部
```

確認：

- 回覆的是正式網址，不是 localhost / ngrok
- 點開後可以在手機上儲存成功

### 9. 刪除最後一筆支出測試

輸入：

```text
6
是
```

確認：

- 最新支出被刪掉
- `4` 重新看不到剛剛那筆

### 10. 資料庫寫入測試

用 Neon SQL Editor 或資料庫管理工具確認：

- `Group`
- `Member`
- `Expense`
- `ExpenseParticipant`
- `LineChatBinding`
- `MemberPaymentProfile`

都有資料寫入。

## 錯誤排查

### 1. `/api/health` 不是 `ok: true`

先檢查：

- Vercel env 有沒有漏填
- `DATABASE_URL` / `DIRECT_DATABASE_URL` 是否貼反
- `APP_BASE_URL` 是否還是舊網址

### 2. Vercel build 卡在 Prisma

先檢查：

- `DIRECT_DATABASE_URL` 是否存在
- Neon direct URL 是否可連
- migration SQL 是否已隨 repo 上傳

### 3. LINE Verify 失敗

先檢查：

- webhook URL 是否正確指向 `/api/line/webhook`
- `LINE_CHANNEL_SECRET` 是否正確
- 是否有任何 proxy 或 middleware 改動 request body

### 4. Bot 可以收到訊息但不會回

先檢查：

- `LINE_CHANNEL_ACCESS_TOKEN` 是否正確
- LINE channel access token 是否過期 / 被重發
- Vercel function logs 是否有 `LINE reply failed`

### 5. 付款設定連結打開後又跳 localhost

先檢查：

- `APP_BASE_URL` 是否已改成正式網址
- 是否還在點舊的 LINE 訊息連結

### 6. 正式網址已上線但 LINE 還打舊 ngrok

先檢查：

- LINE Developers 後台 webhook URL 是否已改成正式網址
- 是否已按 Verify 並成功

## 建議的正式上線後維運習慣

- 所有 production env 只放在 Vercel，不要寫進 repo
- 若 LINE token 重發，記得同步更新 Vercel env
- 每次 schema 變更都走新的 Prisma migration
- 上線後先看 `/api/health`，再測 LINE Bot

## 未來如果你要再往上加

目前這份專案已經能正式上線。

如果之後你要再升級，可以優先做：

- 匯入舊 SQLite 測試資料到 Postgres
- 加上 webhook / database error logging dashboard
- 加上資料備份策略
- 加上管理者權限與群組分享
