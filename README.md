# hk-bus-mtr — 香港巴士到站 + 港鐵班次

加強版實時公共交通 App，支援：

- **九巴 (KMB)** 實時到站
- **城巴 (CTB)** 實時到站
- **港鐵 (MTR)** 各線實時班次
- **地圖顯示**（桌面完整、手機可收起）
- 定位附近巴士站
- 繁中 / 英文切換
- 完全靜態前端，可直接部署到 **Vercel** / **GitHub Pages**

數據來源全部來自香港政府開放數據（data.gov.hk），無需 API Key。

## 功能一覽

| 功能 | 說明 |
|------|------|
| 附近站點 | 用瀏覽器定位找 800m 內九巴站 |
| 地圖 | Leaflet + CartoDB Dark，手機可隱藏 |
| 到站時間 | 自動每 30 秒更新 |
| 港鐵 | 10 條主要路線 + 常用車站 |
| 城巴 | 支援手動輸入 Stop ID + 路線查詢 |
| 響應式 | 手機 / 平板 / 桌面都好用 |

## 技術棧

- Vite + React 18 + TypeScript
- Tailwind CSS
- React-Leaflet（地圖）
- 官方 Open Data API

## 本地開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 建置正式版
npm run build
```

開啟 http://localhost:5173

## 部署到 Vercel

1. 把這個 repo push 去 GitHub
2. 到 [vercel.com](https://vercel.com) → New Project → Import 你的 repo
3. Framework Preset 選 **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Deploy！

或用 Vercel CLI：

```bash
npm i -g vercel
vercel
```

## 部署到 GitHub Pages

```bash
# vite.config.ts 加 base: '/你的repo名/'
npm run build
# 把 dist 內容 push 到 gh-pages branch
```

## API 說明

### 九巴
- Base: `https://data.etabus.gov.hk/v1/transport/kmb`
- `/route/`、`/stop`、`/stop-eta/{stop_id}` 等

### 城巴
- Base: `https://rt.data.gov.hk/v2/transport/citybus`
- `/route/CTB`、`/eta/CTB/{stop}/{route}` 等

### 港鐵
- `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=TWL&sta=TST&lang=TC`

## 注意

- 定位需要 HTTPS（Vercel 預設有）
- 部分 API 有 CORS，現代瀏覽器直接 fetch 通常 OK
- 本專案僅供學習與個人使用，與任何營辦商無關

## License

MIT
