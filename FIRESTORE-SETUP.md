# 開啟「全班即時公播排行榜」設定步驟

現在遊戲跑在**本機模式**：排行榜只存玩家自己的裝置，完整可玩、可驗證，但不是全班共享。
要切成**即時公播排行**（大家看同一個榜、real-time 更新），照這份做一次就好。

> 🔑 前提：這是 Max 要拍板的步驟（要選一個 Firebase 專案、開 Firestore）。決定後 5 分鐘設定完。

---

## 為什麼要後端

「公播排行榜」要讓所有人看到同一份榜、即時更新，這需要一個共享的資料庫。
本機 `localStorage` 做不到跨裝置共享，所以正式版用 **Firestore**（即時、public-read、芯覺已有基礎設施）。

---

## 步驟

### 1. 選一個 Firebase 專案
兩個方向：
- **新開一個專案**（最乾淨，建議）：例如 `core-village`，跟其他服務隔離、權限單純。
- **沿用既有專案**：也可以。用哪一個、哪個帳號有 deploy 權限，屬內部決策，這份公開文件不寫死。

> 排行榜只需要一個獨立的 `village-scores` collection，跟任何既有資料互不相干（規則已把其他路徑全鎖死）。

### 2. 建立 Firestore 資料庫
Firebase console → Firestore Database → 建立資料庫 → **Native 模式** → 地區選 `asia-east1`（台灣近）。

### 3. 部署安全規則
把這個 repo 的 [`firestore.rules`](firestore.rules) 部署上去。兩種方式擇一：
- **指令**（專案有 deploy 權限時）：
  ```bash
  firebase deploy --only firestore:rules --project <你的專案ID>
  ```
- **手動**：Firebase console → Firestore → 規則 → 把 `firestore.rules` 內容整段貼上 → 發布。

### 4. 註冊一個 Web App，拿 config
Firebase console → 專案設定 → 你的應用程式 → 新增 Web App → 複製那段 `firebaseConfig`。

> Firebase 的 web config（`apiKey` 等）是**公開設計、非機密**，可以直接放進這個公開 repo。安全靠的是步驟 3 的規則。

### 5. 填進 `firebase-config.js`
打開 [`firebase-config.js`](firebase-config.js)，取消註解並貼上：
```js
window.__LEADERBOARD_CONFIG__ = {
  firebaseConfig: {
    apiKey: "AIza...",
    authDomain: "<專案>.firebaseapp.com",
    projectId: "<專案>",
    appId: "1:...:web:...",
  },
  collection: "village-scores",
};
```

### 6. Commit、部署
把 `firebase-config.js` commit 進 repo、push。CI 部署後，遊戲右上角會從「本機」變成「**即時公播**」，全班共享同一個榜。

`village-scores` collection 會在第一筆分數送出時自動建立，不用先手動開。

---

## 驗證有沒有成功

1. 打開線上遊戲，排行榜標題旁邊應該顯示「即時公播」。
2. 用手機開一次、電腦開一次，各衝一場 → 兩邊都看得到對方的紀錄 = 成功。
3. F12 console 沒有紅字。

如果連不上，前端會**自動退回本機模式**並在 console 印一行 warning（不會壞掉、不會跳紅字 error）。

---

## 已知限制（誠實揭露）

- **可作弊**：沒登入，懂的人能用 console 送假分數。規則擋掉了亂格式、超界（波數 cap 10000）、假時間、改／刪別人的分，但擋不掉「合理範圍內的假高分」。v1 友善賽可接受（SPEC §7-2 已拍板），要嚴格再加 App Check／登入／後端記分。
- **無分頁去重**：同一人多次上榜會各算一筆（排行榜目前是「單場最佳」榜，不是「每人一行」）。要每人取最高再說。
