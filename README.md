# 芯覺村・村民出戰 🏡⚔️

> 一款**大家一起蓋**的像素隊伍自走棋。每個人 PR 一個角色，引擎自動把所有人的村民聚進同一個遊戲，組隊打 Bug 怪，看能衝幾波。

這是 [芯覺數位](https://coreawakening.ai/) CPN 共學夥伴的共建專案。它的目的不只是好玩：**讓沒寫過程式的人，完成人生第一個 Pull Request，並且持續一起玩、一起改。**

🎮 **線上試玩**：https://maxfan-jiang.github.io/core-village/
🙋 **想加入**：看 [CONTRIBUTING.md](CONTRIBUTING.md)，5 分鐘放進你的村民。

---

## 怎麼玩

1. 在招募大廳挑最多 4 個村民組一隊（每個技能效果不同，搭配有學問）。
2. 進入**無盡衝波**：敵人每波變強，每 5 波一個魔王。
3. 撐到全隊陣亡為止，分數＝你清掉的波數。
4. 自動上**公播排行榜**，跟全班比誰的卡組撐最遠。

已成形的流派：爆擊隊、腐蝕隊、催眠收割隊、坦續航。卡池越多人貢獻，組合越多。

---

## 這個遊戲怎麼長大

每位夥伴 PR 一個 `villagers/<你的代號>.json`：

```json
{
  "id": "maxfan",
  "name": "范姜冠閎 Max",
  "job": "芯覺 · 創辦人／催眠師",
  "emoji": "🎩",
  "hp": 115, "atk": 24, "spd": 12,
  "skill": "hypnosis",
  "cry": "放鬆，看著我，全部給我睡。"
}
```

PR 一 merge，CI 會自動把所有人的 `villagers/*.json` 聚合、重新部署。**幾分鐘後，新角色就出現在線上遊戲裡**，誰都能用。

---

## 技術架構

刻意做到「地板近乎零、天花板很高」：填一個 JSON 就能參與，但引擎本身是有深度的回合制戰鬥。

| 部分 | 說明 |
|---|---|
| `index.html` | 單一檔案的遊戲引擎：回合制戰鬥、爆擊／狀態效果、像素 sprite（NES 調色盤替換法）、打擊特效。純前端，無框架。 |
| `villagers/*.json` | 每位夥伴的角色卡。社群貢獻的唯一入口。 |
| `scripts/build-villagers.mjs` | build 時把 `villagers/*.json` 聚合成 `villagers.generated.js`，同時是 PR 的守門員（驗證欄位、擋掉破壞性內容、用中文回報錯誤）。 |
| `leaderboard.js` | 公播排行榜。有設定 Firebase 就走即時共享、沒設定就走本機，前端程式碼不用改。 |
| `.github/workflows/deploy.yml` | PR merge → 自動 build ＋ 部署 GitHub Pages。 |

開發：

```bash
npm run build     # 聚合 villagers/*.json → villagers.generated.js
npm run check     # 只驗證資料，不寫檔（CI 用）
# 然後用任意靜態伺服器打開 index.html
```

---

## 設計原則

- **共編，不是各做各的**：題目固定（做一張卡）、格子填空，第一個 PR 全班同一個動作。
- **畫面是參與的鉤子**：像素美術不是裝飾，是讓非工程師願意進來的核心。
- **遊戲性是本體**：build 身份、技能搭配、狀態效果，要好玩，不是看數據交作業。

---

## 授權

程式碼採 MIT 授權。歡迎 fork、學習、改造。

由芯覺數位 × CPN 共學夥伴共同打造。溝通就像寫 Code，給對 Prompt，潛意識就會自動執行。
