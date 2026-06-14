#!/usr/bin/env node
/**
 * build-villagers.mjs — 把 villagers/*.json 聚合成 villagers.generated.js
 *
 * 這支同時是 PR 的「守門員」：每個欄位都會檢查，錯了會印出清楚的中文訊息並讓 CI 失敗，
 * 讓第一次發 PR 的夥伴看得懂哪裡要改。引擎其餘（戰鬥／像素／機制）完全不動。
 *
 *   node scripts/build-villagers.mjs        # 產生 villagers.generated.js
 *   node scripts/build-villagers.mjs --check # 只驗證，不寫檔（CI 用）
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const VILLAGERS_DIR = join(root, "villagers");
const OUT = join(root, "villagers.generated.js");
const CHECK_ONLY = process.argv.includes("--check");

// 技能選單：必須是下面 SKILLS 白名單裡的其中一個。"custom"（自寫技能碼）為了安全 v1 先不開放——
// 在每位玩家瀏覽器執行 PR 帶進來的任意程式碼 = 重大資安風險，要走 code review 直接併進引擎。
const SKILLS = new Set([
  "shield","taunt","freeze","assassinate","dodge","focus","heal","summon",
  "corrode","empower","hypnosis","overclock","regen","armorbreak",
  "splash","detonate","armor","frenzy","haste","echo",
]);

const LIMITS = {
  hp:  [50, 220],
  atk: [8, 40],
  spd: [5, 20],
  crit:[0, 0.6],
};
const LEN = { name: 24, job: 48, cry: 80, emoji: 8, story: 120, join: 60 };
// ⚠️ 資安不變式：前端 index.html 把 id 與 skill **原樣**插進 innerHTML（id 進 data-id/元素 id/選擇器、
//    skill 當 SKILLS[] 的 key），不另外轉義。所以「id 只允許 [a-z0-9-]」「skill 只允許白名單內」
//    這兩條 allowlist 就是 id/skill 的唯一 XSS 防線——放寬它們前，務必先在前端 esc() 補上對應轉義。
const ID_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
// name/job/cry/emoji 這類自由字串不准夾帶 HTML 標記（前端另有 esc() 第二層防線）
const HTML_UNSAFE = /[<>]/;

const errors = [];
const villagers = [];
const seenIds = new Set();

function fail(file, msg) { errors.push(`  ✗ ${file}：${msg}`); }

let entries;
try {
  entries = readdirSync(VILLAGERS_DIR, { withFileTypes: true });
} catch (e) {
  console.error(`找不到 villagers/ 資料夾（${VILLAGERS_DIR}）。`);
  process.exit(1);
}
// 抓不支援的檔案格式：.json 是村民資料、.webp 是角色卡圖片，其他都退回。
// 排除 _ 範本與 . 開頭的隱藏檔。
for (const d of entries) {
  if (d.isFile() && !d.name.endsWith(".json") && !d.name.endsWith(".webp") && !d.name.startsWith("_") && !d.name.startsWith(".")) {
    fail(d.name, `不支援的檔案格式。村民資料用 .json，角色卡圖片用 .webp（見 CONTRIBUTING.md）。`);
  }
}

// 驗證角色卡圖片（.webp）：格式、大小
const IMAGE_MAX_BYTES = 800 * 1024; // 800KB
const webpFiles = entries.filter(d => d.isFile() && d.name.endsWith(".webp")).map(d => d.name);
const webpIds = new Set();
for (const wf of webpFiles) {
  const base = wf.replace(/\.webp$/, "");
  if (!ID_RE.test(base)) {
    fail(wf, `圖片檔名不合規。請用和 JSON 同名的小寫英文／數字／減號（例如 villagers/my-handle.webp）。`);
    continue;
  }
  const wpath = join(VILLAGERS_DIR, wf);
  const buf = readFileSync(wpath);
  // WebP magic bytes: RIFF(4) + size(4) + WEBP(4)
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    fail(wf, `不是合法的 WebP 圖片。請轉成 .webp 格式（可用線上工具轉檔）。`);
    continue;
  }
  if (buf.length > IMAGE_MAX_BYTES) {
    fail(wf, `圖片太大（${(buf.length / 1024).toFixed(0)} KB），上限 800 KB。請壓縮後重傳。`);
    continue;
  }
  webpIds.add(base);
}
const files = entries.filter(d => d.isFile() && d.name.endsWith(".json") && !d.name.startsWith("_")).map(d => d.name);
files.sort();

for (const file of files) {
  const path = join(VILLAGERS_DIR, file);
  let v;
  try {
    // strip 掉開頭的 UTF-8 BOM（U+FEFF）：Windows 記事本／部分編輯器存檔會夾帶它，
    // 否則 JSON.parse 會丟「Unexpected token」、而夥伴看不見那個隱形字元、無從修起。
    v = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    fail(file, `不是合法的 JSON（${e.message}）。提示：每個欄位後面要逗號，最後一個不要；引號要用半形 " "。`);
    continue;
  }

  const base = file.replace(/\.json$/, "");
  // 必填字串
  for (const k of ["id","name","job","emoji","skill","cry"]) {
    if (typeof v[k] !== "string" || v[k].trim() === "") { fail(file, `缺少或空白的「${k}」欄位（要是文字）。`); }
  }
  // 必填數值
  for (const k of ["hp","atk","spd"]) {
    if (typeof v[k] !== "number" || !Number.isFinite(v[k])) { fail(file, `「${k}」要是數字。`); }
  }
  if (errors.length && errors[errors.length-1]?.includes(file)) { /* keep collecting but skip deep checks if core missing */ }

  if (typeof v.id === "string") {
    if (v.id !== base) fail(file, `「id」(${v.id}) 必須和檔名一致，應為 "${base}"。`);
    if (!ID_RE.test(v.id)) fail(file, `「id」只能用小寫英文、數字、減號（2–24 字），例如 "my-handle"。`);
    if (seenIds.has(v.id)) fail(file, `「id」重複了：${v.id}。每個人挑一個獨一無二的。`);
    seenIds.add(v.id);
  }
  // 長度 + HTML 安全（story/join 為選用，有填才檢查）
  for (const k of ["name","job","cry","emoji","story","join"]) {
    if (typeof v[k] === "string") {
      if ([...v[k]].length > LEN[k]) fail(file, `「${k}」太長了（最多 ${LEN[k]} 字）。`);
      if (HTML_UNSAFE.test(v[k])) fail(file, `「${k}」不能包含 < 或 > 符號（資安考量）。`);
    } else if (v[k] != null) {
      fail(file, `「${k}」要是文字。`);
    }
  }
  // 數值範圍（友善平衡護欄，擋掉 hp:999999 這種）
  for (const k of ["hp","atk","spd"]) {
    if (typeof v[k] === "number") {
      const [lo, hi] = LIMITS[k];
      if (v[k] < lo || v[k] > hi) fail(file, `「${k}」要在 ${lo}–${hi} 之間（你填了 ${v[k]}）。`);
    }
  }
  // 選用 crit
  if (v.crit != null) {
    if (typeof v.crit !== "number" || v.crit < LIMITS.crit[0] || v.crit > LIMITS.crit[1]) {
      fail(file, `選用的「crit」要在 ${LIMITS.crit[0]}–${LIMITS.crit[1]} 之間（爆擊率）。`);
    }
  }
  // 技能
  if (typeof v.skill === "string" && !SKILLS.has(v.skill)) {
    if (v.skill === "custom") {
      fail(file, `「custom」自寫技能 v1 還沒開放（要走 code review）。先從技能選單挑一個：${[...SKILLS].join(", ")}。`);
    } else {
      fail(file, `不認得的技能「${v.skill}」。可選：${[...SKILLS].join(", ")}。`);
    }
  }

  // 選用：自訂像素角色（sprite）——純數據、零程式碼注入。
  // grid = 字元網格（4–16 寬 × 4–16 高），每個字元對應調色盤顏色。
  // colors = 自訂色碼（最多 8 個），key 是 grid 裡的單字元。
  // '.' = 透明、'O' = 輪廓，這兩個加上 BASEPAL 內建色永遠可用。
  const SPRITE_PAL_BUILTINS = new Set(['.','O','H','S','W','F','k','B','b','g','d','y','r']);
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  if (v.sprite != null) {
    if (typeof v.sprite !== "object" || Array.isArray(v.sprite)) {
      fail(file, `「sprite」要是物件（含 grid 和 colors），見 CONTRIBUTING.md。`);
    } else {
      const { grid, colors } = v.sprite;
      if (!Array.isArray(grid) || grid.length < 4 || grid.length > 16) {
        fail(file, `「sprite.grid」要是 4–16 行的字串陣列。`);
      } else {
        const gw = grid[0].length;
        if (gw < 4 || gw > 16) fail(file, `sprite 寬度要 4–16（你的是 ${gw}）。`);
        if (grid.some(r => typeof r !== "string" || r.length !== gw)) {
          fail(file, `sprite.grid 每行長度必須一樣（都是 ${gw}）。`);
        }
        // 收集合法字元：內建 + 自訂 colors
        const validChars = new Set(SPRITE_PAL_BUILTINS);
        if (colors != null) {
          if (typeof colors !== "object" || Array.isArray(colors)) {
            fail(file, `「sprite.colors」要是物件（key=單字元、value=#RRGGBB）。`);
          } else {
            const ck = Object.keys(colors);
            if (ck.length > 8) fail(file, `sprite.colors 最多 8 個自訂顏色（你有 ${ck.length} 個）。`);
            for (const k of ck) {
              if (k.length !== 1) fail(file, `sprite.colors 的 key 必須是單字元（「${k}」不合規）。`);
              if (!HEX_RE.test(colors[k])) fail(file, `sprite.colors.${k} 要是 #RRGGBB 格式的色碼（你填了 ${colors[k]}）。`);
              validChars.add(k);
            }
          }
        }
        // 檢查 grid 裡每個字元都有對應顏色
        for (let gy = 0; gy < grid.length; gy++) {
          for (const ch of grid[gy]) {
            if (!validChars.has(ch)) {
              fail(file, `sprite.grid 第 ${gy+1} 行有未定義的字元「${ch}」。用 . 透明、O 輪廓，或在 colors 裡定義它的顏色。`);
            }
          }
        }
      }
    }
  }

  // 只保留引擎用得到的欄位（丟掉多餘 key，避免夾帶東西）
  const clean = { id:v.id, name:v.name, job:v.job, emoji:v.emoji, hp:v.hp, atk:v.atk, spd:v.spd, skill:v.skill, cry:v.cry };
  if (v.crit != null) clean.crit = v.crit;
  if (typeof v.story === "string") clean.story = v.story;
  if (typeof v.join === "string") clean.join = v.join;
  if (webpIds.has(v.id)) clean.hasImg = true;
  if (v.sprite && typeof v.sprite === "object" && Array.isArray(v.sprite.grid)) {
    clean.sprite = { grid: v.sprite.grid };
    if (v.sprite.colors && typeof v.sprite.colors === "object") clean.sprite.colors = v.sprite.colors;
  }
  villagers.push(clean);
}

if (villagers.length === 0 && errors.length === 0) {
  fail("villagers/", "一個村民都沒有。至少要有一個 .json。");
}

if (errors.length) {
  console.error(`\n❌ 村民資料檢查沒過（${errors.length} 個問題）：\n`);
  console.error(errors.join("\n"));
  console.error(`\n修好上面的問題再 push。需要協助看 CONTRIBUTING.md。\n`);
  process.exit(1);
}

villagers.sort((a, b) => a.id.localeCompare(b.id));

if (CHECK_ONLY) {
  console.log(`✓ ${villagers.length} 個村民全部通過檢查。`);
  process.exit(0);
}

const banner = "// ⚠️ 自動產生，請勿手動編輯。改 villagers/*.json 後跑 `npm run build`。\n";
const body = `window.__VILLAGERS__ = ${JSON.stringify(villagers, null, 2)};\n`;
writeFileSync(OUT, banner + body);
console.log(`✓ 聚合 ${villagers.length} 個村民 → villagers.generated.js`);

// cache-bust：把 index.html 裡幾個本地 <script src> 戳上各自的內容雜湊（?v=），讓瀏覽器在檔案變動時一定重抓、
// 不會吃舊快取。雜湊隨內容變才變＝同內容不會製造無謂 diff。CI（deploy.yml）每次 build 後上傳整個目錄→部署版一定帶最新 ?v=。
// ⛏️ villagers.generated.js＝夥伴 PR 新角色/改技能即時可見；firebase-config.js＝賽季 collection 換了不會用舊設定送錯榜
//   （根因案例：S1 後手機快取舊 config→送分進唯讀 beta collection→被規則拒→靜默存本機→共享榜看不到）；leaderboard.js＝改榜邏輯即時生效。
const idxPath = join(root, "index.html");
let idx = readFileSync(idxPath, "utf8");
let bustChanged = false;
for (const [file, preContent] of [["villagers.generated.js", body], ["firebase-config.js", null], ["leaderboard.js", null]]) {
  let content = preContent;
  if (content == null) { try { content = readFileSync(join(root, file), "utf8"); } catch { continue; } }
  const v = createHash("sha1").update(content).digest("hex").slice(0, 8);
  const re = new RegExp(`<script src="${file.replace(/\./g, "\\.")}(?:\\?v=[a-f0-9]+)?"></script>`);
  const next = idx.replace(re, `<script src="${file}?v=${v}"></script>`);
  if (next !== idx) { idx = next; bustChanged = true; console.log(`✓ cache-bust ${file}?v=${v}`); }
}
if (bustChanged) writeFileSync(idxPath, idx);
