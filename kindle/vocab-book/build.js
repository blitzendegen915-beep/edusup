/**
 * Kindle用 英単語帳（EPUB）生成スクリプト
 *
 * 使い方:
 *   node kindle/vocab-book/build.js
 *   node kindle/vocab-book/build.js <本のフォルダ>   ← 2巻目などを別フォルダで作るとき
 *
 * book.json（本の設定）と words.csv（単語データ）を読み込み、dist/ 配下に
 *   - <fileName>.epub   … KDP（Kindle ダイレクト・パブリッシング）にそのまま上げる原稿
 *   - cover.jpg         … KDP に上げる表紙（フォルダに cover.jpg / cover.png があればコピー）
 *   - preview.html      … ブラウザで全ページを確認できるプレビュー
 *   - kdp-listing.txt   … KDP の入力欄に貼る内容のメモ
 * を生成します。Node.js の標準機能だけで動くので、npm install は不要です。
 *
 * 本の構成（ドーパミン設計）:
 *   1ページ1単語のカード → 1ステージごとに「ボス戦」（選択肢をタップすると正解/不正解ページへジャンプ）
 *   → 答え合わせとランク判定 → 次のステージ … → ラスボス戦 → ALL CLEAR → さくいん
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

// 第1引数で本のフォルダを指定できる（省略時はこのスクリプトと同じフォルダ）
const BOOK_DIR = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const DIST_DIR = path.join(BOOK_DIR, "dist");

const CSV_COLUMNS = ["stage", "word", "pos", "meaning", "reading", "rarity", "hook", "example", "example_ja", "plus"];
const REQUIRED_COLUMNS = ["stage", "word", "pos", "meaning"];
const RARITY_STARS = { N: "★", R: "★★", SR: "★★★", SSR: "★★★★" };
const CHOICE_MARKS = ["①", "②", "③", "④", "⑤", "⑥"];
const MAX_EXAMPLE_WORDS = 15;

// 正解・不正解ページのひとこと（順番に使い回す）
const OK_MESSAGES = ["天才では？", "ナイス！その調子", "脳が喜んでる", "完璧！次もいける", "記憶に刻まれた"];
const NG_MESSAGES = ["ここで覚えればOK", "間違えた単語ほど伸びしろ", "次で取り返そう", "ドンマイ！もう覚えた"];

// ランク判定（正解率の下限）。上から順に判定する
const RANKS = [
  { rank: "S", label: "神", minRate: 1 },
  { rank: "A", label: "つよい", minRate: 0.8 },
  { rank: "B", label: "伸びしろしかない", minRate: 0.6 },
  { rank: "C", label: "もう1周で化ける", minRate: 0 },
];

const warnings = [];

function fail(message) {
  console.error(`\nエラー: ${message}`);
  process.exit(1);
}

function warn(message) {
  warnings.push(message);
}

// ---------------------------------------------------------------------------
// 読み込み（book.json / words.csv）
// ---------------------------------------------------------------------------

function loadBook() {
  const filePath = path.join(BOOK_DIR, "book.json");
  if (!fs.existsSync(filePath)) fail(`book.json が見つかりません: ${filePath}`);
  let book;
  try {
    book = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fail(`book.json の書式が正しくありません（カンマの付け忘れ・付けすぎがよくある原因です）。\n  ${err.message}`);
  }
  for (const key of ["title", "author", "fileName"]) {
    if (!book[key]) fail(`book.json に "${key}" がありません。`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(book.fileName)) {
    fail(`book.json の fileName は半角英数字・ハイフン・アンダーバーだけにしてください（今: "${book.fileName}"）。`);
  }
  if (book.publishDate && !/^\d{4}-\d{2}-\d{2}$/.test(book.publishDate)) {
    fail(`book.json の publishDate は "2026-10-06" の形で書いてください（今: "${book.publishDate}"）。`);
  }
  book.quiz = Object.assign({ choices: 4, xpPerCorrect: 10, finalBossQuestions: 20, avoidTogether: [] }, book.quiz || {});
  const choices = book.quiz.choices;
  if (!Number.isInteger(choices) || choices < 2 || choices > CHOICE_MARKS.length) {
    fail(`book.json の quiz.choices は 2〜${CHOICE_MARKS.length} の整数にしてください（今: ${choices}）。`);
  }
  book.stages = book.stages || [];
  book.howToUse = book.howToUse || [];
  book.tips = book.tips || [];
  book.allClearMessage = book.allClearMessage || [];
  book.kdp = book.kdp || {};
  if (!book.identifier) {
    // 本の固有ID。KDPで同じ本を更新し続けるため、一度決めたら変えない
    book.identifier = `urn:uuid:${uuidFromText(`${book.title}|${book.author}`)}`;
    warn(`book.json に identifier がないため自動で作りました。次回からは "identifier": "${book.identifier}" を book.json に書いておくと安全です。`);
  }
  return book;
}

/** CSV（ダブルクォート・セル内改行・カンマ入りのセルに対応）を2次元配列にする */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function loadWords() {
  const filePath = path.join(BOOK_DIR, "words.csv");
  if (!fs.existsSync(filePath)) fail(`words.csv が見つかりません: ${filePath}`);
  let text = fs.readFileSync(filePath, "utf8");
  if (text.includes("�")) {
    fail("words.csv の文字コードが UTF-8 ではないようです。Excelなら「名前を付けて保存」→「CSV UTF-8（コンマ区切り）」で保存し直してください。");
  }
  text = text.replace(/^﻿/, ""); // Excelが付けるBOMを外す
  const rows = parseCsv(text);
  if (rows.length < 2) fail("words.csv に単語がありません（1行目は見出し、2行目から単語を書きます）。");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  for (const col of REQUIRED_COLUMNS) {
    if (!header.includes(col)) {
      fail(`words.csv の1行目（見出し）に "${col}" 列がありません。見出しは ${CSV_COLUMNS.join(",")} です。`);
    }
  }

  const words = [];
  rows.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return; // 空行は飛ばす
    const get = (name) => {
      const index = header.indexOf(name);
      return index >= 0 && cells[index] !== undefined ? cells[index].trim() : "";
    };
    words.push({
      row: i + 2, // スプレッドシート上の行番号（見出しが1行目）
      stage: get("stage"),
      word: get("word"),
      pos: get("pos"),
      meaning: get("meaning"),
      reading: get("reading"),
      rarity: get("rarity").toUpperCase(),
      hook: get("hook"),
      example: get("example"),
      exampleJa: get("example_ja"),
      plus: get("plus"),
    });
  });
  return words;
}

// ---------------------------------------------------------------------------
// チェック（正解の一意性・重複・書式）
// ---------------------------------------------------------------------------

function validateWords(words) {
  if (words.length === 0) fail("words.csv に単語が1つもありません。");
  const seenWords = new Map();
  const seenMeanings = new Map();
  for (const w of words) {
    const where = `words.csv ${w.row}行目（${w.word || "単語なし"}）`;
    for (const col of REQUIRED_COLUMNS) {
      if (!w[col]) fail(`${where}: "${col}" が空です。`);
    }
    if (!/^\d+$/.test(w.stage) || Number(w.stage) < 1) {
      fail(`${where}: stage は1以上の整数で書いてください（今: "${w.stage}"）。`);
    }
    w.stage = Number(w.stage);
    w.key = w.word.toLowerCase();

    if (seenWords.has(w.key)) fail(`${where}: 単語 "${w.word}" が ${seenWords.get(w.key)}行目と重複しています。`);
    seenWords.set(w.key, w.row);

    // 意味が同じ単語があると「日本語→英語」の問題で正解が2つになってしまう
    if (seenMeanings.has(w.meaning)) {
      const other = seenMeanings.get(w.meaning);
      fail(`${where}: 意味「${w.meaning}」が ${other.row}行目の "${other.word}" と同じです。クイズの正解が1つに決まらなくなるので、意味を書き分けてください。`);
    }
    seenMeanings.set(w.meaning, w);

    if (w.rarity && !RARITY_STARS[w.rarity]) {
      fail(`${where}: rarity は N / R / SR / SSR のどれか（または空欄）にしてください（今: "${w.rarity}"）。`);
    }
    if (!w.example) {
      warn(`${where}: 例文（example）がありません。`);
    } else {
      const count = w.example.split(/\s+/).filter(Boolean).length;
      if (count > MAX_EXAMPLE_WORDS) {
        warn(`${where}: 例文が ${count} 語と長めです。${MAX_EXAMPLE_WORDS}語以内だとテンポよく読めます。`);
      }
    }
    for (const col of ["reading", "example"]) {
      const open = (w[col].match(/\[/g) || []).length;
      const close = (w[col].match(/\]/g) || []).length;
      if (open !== close) warn(`${where}: ${col} の [ ] の数が合っていません。`);
    }
  }
}

/** ステージごとにまとめ、通し番号とページIDを振る */
function groupStages(words, book) {
  const numbers = [...new Set(words.map((w) => w.stage))].sort((a, b) => a - b);
  if (numbers.some((n, i) => n !== i + 1)) {
    warn(`stage の番号が 1 から順に並んでいません（${numbers.join(", ")}）。抜けている番号がないか確認してください。`);
  }
  const stages = numbers.map((number) => {
    const config = book.stages.find((s) => Number(s.number) === number) || {};
    const stageWords = words.filter((w) => w.stage === number);
    if (stageWords.length < book.quiz.choices) {
      fail(`STAGE ${number} の単語が ${stageWords.length} 個しかありません。ボス戦の選択肢を作るため、1ステージに ${book.quiz.choices} 個以上入れてください。`);
    }
    return { number, key: `s${pad(number, 2)}`, title: config.title || "", words: stageWords };
  });
  let no = 0;
  for (const stage of stages) {
    stage.words.forEach((w, i) => {
      no += 1;
      w.no = no;
      w.indexInStage = i + 1;
      w.stage = stage;
      w.pageId = `w${pad(no, 3)}`;
    });
  }
  return stages;
}

/** 「同じ問題の選択肢に並べない単語」の組を読み込む（意味が近くて正解が1つに決まらない組） */
function buildAvoidMap(book, words) {
  const known = new Set(words.map((w) => w.key));
  const map = new Map();
  for (const group of book.quiz.avoidTogether) {
    if (!Array.isArray(group)) continue;
    const keys = group.map((g) => String(g).toLowerCase());
    for (const k of keys) {
      if (!known.has(k)) warn(`book.json の quiz.avoidTogether にある "${k}" は words.csv にありません。`);
      if (!map.has(k)) map.set(k, new Set());
      for (const other of keys) if (other !== k) map.get(k).add(other);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// クイズ（ボス戦）の作成
// ---------------------------------------------------------------------------

/** シード付き乱数。同じデータなら毎回同じ並びになる（ビルドし直しても問題が変わらない） */
function createRandom(seedText) {
  let seed = crypto.createHash("sha256").update(seedText).digest().readUInt32LE(0);
  return function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 正解の位置（①〜④）を均等に割り振る。
 * 例: 10問・4択なら ①②③④ が 3,3,2,2 回（どれが3回かはランダム）。
 * さらに同じ番号が3問以上続かないように並べる。
 */
function balancedAnswerPositions(count, choiceCount, random) {
  const order = shuffle([...Array(choiceCount).keys()], random);
  const base = [];
  for (let i = 0; i < count; i++) base.push(order[i % choiceCount]);
  const hasLongRun = (list) => list.some((v, i) => i >= 2 && v === list[i - 1] && v === list[i - 2]);
  let positions = shuffle(base, random);
  for (let tries = 0; tries < 200 && hasLongRun(positions); tries++) positions = shuffle(base, random);
  return positions;
}

/** ダミー選択肢を選ぶ。pools は優先順の候補リスト（同じステージ・同じ品詞 → … → 全単語） */
function pickDistractors(target, pools, count, avoidMap, random) {
  const blocked = avoidMap.get(target.key) || new Set();
  const chosen = [];
  for (const pool of pools) {
    for (const candidate of shuffle(pool, random)) {
      if (chosen.length >= count) return chosen;
      if (candidate === target || chosen.includes(candidate) || blocked.has(candidate.key)) continue;
      chosen.push(candidate);
    }
  }
  if (chosen.length < count) {
    fail(`"${target.word}" の選択肢が足りません。単語を増やすか、book.json の quiz.avoidTogether を見直してください。`);
  }
  return chosen;
}

function makeQuestions({ idPrefix, targets, poolsFor, book, avoidMap, random }) {
  const choiceCount = book.quiz.choices;
  const positions = balancedAnswerPositions(targets.length, choiceCount, random);
  return targets.map((target, i) => {
    const choices = shuffle(pickDistractors(target, poolsFor(target), choiceCount - 1, avoidMap, random), random);
    choices.splice(positions[i], 0, target);
    const id = `${idPrefix}-q${pad(i + 1, 2)}`;
    return {
      id,
      number: i + 1,
      total: targets.length,
      // 英→日 と 日→英 を交互に出す
      type: i % 2 === 0 ? "en2ja" : "ja2en",
      target,
      choices,
      correctIndex: positions[i],
      okPageId: `j-${id}-ok`,
      ngPageId: `j-${id}-ng`,
    };
  });
}

function buildQuizzes(stages, words, book, avoidMap) {
  const samePos = (list, target) => list.filter((w) => w.pos === target.pos);
  for (const stage of stages) {
    const random = createRandom(`${book.identifier}|${stage.key}`);
    stage.questions = makeQuestions({
      idPrefix: stage.key,
      targets: shuffle(stage.words, random),
      poolsFor: (t) => [samePos(stage.words, t), stage.words, samePos(words, t), words],
      book,
      avoidMap,
      random,
    });
  }

  // ラスボス戦: 各ステージから均等に出題する
  const total = Math.min(Number(book.quiz.finalBossQuestions) || 0, words.length);
  if (total <= 0) return [];
  const random = createRandom(`${book.identifier}|final`);
  const queues = stages.map((s) => shuffle(s.words, random));
  const targets = [];
  while (targets.length < total) {
    for (const queue of queues) {
      if (targets.length < total && queue.length > 0) targets.push(queue.shift());
    }
  }
  return makeQuestions({
    idPrefix: "final",
    targets: shuffle(targets, random),
    poolsFor: (t) => [samePos(words, t), words],
    book,
    avoidMap,
    random,
  });
}

/** 念のための最終チェック: 選択肢の重複・正解の位置ずれがないか */
function verifyQuestions(questions, label) {
  for (const q of questions) {
    const labels = q.choices.map((c) => choiceLabel(q, c));
    if (new Set(labels).size !== labels.length) fail(`${label} Q${q.number}: 選択肢が重複しています（${labels.join(" / ")}）。`);
    if (q.choices[q.correctIndex] !== q.target) fail(`${label} Q${q.number}: 正解の位置がずれています。`);
  }
}

function answerDistribution(questions, choiceCount) {
  const counts = Array(choiceCount).fill(0);
  for (const q of questions) counts[q.correctIndex] += 1;
  return counts.map((n, i) => `${CHOICE_MARKS[i]}${n}`).join(" ");
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** XHTMLに埋め込む文字列をエスケープする */
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

/** [ ] で囲んだ部分を太字にする（発音の強く読む部分・例文の見出し語） */
function bracketToBold(text) {
  return esc(text).replace(/\[([^\]]+)\]/g, "<b>$1</b>");
}

/** 見出し語の変化形（-s, -ed, -ing など）の候補 */
function wordForms(base) {
  const w = base.toLowerCase();
  const forms = new Set([w, `${w}s`, `${w}es`, `${w}d`, `${w}ed`, `${w}ing`]);
  if (w.endsWith("e")) forms.add(`${w.slice(0, -1)}ing`);
  if (w.endsWith("y")) {
    forms.add(`${w.slice(0, -1)}ies`);
    forms.add(`${w.slice(0, -1)}ied`);
  }
  const last = w.slice(-1);
  if (/[bdgmnprt]/.test(last)) {
    forms.add(`${w}${last}ed`);
    forms.add(`${w}${last}ing`);
  }
  return [...forms].sort((a, b) => b.length - a.length);
}

/** 例文の見出し語を太字にする。[ ] があればそこを、なければ自動で探す */
function exampleHtml(word) {
  if (/\[[^\]]+\]/.test(word.example)) return bracketToBold(word.example);
  const pattern = new RegExp(`\\b(${wordForms(word.word).map(escapeRegExp).join("|")})\\b`, "gi");
  const escaped = esc(word.example);
  if (!pattern.test(escaped)) {
    warn(`words.csv ${word.row}行目（${word.word}）: 例文の中に見出し語が見つからず、太字にできませんでした。太字にしたい部分を [ ] で囲んでください。`);
    return escaped;
  }
  pattern.lastIndex = 0;
  return escaped.replace(pattern, "<b>$1</b>");
}

function posLabel(pos) {
  return pos.slice(0, 1); // 動詞→動、形容詞→形、名詞→名
}

function choiceLabel(question, word) {
  return question.type === "en2ja" ? word.meaning : word.word;
}

function progressBar(current, total) {
  if (total <= 20) return "■".repeat(current) + "□".repeat(total - current);
  const filled = Math.round((current / total) * 10);
  return "■".repeat(filled) + "□".repeat(10 - filled);
}

/** 文章中の {words} などを実際の数字に置き換える */
function fillTemplate(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (all, key) => (key in values ? values[key] : all));
}

/** 正解数からランク表を作る（例: 10問なら S=100XP, A=80〜90XP …） */
function rankRows(total, xp) {
  const rows = [];
  let upper = total;
  for (const r of RANKS) {
    const min = Math.ceil(total * r.minRate);
    if (min > upper) continue; // 問題数が少なくて範囲が作れないランクは省く
    rows.push({ ...r, minXp: min * xp, maxXp: upper * xp });
    upper = min - 1;
    if (upper < 0) break;
  }
  return rows;
}

function uuidFromText(text) {
  const hex = crypto.createHash("sha1").update(text).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 表紙画像の縦横サイズを読む（JPEG/PNG）。読めなければ null */
function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // SOF マーカー（C0〜CF のうち C4/C8/CC 以外）に縦横が書かれている
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function loadCover() {
  for (const name of ["cover.jpg", "cover.jpeg", "cover.png"]) {
    const filePath = path.join(BOOK_DIR, name);
    if (!fs.existsSync(filePath)) continue;
    const data = fs.readFileSync(filePath);
    const isPng = name.endsWith(".png");
    const size = imageSize(data);
    if (!size) {
      warn(`${name} の画像サイズを読み取れませんでした。JPEG か PNG で保存し直してください。`);
    } else if (size.width < 1000 || size.height < 1600) {
      warn(`表紙 ${name} が ${size.width}×${size.height}px と小さめです。KDP推奨は 横1600×縦2560px です。`);
    } else if (Math.abs(size.height / size.width - 1.6) > 0.05) {
      warn(`表紙 ${name} の縦横比が ${(size.height / size.width).toFixed(2)} です。KDP推奨は 1.6（横1600×縦2560px）です。`);
    }
    if (isPng) warn("KDPの表紙アップロード欄は JPEG（.jpg）か TIFF のみです。cover.png は .jpg に変換してアップロードしてください。");
    return { name, data, ext: isPng ? "png" : "jpg", mediaType: isPng ? "image/png" : "image/jpeg" };
  }
  warn("表紙画像（cover.jpg）がありません。表紙なしで EPUB を作ります。KDPには別途表紙をアップロードしてください。");
  return null;
}

// ---------------------------------------------------------------------------
// ページの生成（各ページは1つのXHTMLファイル = Kindleで必ず改ページされる）
// ---------------------------------------------------------------------------

function goLink(href, label) {
  return `<p class="go"><a href="${href}.xhtml">${esc(label)}</a></p>`;
}

function titlePage(book) {
  return {
    id: "titlepage",
    title: book.title,
    html: `<div class="page titlepage">
${book.badge ? `<p class="tp-badge">${esc(book.badge)}</p>` : ""}
<h1 class="tp-title">${esc(book.title)}</h1>
${book.subtitle ? `<p class="tp-subtitle">${esc(book.subtitle)}</p>` : ""}
<p class="tp-author">${esc(book.author)}</p>
</div>`,
  };
}

function introPage(book, stages, values) {
  const rules = book.howToUse.map((line) => `<li>${esc(fillTemplate(line, values))}</li>`).join("\n");
  const tips = book.tips.map((line) => `<p>・${esc(fillTemplate(line, values))}</p>`).join("\n");
  return {
    id: "intro",
    title: "この本の使い方",
    html: `<div class="page intro">
<h1 class="page-title">この本の使い方</h1>
<p class="lead">30秒で読めるルール説明</p>
<ol class="rules">
${rules}
</ol>
${tips ? `<div class="box"><p class="label">コツ</p>\n${tips}\n</div>` : ""}
${goLink(stages[0].key, `▶ STAGE ${stages[0].number} をはじめる`)}
</div>`,
  };
}

function stageIntroPage(stage) {
  const minutes = Math.max(1, Math.ceil((stage.words.length * 10 + stage.questions.length * 10) / 60));
  return {
    id: stage.key,
    title: `STAGE ${stage.number}${stage.title ? ` ${stage.title}` : ""}`,
    html: `<div class="page stage-intro">
<p class="stage-label">STAGE</p>
<p class="stage-number">${stage.number}</p>
${stage.title ? `<h1 class="stage-title">${esc(stage.title)}</h1>` : `<h1 class="stage-title">STAGE ${stage.number}</h1>`}
<p class="stage-meta">${stage.words.length} WORDS ／ 目安 約${minutes}分</p>
<div class="box"><p class="label">このステージでゲットする単語</p>
<p class="stage-words">${stage.words.map((w) => esc(w.word)).join(" / ")}</p></div>
${goLink(stage.words[0].pageId, "▶ START")}
</div>`,
  };
}

function wordPage(word, totalWords) {
  const stage = word.stage;
  const isLast = word.indexInStage === stage.words.length;
  return {
    id: word.pageId,
    title: word.word,
    html: `<div class="page word">
<p class="card-meta">No.${pad(word.no, 3)}　｜　STAGE ${stage.number}　｜　${word.indexInStage} / ${stage.words.length}</p>
<p class="progress">${progressBar(word.indexInStage, stage.words.length)}</p>
${word.rarity ? `<p class="rarity">${word.rarity}　${RARITY_STARS[word.rarity]}</p>` : ""}
<h1 class="headword">${esc(word.word)}</h1>
${word.reading ? `<p class="reading">${bracketToBold(word.reading)}</p>` : ""}
<p class="meaning"><span class="pos">${esc(posLabel(word.pos))}</span>${esc(word.meaning)}</p>
${word.hook ? `<div class="box hook"><p class="label">覚え方</p><p>${esc(word.hook)}</p></div>` : ""}
${
  word.example
    ? `<div class="box example"><p class="label">例文</p><p class="en">${exampleHtml(word)}</p>${
        word.exampleJa ? `<p class="ja">${esc(word.exampleJa)}</p>` : ""
      }</div>`
    : ""
}
${word.plus ? `<p class="plus"><span class="plus-label">＋α</span>${esc(word.plus)}</p>` : ""}
${isLast ? `<p class="next-hint">次のページ、ボス登場…！</p>` : ""}
<p class="total">ゲット ${word.no} / ${totalWords}</p>
</div>`,
  };
}

function bossIntroPage({ id, heading, title, questions, book }) {
  return {
    id,
    title,
    html: `<div class="page boss-intro">
<p class="boss-label">${esc(heading)}</p>
<h1 class="boss-title">${esc(title)}</h1>
<p class="center">全${questions.length}問。選択肢をタップして答えよう。</p>
<p class="center">正解1問につき <b>+${book.quiz.xpPerCorrect}XP</b></p>
<p class="center small">※答えずにページをめくると、次の問題に進みます。</p>
${goLink(questions[0].id, "▶ たたかう")}
</div>`,
  };
}

function questionPage(q, label) {
  const prompt =
    q.type === "en2ja"
      ? `<p class="q-type">英語 → 日本語</p>
<p class="q-word">${esc(q.target.word)}</p>
<p class="q-ask">の意味は？</p>`
      : `<p class="q-type">日本語 → 英語</p>
<p class="q-ja">「${esc(q.target.meaning)}」</p>
<p class="q-ask">を英語で言うと？</p>`;
  const choices = q.choices
    .map((c, i) => {
      const href = i === q.correctIndex ? q.okPageId : q.ngPageId;
      return `<p class="choice"><a href="${href}.xhtml">${CHOICE_MARKS[i]} ${esc(choiceLabel(q, c))}</a></p>`;
    })
    .join("\n");
  return {
    id: q.id,
    title: `${label} Q${q.number}`,
    html: `<div class="page question">
<p class="q-meta">${esc(label)}　｜　Q${q.number} / ${q.total}</p>
<p class="progress">${progressBar(q.number, q.total)}</p>
${prompt}
${choices}
</div>`,
  };
}

function answerLine(q) {
  return `<b>${esc(q.target.word)}</b>　${esc(q.target.meaning)}`;
}

function judgePages(q, nextId, nextLabel, book) {
  const ok = {
    id: q.okPageId,
    title: `${q.id} 正解`,
    html: `<div class="page judge">
<p class="judge-mark">◎</p>
<h1 class="judge-title">正解！</h1>
<p class="judge-msg">${esc(OK_MESSAGES[q.number % OK_MESSAGES.length])}</p>
<p class="xp">+${book.quiz.xpPerCorrect} XP</p>
<div class="box"><p class="answer-line">${answerLine(q)}</p></div>
${goLink(nextId, nextLabel)}
</div>`,
  };
  const ng = {
    id: q.ngPageId,
    title: `${q.id} 不正解`,
    html: `<div class="page judge">
<p class="judge-mark">×</p>
<h1 class="judge-title">ざんねん！</h1>
<p class="judge-msg">${esc(NG_MESSAGES[q.number % NG_MESSAGES.length])}</p>
<div class="box"><p class="label">正解は ${CHOICE_MARKS[q.correctIndex]}</p>
<p class="answer-line">${answerLine(q)}</p>
${q.target.hook ? `<p class="small">覚え方：${esc(q.target.hook)}</p>` : ""}</div>
${goLink(nextId, nextLabel)}
<p class="sub-link"><a href="${q.target.pageId}.xhtml">▷ 単語カードを見なおす</a></p>
</div>`,
  };
  return [ok, ng];
}

function resultPage({ id, heading, questions, gotWords, totalWords, nextId, nextLabel, retryId, book }) {
  const xp = book.quiz.xpPerCorrect;
  const answers = questions
    .map((q) => `<p class="answer-row">Q${q.number}　${CHOICE_MARKS[q.correctIndex]}　${answerLine(q)}</p>`)
    .join("\n");
  const ranks = rankRows(questions.length, xp)
    .map((r) => {
      const range = r.minXp === r.maxXp ? `${r.minXp}XP` : `${r.minXp}〜${r.maxXp}XP`;
      return `<p class="rank-row"><b>${r.rank}</b>　${range}　「${esc(r.label)}」</p>`;
    })
    .join("\n");
  return {
    id,
    title: `${heading} 答え合わせ`,
    html: `<div class="page result">
<p class="clear-label">${esc(heading)}</p>
<h1 class="clear-title">CLEAR!!</h1>
<p class="center">ゲットした単語　<b>${gotWords} / ${totalWords}</b></p>
<h2 class="section-title">答え合わせ</h2>
${answers}
<h2 class="section-title">ランク判定</h2>
<p>正解の数 × ${xp}XP を数えよう！</p>
${ranks}
${goLink(nextId, nextLabel)}
<p class="sub-link"><a href="${retryId}.xhtml">▷ もう一度ボス戦</a></p>
</div>`,
  };
}

function allClearPage(book, values) {
  const lines = book.allClearMessage.map((line) => `<p>${esc(fillTemplate(line, values))}</p>`).join("\n");
  return {
    id: "all-clear",
    title: "ALL CLEAR",
    html: `<div class="page result">
<p class="clear-label">CONGRATULATIONS</p>
<h1 class="clear-title">ALL CLEAR!!</h1>
<div class="box">
${lines}
</div>
${goLink("word-index", "▶ さくいん（全単語リスト）")}
</div>`,
  };
}

function wordIndexPage(words) {
  const sorted = words.slice().sort((a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }));
  let currentLetter = "";
  const rows = [];
  for (const w of sorted) {
    const letter = w.word.charAt(0).toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      rows.push(`<h2 class="index-letter">${esc(letter)}</h2>`);
    }
    rows.push(`<p class="index-row"><a href="${w.pageId}.xhtml">${esc(w.word)}</a>　${esc(w.meaning)}　<span class="small">No.${pad(w.no, 3)}</span></p>`);
  }
  return {
    id: "word-index",
    title: "さくいん",
    html: `<div class="page index">
<h1 class="page-title">さくいん</h1>
<p class="small">単語をタップすると、その単語カードにジャンプします。</p>
${rows.join("\n")}
</div>`,
  };
}

function colophonPage(book) {
  const year = (book.publishDate || new Date().toISOString()).slice(0, 4);
  const date = book.publishDate
    ? `${Number(book.publishDate.slice(0, 4))}年${Number(book.publishDate.slice(5, 7))}月${Number(book.publishDate.slice(8, 10))}日`
    : "";
  return {
    id: "colophon",
    title: "奥付",
    html: `<div class="page colophon">
<p class="colophon-title">${esc(book.title)}</p>
${book.subtitle ? `<p>${esc(book.subtitle)}</p>` : ""}
<p>${esc(date)}　${esc(book.edition || "")}発行（電子書籍版）</p>
<p>著者　${esc(book.author)}</p>
<p>発行　${esc(book.publisher || book.author)}</p>
<p>© ${esc(year)} ${esc(book.author)}</p>
<p class="small">本書の内容の一部または全部を、無断で複製・転載・配布することを禁じます。</p>
</div>`,
  };
}

function jumpZonePage() {
  return {
    id: "jump-zone",
    title: "ジャンプ用ページ",
    html: `<div class="page intro">
<h1 class="page-title">ここから先はジャンプ用ページ</h1>
<p>ここから先は、ボス戦の選択肢をタップしたときに開く「正解！」「ざんねん！」のページです。</p>
<p>順番に読む必要はありません。</p>
${goLink("nav", "▶ もくじへ戻る")}
</div>`,
  };
}

/** もくじ（nav.xhtml と toc.ncx の両方をここから作る） */
function buildTocEntries(stages, finalQuestions) {
  const entries = [{ label: "この本の使い方", id: "intro" }];
  for (const stage of stages) {
    entries.push({
      label: `STAGE ${stage.number}${stage.title ? ` ${stage.title}` : ""}`,
      id: stage.key,
      children: [{ label: "ボス戦", id: `${stage.key}-boss` }],
    });
  }
  if (finalQuestions.length > 0) entries.push({ label: "ラスボス戦", id: "final-boss" });
  entries.push({ label: "さくいん（全単語リスト）", id: "word-index" });
  entries.push({ label: "奥付", id: "colophon" });
  return entries;
}

function navPage(tocEntries) {
  const renderList = (entries) =>
    `<ol>\n${entries
      .map(
        (e) =>
          `<li><a href="${e.id}.xhtml">${esc(e.label)}</a>${e.children ? `\n${renderList(e.children)}\n` : ""}</li>`
      )
      .join("\n")}\n</ol>`;
  return {
    id: "nav",
    title: "もくじ",
    html: `<div class="page toc">
<nav epub:type="toc" id="toc">
<h1 class="page-title">もくじ</h1>
${renderList(tocEntries)}
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>ガイド</h2>
<ol>
<li><a epub:type="toc" href="nav.xhtml#toc">もくじ</a></li>
<li><a epub:type="bodymatter" href="intro.xhtml">本文</a></li>
</ol>
</nav>
</div>`,
  };
}

/** すべてのページを読む順番に並べる */
function buildPages(book, stages, words, finalQuestions) {
  const totalWords = words.length;
  const sizes = stages.map((s) => s.words.length);
  const values = {
    words: totalWords,
    stages: stages.length,
    xp: book.quiz.xpPerCorrect,
    wordsPerStage: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
  };
  const tocEntries = buildTocEntries(stages, finalQuestions);
  const pages = [titlePage(book), navPage(tocEntries), introPage(book, stages, values)];
  const jumpPages = [];
  let gotWords = 0;

  stages.forEach((stage, stageIndex) => {
    pages.push(stageIntroPage(stage));
    for (const w of stage.words) pages.push(wordPage(w, totalWords));
    gotWords += stage.words.length;

    const bossId = `${stage.key}-boss`;
    const resultId = `${stage.key}-result`;
    const label = `BOSS　｜　STAGE ${stage.number}`;
    pages.push(bossIntroPage({ id: bossId, heading: "BOSS BATTLE", title: `STAGE ${stage.number} のボスがあらわれた！`, questions: stage.questions, book }));
    stage.questions.forEach((q, i) => {
      pages.push(questionPage(q, label));
      const next = stage.questions[i + 1];
      jumpPages.push(...judgePages(q, next ? next.id : resultId, next ? `▶ 次の問題へ（Q${next.number}）` : "▶ 答え合わせ・ランク判定へ", book));
    });

    const nextStage = stages[stageIndex + 1];
    let nextId;
    let nextLabel;
    if (nextStage) {
      nextId = nextStage.key;
      nextLabel = `▶ STAGE ${nextStage.number} へ`;
    } else if (finalQuestions.length > 0) {
      nextId = "final-boss";
      nextLabel = "▶ ラスボス戦へ";
    } else {
      nextId = "all-clear";
      nextLabel = "▶ ゴールへ";
    }
    pages.push(resultPage({ id: resultId, heading: `STAGE ${stage.number}`, questions: stage.questions, gotWords, totalWords, nextId, nextLabel, retryId: bossId, book }));
  });

  if (finalQuestions.length > 0) {
    pages.push(bossIntroPage({ id: "final-boss", heading: "LAST BOSS", title: "ラスボスがあらわれた！（全ステージから出題）", questions: finalQuestions, book }));
    finalQuestions.forEach((q, i) => {
      pages.push(questionPage(q, "LAST BOSS"));
      const next = finalQuestions[i + 1];
      jumpPages.push(...judgePages(q, next ? next.id : "final-result", next ? `▶ 次の問題へ（Q${next.number}）` : "▶ 答え合わせ・ランク判定へ", book));
    });
    pages.push(resultPage({ id: "final-result", heading: "LAST BOSS", questions: finalQuestions, gotWords, totalWords, nextId: "all-clear", nextLabel: "▶ ゴールへ", retryId: "final-boss", book }));
  }

  pages.push(allClearPage(book, values), wordIndexPage(words), colophonPage(book), jumpZonePage(), ...jumpPages);
  return { pages, tocEntries };
}

// ---------------------------------------------------------------------------
// EPUB の部品（XHTML・OPF・NCX）
// ---------------------------------------------------------------------------

function xhtmlDocument(page) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head>
<meta charset="UTF-8"/>
<title>${esc(page.title)}</title>
<link rel="stylesheet" type="text/css" href="../style/book.css"/>
</head>
<body>
${page.html}
</body>
</html>
`;
}

function contentOpf(book, pages, cover) {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const kdp = book.kdp;
  const manifest = pages.map((p) => {
    const props = p.id === "nav" ? ' properties="nav"' : "";
    return `    <item id="${p.id}" href="text/${p.id}.xhtml" media-type="application/xhtml+xml"${props}/>`;
  });
  manifest.push('    <item id="css" href="style/book.css" media-type="text/css"/>');
  manifest.push('    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
  if (cover) manifest.push(`    <item id="cover-image" href="image/cover.${cover.ext}" media-type="${cover.mediaType}" properties="cover-image"/>`);
  const spine = pages.map((p) => `    <itemref idref="${p.id}"/>`);
  const subjects = (kdp.keywords || []).map((k) => `    <dc:subject>${esc(k)}</dc:subject>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="ja">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${esc(book.identifier)}</dc:identifier>
    <dc:title id="title">${esc(book.title)}</dc:title>
${kdp.titleKana ? `    <meta refines="#title" property="file-as">${esc(kdp.titleKana)}</meta>\n` : ""}    <dc:creator id="creator">${esc(book.author)}</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
${kdp.authorKana ? `    <meta refines="#creator" property="file-as">${esc(kdp.authorKana)}</meta>\n` : ""}    <dc:language>ja</dc:language>
    <dc:publisher>${esc(book.publisher || book.author)}</dc:publisher>
${book.publishDate ? `    <dc:date>${esc(book.publishDate)}</dc:date>\n` : ""}${kdp.description ? `    <dc:description>${esc(kdp.description)}</dc:description>\n` : ""}${subjects.length ? `${subjects.join("\n")}\n` : ""}    <meta property="dcterms:modified">${modified}</meta>
${cover ? '    <meta name="cover" content="cover-image"/>\n' : ""}    <meta name="primary-writing-mode" content="horizontal-lr"/>
  </metadata>
  <manifest>
${manifest.join("\n")}
  </manifest>
  <spine toc="ncx" page-progression-direction="ltr">
${spine.join("\n")}
  </spine>
</package>
`;
}

function tocNcx(book, tocEntries) {
  let playOrder = 0;
  const renderPoints = (entries, indent) =>
    entries
      .map((e) => {
        // 子の項目より先に自分の番号を確定させる（読む順に 1, 2, 3 … と連番にする）
        playOrder += 1;
        const order = playOrder;
        const children = e.children ? `\n${renderPoints(e.children, `${indent}  `)}` : "";
        return `${indent}<navPoint id="np-${e.id}" playOrder="${order}">
${indent}  <navLabel><text>${esc(e.label)}</text></navLabel>
${indent}  <content src="text/${e.id}.xhtml"/>${children}
${indent}</navPoint>`;
      })
      .join("\n");
  const depth = tocEntries.some((e) => e.children) ? 2 : 1;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ja">
  <head>
    <meta name="dtb:uid" content="${esc(book.identifier)}"/>
    <meta name="dtb:depth" content="${depth}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(book.title)}</text></docTitle>
  <navMap>
${renderPoints(tocEntries, "    ")}
  </navMap>
</ncx>
`;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

// ---------------------------------------------------------------------------
// ZIP（EPUB の中身は ZIP 形式。外部ライブラリなしで書き出す）
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * entries: [{ name, data, store }] を ZIP にする。
 * EPUBのルールで、先頭の mimetype は「無圧縮・追加情報なし」で入れる必要がある（store: true）。
 */
function createZip(entries) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const method = entry.store ? 0 : 8;
    const body = entry.store ? data : zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // ローカルファイルヘッダー
    local.writeUInt16LE(20, 4); // 展開に必要なバージョン
    local.writeUInt16LE(0, 6); // フラグ
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // 追加情報なし
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // セントラルディレクトリ
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // 30〜41バイト目は0のまま（コメント・属性なし）
    centralParts.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 終端レコード
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

// ---------------------------------------------------------------------------
// 確認用ファイル（preview.html / kdp-listing.txt）
// ---------------------------------------------------------------------------

const PREVIEW_CSS = `
body { background: #e9e6df; color: #1d1d1d; margin: 0; padding: 16px; font-family: sans-serif; }
.pv-head { max-width: 960px; margin: 0 auto 16px; background: #fff; padding: 12px 16px; border-radius: 8px; }
.pv-head h1 { font-size: 1.2em; margin: 0 0 6px; }
.pv-head p { margin: 4px 0; font-size: 0.9em; }
.pv-grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
.pv-page { width: 360px; max-width: 100%; }
.pv-label { font-size: 0.72em; color: #555; margin: 0 0 4px; font-family: monospace; }
.pv-screen { background: #fff; border-radius: 12px; min-height: 560px; padding: 12px 8px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.pv-screen:target, .pv-page:target .pv-screen { outline: 3px solid #e0a100; }
.pv-cover img { width: 100%; border-radius: 8px; }
`;

function previewHtml(book, pages, cover, summaryLines, bookCss) {
  // ページ間リンク（xxx.xhtml）をプレビュー内のアンカー（#pg-xxx）に置き換える
  const rewrite = (html) => html.replace(/href="([A-Za-z0-9-]+)\.xhtml(#[^"]*)?"/g, 'href="#pg-$1"');
  const coverHtml = cover
    ? `<section class="pv-page pv-cover"><p class="pv-label">表紙（${esc(cover.name)}）</p><img src="data:${cover.mediaType};base64,${cover.data.toString("base64")}" alt="表紙"></section>`
    : "";
  const sections = pages
    .map(
      (p, i) =>
        `<section class="pv-page" id="pg-${p.id}"><p class="pv-label">${i + 1}. ${esc(p.title)}（${p.id}.xhtml）</p><div class="pv-screen">${rewrite(p.html)}</div></section>`
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(book.title)} プレビュー</title>
<style>${bookCss}${PREVIEW_CSS}</style>
</head>
<body>
<div class="pv-head">
<h1>${esc(book.title)}　プレビュー（確認用）</h1>
${summaryLines.map((line) => `<p>${esc(line)}</p>`).join("\n")}
<p>※ これは確認用の簡易表示です。実際のKindleでの見え方は Kindle Previewer で確認してください。選択肢やボタンはクリックでジャンプできます。</p>
</div>
<div class="pv-grid">
${coverHtml}
${sections}
</div>
</body>
</html>
`;
}

function kdpListing(book, epubName, cover, stats) {
  const kdp = book.kdp;
  const lines = [
    "【KDP 入力用メモ】（build.js が自動生成。KDPの画面に合わせて入力してください）",
    "",
    "■ 言語: 日本語",
    `■ 本のタイトル: ${book.title}`,
    `   フリガナ: ${kdp.titleKana || "（book.json の kdp.titleKana に記入）"}`,
    `   ローマ字: ${kdp.titleRomaji || "（book.json の kdp.titleRomaji に記入）"}`,
    `■ サブタイトル: ${book.subtitle || ""}`,
    `■ 著者: ${book.author}`,
    `   フリガナ: ${kdp.authorKana || "（book.json の kdp.authorKana に記入）"}`,
    `   ローマ字: ${kdp.authorRomaji || "（book.json の kdp.authorRomaji に記入）"}`,
    "",
    "■ 内容紹介:",
    kdp.description || "（book.json の kdp.description に記入）",
    "",
    "■ キーワード（最大7つ）:",
    ...(kdp.keywords || []).slice(0, 7).map((k, i) => `   ${i + 1}. ${k}`),
    "",
    "■ カテゴリー（候補）:",
    ...(kdp.categories || []).map((c) => `   - ${c}`),
    "",
    `■ 原稿ファイル: dist/${epubName}`,
    `■ 表紙ファイル: ${cover ? `dist/cover.${cover.ext}` : "（なし。KDPの表紙作成ツールか、自作の画像を用意）"}`,
    "",
    "■ 内容の概要（確認用）:",
    `   単語 ${stats.words}語 / ${stats.stages}ステージ / ボス戦 ${stats.stageQuestions}問 / ラスボス ${stats.finalQuestions}問 / 全${stats.pages}ページ`,
    "",
    "■ AI生成コンテンツの申告:",
    "   サンプルの単語データ・表紙（AIが作成）をそのまま、または手直しして使う場合は「はい」と申告してください。",
    "   すべて自分で書き直した場合は「いいえ」で構いません。",
  ];
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

function main() {
  const book = loadBook();
  const words = loadWords();
  validateWords(words);
  const stages = groupStages(words, book);
  const avoidMap = buildAvoidMap(book, words);
  const finalQuestions = buildQuizzes(stages, words, book, avoidMap);
  for (const s of stages) verifyQuestions(s.questions, `STAGE ${s.number}`);
  verifyQuestions(finalQuestions, "ラスボス");

  const cssPath = path.join(BOOK_DIR, "book.css");
  const fallbackCss = path.join(__dirname, "book.css");
  const bookCss = fs.readFileSync(fs.existsSync(cssPath) ? cssPath : fallbackCss, "utf8");
  const cover = loadCover();
  const { pages, tocEntries } = buildPages(book, stages, words, finalQuestions);

  // EPUB を組み立てる
  const entries = [
    { name: "mimetype", data: "application/epub+zip", store: true },
    { name: "META-INF/container.xml", data: CONTAINER_XML },
    { name: "OEBPS/content.opf", data: contentOpf(book, pages, cover) },
    { name: "OEBPS/toc.ncx", data: tocNcx(book, tocEntries) },
    { name: "OEBPS/style/book.css", data: bookCss },
  ];
  if (cover) entries.push({ name: `OEBPS/image/cover.${cover.ext}`, data: cover.data });
  for (const page of pages) entries.push({ name: `OEBPS/text/${page.id}.xhtml`, data: xhtmlDocument(page) });

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const epubName = `${book.fileName}.epub`;
  const epub = createZip(entries);
  fs.writeFileSync(path.join(DIST_DIR, epubName), epub);
  if (cover) fs.writeFileSync(path.join(DIST_DIR, `cover.${cover.ext}`), cover.data);

  const stageQuestions = stages.reduce((n, s) => n + s.questions.length, 0);
  const stats = { words: words.length, stages: stages.length, stageQuestions, finalQuestions: finalQuestions.length, pages: pages.length };
  const choiceCount = book.quiz.choices;
  const distribution = stages.map((s) => `STAGE ${s.number}: ${answerDistribution(s.questions, choiceCount)}`);
  if (finalQuestions.length > 0) distribution.push(`ラスボス: ${answerDistribution(finalQuestions, choiceCount)}`);
  const summaryLines = [
    `単語 ${stats.words}語 ／ ${stats.stages}ステージ ／ ボス戦 ${stageQuestions}問 ／ ラスボス ${finalQuestions.length}問 ／ 全${pages.length}ページ`,
    `正解の位置（偏りチェック）: ${distribution.join("　")}`,
  ];
  fs.writeFileSync(path.join(DIST_DIR, "preview.html"), previewHtml(book, pages, cover, summaryLines, bookCss), "utf8");
  fs.writeFileSync(path.join(DIST_DIR, "kdp-listing.txt"), kdpListing(book, epubName, cover, stats), "utf8");

  console.log(`「${book.title}」を生成しました。`);
  console.log(`  ${summaryLines[0]}`);
  console.log("  正解の位置（偏りチェック）:");
  for (const line of distribution) console.log(`    ${line}`);
  console.log(`  生成: ${path.relative(process.cwd(), path.join(DIST_DIR, epubName))}（${Math.round(epub.length / 1024)} KB）`);
  if (cover) console.log(`  生成: ${path.relative(process.cwd(), path.join(DIST_DIR, `cover.${cover.ext}`))}`);
  console.log(`  生成: ${path.relative(process.cwd(), path.join(DIST_DIR, "preview.html"))}`);
  console.log(`  生成: ${path.relative(process.cwd(), path.join(DIST_DIR, "kdp-listing.txt"))}`);
  if (warnings.length > 0) {
    console.log(`\n注意（${warnings.length}件）:`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main();
