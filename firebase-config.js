/* firebase-config.js — 公播排行榜後端設定
 *
 * 「即時公播模式」：全班看同一個榜、real-time 更新（Firestore 專案 core-village）。
 * 連不上時前端會自動退回「本機模式」並在 console 印一行 warning（不會壞、不跳紅字）。
 *
 * 註：Firebase 的 web config（apiKey 等）是「公開設計」、不是機密，放進公開 repo 沒問題。
 *     真正的安全靠 Firestore security rules（見 firestore.rules），不是靠藏這串。
 */
window.__LEADERBOARD_CONFIG__ = {
  firebaseConfig: {
    apiKey: "AIzaSyA6NKvuK1XNFF1MzwUiJZuhLB8UcyAUuR4",
    authDomain: "core-village.firebaseapp.com",
    projectId: "core-village",
    storageBucket: "core-village.firebasestorage.app",
    messagingSenderId: "568230815678",
    appId: "1:568230815678:web:4d29f48393b3c91c227bef",
  },
  collection: "village-scores",
};
