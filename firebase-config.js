/* firebase-config.js — 公播排行榜後端設定
 *
 * 現在是「本機模式」：排行榜只存這台裝置（仍完整可玩）。
 * 想開「全班即時公播排行」→ 填入下面的 firebaseConfig，照 FIRESTORE-SETUP.md 設定。
 *
 * 註：Firebase 的 web config（apiKey 等）是「公開設計」、不是機密，可以放進公開 repo。
 *     真正的安全靠 Firestore security rules（見 firestore.rules），不是靠藏這串。
 */
window.__LEADERBOARD_CONFIG__ = {
  // 取消下面註解並填入你的專案設定即可上線：
  // firebaseConfig: {
  //   apiKey: "AIza...",
  //   authDomain: "your-project.firebaseapp.com",
  //   projectId: "your-project",
  //   appId: "1:...:web:...",
  // },
  collection: "village-scores",
};
