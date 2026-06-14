/* leaderboard.js — 公播排行榜（雙後端 + 多賽季檢視）
 *
 *   有設定 firebase-config.js → Firestore 即時公播排行（全班共享、real-time）
 *   沒設定               → 本機模式（只存這台裝置，仍完整可玩、可驗證）
 *
 * 賽季：submit 永遠送到「現役賽季」collection；檢視可切到歷屆（封存）賽季的 collection。
 * 切換只需在 firebase-config.js 填入 firebaseConfig，前端程式碼一行都不用改。
 * 存的是去識別化的「代號 handle」（玩家自填），不存真名。
 */
(function () {
  const LS_SCORES = "xinjue-village-scores";
  const LS_HANDLE = "xinjue-village-handle";
  const cfg = (window.__LEADERBOARD_CONFIG__) || {};
  const hasLive = !!(cfg.firebaseConfig && cfg.firebaseConfig.projectId);
  const SUBMIT_COL = cfg.collection || "village-scores";   // 送分目標＝現役賽季

  // 代號清理：擋 HTML、限長、去頭尾空白
  function cleanHandle(s) {
    return String(s || "").replace(/[<>]/g, "").trim().slice(0, 16);
  }

  /* ---------- 本機後端（無賽季，永遠同一份本機榜）---------- */
  function localBackend() {
    let subs = [];
    function read() { try { return JSON.parse(localStorage.getItem(LS_SCORES) || "[]"); } catch (e) { return []; } }
    function write(a) { localStorage.setItem(LS_SCORES, JSON.stringify(a.slice(0, 200))); }
    function top() { return read().sort((a, b) => b.wave - a.wave || a.ts - b.ts).slice(0, 50); }
    function emit() { const t = top(); subs.forEach((cb) => cb(t)); }
    window.addEventListener("storage", (e) => { if (e.key === LS_SCORES) emit(); }); // 跨分頁
    return {
      submit(entry) { const a = read(); a.push(entry); write(a); emit(); return Promise.resolve(); },
      subscribe(_coll, cb) { subs.push(cb); emit(); return () => { subs = subs.filter((x) => x !== cb); }; },
    };
  }

  /* ---------- Firestore 後端（subscribe 可指定賽季 collection）---------- */
  async function liveBackend(c) {
    const V = "10.12.0";
    const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const app = appMod.initializeApp(c.firebaseConfig);
    const db = fs.getFirestore(app);
    return {
      submit(entry) { return fs.addDoc(fs.collection(db, SUBMIT_COL), Object.assign({}, entry, { ts: fs.serverTimestamp() })); },
      subscribe(coll, cb) {
        const q = fs.query(fs.collection(db, coll || SUBMIT_COL), fs.orderBy("wave", "desc"), fs.limit(50));
        return fs.onSnapshot(q, (snap) => {
          cb(snap.docs.map((d) => {
            const v = d.data();
            return Object.assign({}, v, { ts: v.ts && v.ts.toMillis ? v.ts.toMillis() : (v.ts || 0) });
          }));
        }, (err) => { console.warn("[leaderboard] live 訂閱失敗，退回本機顯示：", err.code || err.message); });
      },
    };
  }

  // 啟動：live 失敗（設定錯／網路）→ 自動退回本機，永遠不丟 console error
  const ready = (async () => {
    if (hasLive) {
      try { return { be: await liveBackend(cfg), mode: "live" }; }
      catch (e) { console.warn("[leaderboard] 無法連上即時後端，使用本機模式：", e.message); }
    }
    return { be: localBackend(), mode: "local" };
  })();

  const API = {
    mode: "local",
    // 賽季清單（現役放第一個）；沒設定就退回單一榜
    seasons: (Array.isArray(cfg.seasons) && cfg.seasons.length) ? cfg.seasons
      : [{ key: "all", label: "排行榜", collection: SUBMIT_COL }],
    getHandle() { return localStorage.getItem(LS_HANDLE) || ""; },
    setHandle(h) { const c = cleanHandle(h); if (c) localStorage.setItem(LS_HANDLE, c); return c; },
    async submit(run) {
      const r = await ready;
      const handle = API.getHandle() || "匿名村民";
      const entry = {
        handle: cleanHandle(handle),
        wave: run.wave | 0,
        team: Array.isArray(run.team) ? run.team.slice(0, 4) : [],
        teamEmojis: Array.isArray(run.teamEmojis) ? run.teamEmojis.slice(0, 4) : [],
        ts: run.ts || Date.now(),
        ua: (typeof navigator !== 'undefined' ? navigator.userAgent : 'non-browser').slice(0, 200),
      };
      try { await r.be.submit(entry); }
      catch (e) { console.warn("[leaderboard] 送分失敗，改存本機：", e.message); localBackend().submit(entry); }
      return entry;
    },
    // 訂閱現役賽季（向下相容）
    subscribe(cb) { return API.viewSeason(null, cb); },
    // 訂閱指定賽季 collection（檢視歷屆封存榜）；回傳 unsub
    viewSeason(collection, cb) {
      let unsub = null, dead = false;
      ready.then((r) => { API.mode = r.mode; if (!dead) unsub = r.be.subscribe(collection, cb); });
      return () => { dead = true; if (unsub) unsub(); };
    },
  };

  window.Leaderboard = API;
})();
