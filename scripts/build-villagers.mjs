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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const VILLAGERS_DIR = join(root, "villagers");
const OUT = join(root, "villagers.generated.js");
const CHECK_ONLY = process.argv.includes("--check");

// 技能選單：必須是這 16 個之一。"custom"（自寫技能碼）為了安全 v1 先不開放——
// 在每位玩家瀏覽器執行 PR 帶進來的任意程式碼 = 重大資安風險，要走 code review 直接併進引擎。
const SKILLS = new Set([
  "shield","taunt","freeze","assassinate","dodge","heal","summon",
  "corrode","empower","hypnosis","overclock","regen","armorbreak",
  "splash","detonate","armor","frenzy",
]);

const LIMITS = {
  hp:  [50, 220],
  atk: [8, 40],
  spd: [5, 20],
  crit:[0, 0.6],
};
const LEN = { name: 24, job: 48, cry: 80, emoji: 8, story: 120, join: 60 };
// ⚠️ 資安不變式：前端 index.html 把 id 與 skill **原樣**插進 innerHTML（id 進 data-id/元素 id/選擇器、
//    skill 當 SKILLS[] 的 key），不另外轉義。所以「id 只允許 [a-z0-9-]」「skill 只允許這 12 個」
//    這兩條 allowlist 就是 id/skill 的唯一 XSS 防線——放寬它們前，務必先在前端 esc() 補上對應轉義。
const ID_RE = /^[a-z0-9][a-z0-9-]{1,23}$/;
// name/job/cry/emoji 這類自由字串不准夾帶 HTML 標記（前端另有 esc() 第二層防線）
const HTML_UNSAFE = /[<>]/;

const errors = [];
const villagers = [];
const seenIds = new Set();

function fail(file, msg) { errors.push(`  ✗ ${file}：${msg}`); }

let files;
try {
  files = readdirSync(VILLAGERS_DIR).filter(f => f.endsWith(".json") && !f.startsWith("_"));
} catch (e) {
  console.error(`找不到 villagers/ 資料夾（${VILLAGERS_DIR}）。`);
  process.exit(1);
}
files.sort();

for (const file of files) {
  const path = join(VILLAGERS_DIR, file);
  let v;
  try {
    v = JSON.parse(readFileSync(path, "utf8"));
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

  // 只保留引擎用得到的欄位（丟掉多餘 key，避免夾帶東西）
  const clean = { id:v.id, name:v.name, job:v.job, emoji:v.emoji, hp:v.hp, atk:v.atk, spd:v.spd, skill:v.skill, cry:v.cry };
  if (v.crit != null) clean.crit = v.crit;
  if (typeof v.story === "string") clean.story = v.story;
  if (typeof v.join === "string") clean.join = v.join;
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
