'use strict';
/*
 * 定期考査スタジオ — フロントエンド
 * 外部ライブラリ・CDNは使わない（校内のオフラインPCでも動かすため）。
 * 作問ルール（創作禁止・出典必須・別解対策・1枠1語）は skills/ と同じものを画面で強制する。
 */

// ================================================================ 小道具

const $ = (sel, root = document) => root.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 要素を作る。文字列の子はテキストとして入れる（教材由来の文字列でHTMLが壊れないように） */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** 子要素を入れ替える（null・false は無視。replaceChildren に null を渡すと「null」と表示されるため） */
function setChildren(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
}

const ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  sparkles: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
  back: '<polyline points="15 18 9 12 15 6"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M15 8l2 2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  underline: '<path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  logo: '<path d="M7 7h10M7 12h10M7 17h6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  redo: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  command: '<path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
};

function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

// この画面（タブ）の識別子。同じ試験を2つの画面で開いたときの上書き事故を防ぐ
const CLIENT_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function api(method, path, body) {
  const isAI = path.startsWith('ai/');
  const ctl = isAI ? new AbortController() : null;
  if (isAI && typeof aiBusyStart === 'function') aiBusyStart(path, ctl);
  let res;
  try {
    res = await fetch('/api/' + path, {
      method, signal: ctl?.signal,
      headers: { 'Content-Type': 'application/json', 'X-Exam-Studio': '1', 'X-Client-Id': CLIENT_ID },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (isAI && typeof aiBusyEnd === 'function') aiBusyEnd();
    if (e.name === 'AbortError') { const err = new Error('中止しました'); err.aborted = true; throw err; }
    const err = new Error('ツールのサーバーに接続できません。黒い画面（起動ウィンドウ）が開いたままか確認してください');
    err.offline = true;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch { /* 本文なし */ }
  if (isAI && typeof aiBusyEnd === 'function') aiBusyEnd();
  if (!res.ok) {
    const err = new Error(data.error || `エラーが発生しました（${res.status}）`);
    err.status = res.status; err.data = data;
    throw err;
  }
  if (isAI && typeof refreshUsage === 'function') setTimeout(refreshUsage, 0);  // 使用量の表示を更新
  return data;
}

function toast(msg, kind = 'info', action) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const el = h('div', { class: `toast ${kind}` }, h('span', {}, msg),
    action ? h('button', { class: 'toast-act', onclick: () => { el.remove(); action.fn(); } }, action.label) : null);
  box.append(el);
  while (box.children.length > 2) box.firstChild.remove();  // 画面をふさがないよう最大2つ
  const life = kind === 'error' ? 7000 : action ? 4500 : 2800;
  setTimeout(() => el.classList.add('out'), life);
  setTimeout(() => el.remove(), life + 400);
}

let modalStack = [];
function openModal({ title, body, actions = [], size = '', onClose }) {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    modalStack = modalStack.filter(m => m !== close);
    onClose && onClose();
  };
  const dlg = h('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title),
      h('button', { class: 'icon-btn', title: '閉じる（Esc）', onclick: close }, icon('x', 18))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions.filter(Boolean).map(a =>
      h('button', { class: `btn ${a.kind || 'ghost'}`, onclick: () => a.fn(close), disabled: a.disabled },
        a.icon ? icon(a.icon) : null, a.label))) : null);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  overlay.append(dlg);
  document.body.append(overlay);
  modalStack.push(close);
  setTimeout(() => {  // すでにダイアログ内の欄を触っていればフォーカスを奪わない
    if (!dlg.contains(document.activeElement)) dlg.querySelector('[data-autofocus], .modal-body input, .modal-body textarea')?.focus();
  }, 40);
  return close;
}

function confirmBox(message, { ok = 'OK', danger = false } = {}) {
  return new Promise(resolve => {
    let yes = false;
    openModal({
      title: '確認', body: h('p', { class: 'confirm-msg' }, message),
      actions: [
        { label: 'キャンセル', fn: c => c() },
        { label: ok, kind: danger ? 'danger' : 'primary', fn: c => { yes = true; c(); } },
      ],
      onClose: () => resolve(yes),
    });
  });
}

async function copyText(text, done = 'コピーしました') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  toast(done, 'ok');
}

const toInt = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

// フォーム部品
function field(label, control, cls = '') {
  return h('label', { class: `fld ${cls}` }, h('span', {}, label), control);
}
function input({ value = '', oninput, type = 'text', cls = 'inp', ...rest } = {}) {
  return h('input', { class: cls, type, value, ...rest, oninput: oninput ? e => oninput(e.target.value) : null });
}
function textarea({ value = '', oninput, cls = 'inp', rows = 2, ...rest } = {}) {
  const t = h('textarea', { class: cls, rows, ...rest, oninput: oninput ? e => oninput(e.target.value) : null });
  t.value = value;
  return t;
}
function select(options, value, onchange, cls = 'inp') {
  return h('select', { class: cls, onchange: e => onchange(e.target.value) },
    options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
}
/** 分類つきの選択欄 groups = [[分類名, [[値, 表示], ...]], ...] */
function groupedSelect(groups, value, onchange, cls = 'inp') {
  return h('select', { class: cls, onchange: e => onchange(e.target.value) },
    groups.map(([g, opts]) => h('optgroup', { label: g },
      opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)))));
}
/** 切り替えボタン（どれか1つを選ぶ） */
function segmented(options, value, onchange) {
  const box = h('div', { class: 'seg' });
  const draw = cur => box.replaceChildren(...options.map(([v, l, sub]) => h('button', {
    class: 'seg-btn' + (cur === v ? ' on' : ''), type: 'button',
    onclick: () => { onchange(v); draw(v); },
  }, l, sub ? h('small', {}, sub) : null)));
  draw(value);
  return box;
}
function iconBtn(name, title, onclick, { disabled = false, danger = false } = {}) {
  return h('button', { class: 'icon-btn' + (danger ? ' danger' : ''), title, 'aria-label': title, onclick, disabled }, icon(name));
}
function emptyState(ic, title, text, actions = []) {
  return h('div', { class: 'empty' }, icon(ic, 34), h('b', {}, title), text ? h('p', {}, text) : null,
    actions.length ? h('div', { class: 'row' }, actions) : null);
}
function stepHead(title, desc, actions) {
  return h('div', { class: 'step-head' },
    h('div', {}, h('h2', {}, title), desc ? h('p', {}, desc) : null),
    actions ? h('div', { class: 'row' }, actions) : null);
}
/** 「__語句__」を下線付きで表示する */
function rich(line) {
  const frag = document.createDocumentFragment();
  line.split(/(__.+?__)/g).forEach(part => {
    if (/^__.+__$/.test(part)) frag.append(h('u', {}, part.slice(2, -2)));
    else if (part) frag.append(part);
  });
  return frag;
}

// ================================================================ 定数

// 大問の形式。画面では分類ごとにまとめて表示する（実物の定期考査・英単語テストの形式）
const TYPE_GROUPS = [
  ['おまかせ', [['auto', 'おまかせ（AIに注文した内容に合わせる）']]],
  ['語彙・文法', [
    ['fill_blank', '空所補充'],
    ['choice_4', '選択問題（語句・英文を選ぶ）'],
    ['word_form', '語形変化'],
    ['reorder_2nd_5th', '並び替え'],
    ['error_correction', '誤文訂正（記号＋正しい形）'],
    ['paraphrase', '同意文の空所補充'],
    ['rewrite', '英文の書き換え（【　】の指示）'],
    ['pattern', '同じ文型・用法の選択'],
    ['accent', 'アクセント'],
  ]],
  ['読解', [
    ['reading_misfit', '読解（不要文・空所）'],
    ['content_match', '内容一致'],
    ['synonym', '同意語選択'],
    ['insertion', '語句挿入位置'],
    ['referent', '指示語の内容'],
    ['table_fill', '表の穴埋め（本文の要約）'],
    ['underline_grammar', '下線部（文法・書き換え）'],
    ['translation', '和訳・英文解釈'],
  ]],
  ['リスニング・表現', [
    ['listening', 'リスニング（聞き取って書く）'],
    ['listening_choice', 'リスニング（応答を選ぶ）'],
    ['qa', '英問英答'],
    ['writing', '英作文'],
  ]],
  ['英単語テスト', [
    ['listen_meaning', '放送された単語の意味（4択）'],
    ['definition', '英英定義（語群から選ぶ）'],
    ['vocab_meaning', '英単語 → 意味（4択）'],
    ['vocab_word', '意味 → 英単語（4択）'],
    ['vocab_context', '例文の空所（4択）'],
    ['vocab_spelling', '例文の空所（綴りを書く）'],
  ]],
  ['その他', [['other', 'その他']]],
];
const SECTION_TYPES = TYPE_GROUPS.flatMap(([, list]) => list);
const TYPE_LABEL = Object.fromEntries(SECTION_TYPES);
const SHORT = {
  auto: 'おまかせ', synonym: '同意語', fill_blank: '空所補充', choice_4: '選択', word_form: '語形変化', reorder_2nd_5th: '並び替え',
  error_correction: '誤文訂正', paraphrase: '同意文', rewrite: '書き換え', pattern: '文型・用法', accent: 'アクセント',
  reading_misfit: '読解', content_match: '内容一致', insertion: '語句挿入', referent: '指示語', table_fill: '表の穴埋め',
  underline_grammar: '下線部', translation: '和訳', listening: 'リスニング', listening_choice: 'リスニング選択',
  qa: '英問英答', writing: '英作文', listen_meaning: '単語リスニング', definition: '英英定義',
  vocab_meaning: '英→日', vocab_word: '日→英', vocab_context: '例文4択', vocab_spelling: '綴り', other: 'その他',
};
const DEFAULT_POINTS = {
  auto: 2, synonym: 2, fill_blank: 1, choice_4: 1, word_form: 1, reorder_2nd_5th: 2, error_correction: 2, paraphrase: 2, rewrite: 2,
  pattern: 1, accent: 1, reading_misfit: 2, content_match: 2, insertion: 2, referent: 3, table_fill: 2, underline_grammar: 2,
  translation: 4, listening: 1, listening_choice: 1, qa: 2, writing: 3, listen_meaning: 1, definition: 1,
  vocab_meaning: 1, vocab_word: 1, vocab_context: 1, vocab_spelling: 1, other: 1,
};
const DEFAULT_INSTR = {
  fill_blank: '日本文の意味になるように英文の空所に適語を入れなさい。空欄にアルファベットがあるものは、それではじまる単語を答えること。',
  choice_4: '（　）に入る最も適切なものを選び、記号で答えなさい。',
  synonym: '下線部の語句に最も近い意味のものを選び、記号で答えなさい。',
  auto: '',
  word_form: '（　）内の語を適切な形に直しなさい。',
  reorder_2nd_5th: '日本語の意味を表す英文になるように（　）内の語句を並べ替え，（　）内で２番目と５番目に来る語句を答えなさい。なお，複数の単語からなる選択肢も一つの語句として数える。また，文頭に来る語も１文字目は小文字になっている。',
  error_correction: '次の各英文について、誤った表現を含んだ部分がそれぞれ１つある。その箇所をア～ウから選び、その記号と正しい形を答えなさい。',
  paraphrase: '各組の英文がほぼ同じ意味を表すように、空所に入る語を前から順に答えなさい。',
  rewrite: '次の英文を【　】内の指示に従って書き換えなさい。',
  pattern: '次の英文と同じ文型（用法）の英文を、ア～オから１つずつ選び、記号で答えなさい。',
  accent: '各語の最も強く読む箇所の記号を答えなさい。',
  reading_misfit: 'Read the following text and answer the questions.',
  content_match: '以下の英文を読み、各問いに答えなさい。番号で答えなさい。',
  insertion: 'この英文中には下の語句が抜けている。本来入るべき場所を指摘しなさい。解答欄には，それぞれの語句が入る場所の前後の単語を書きなさい。',
  referent: '下線部の指す内容を日本語で具体的に説明しなさい。',
  table_fill: '本文の内容に合うように、表の空所に入る語句を書きなさい。なお、解答は２語以上となる場合もある。',
  underline_grammar: '下線部について、各問いに答えなさい。',
  translation: '下線部を日本語に訳しなさい。',
  listening: '放送を聞いて英文の空欄に聞き取った語を補いなさい。英語は２回放送されます。',
  listening_choice: '対話を聞き、最後の文に対する応答として最も適切なものを選び、番号で答えなさい。',
  qa: '直後に流れる質問に対し、英語で答えなさい。',
  writing: '日本語の意味を表す英文を書きなさい。',
  listen_meaning: '放送される英単語の意味に当たるものを次の中から選び、記号を答えなさい。英単語は2回ずつ流れます。',
  definition: '次の英文が定義する英単語を下の選択肢より選び、記号で答えなさい。',
  vocab_meaning: '次の英単語の訳として最も適切なものを選び、記号を答えなさい。',
  vocab_word: '次の日本語に合う英単語として最も適切なものを選び、記号を答えなさい。',
  vocab_context: '日本語の意味に合うよう（　　）に最も適切な語を選び、記号を答えなさい。',
  vocab_spelling: '空所に入る適切な英語を１語ずつ記しなさい。ただし、指定がある場合、与えられた文字から始めること。時制や主語、単複等による語形変化にも気をつけること。',
  other: '',
};
// 大問の形式ごとの選択肢の記号（実物に合わせた初期値）
const DEFAULT_STYLE = {
  synonym: 'ア', choice_4: 'ア', error_correction: 'ア', pattern: 'ア', accent: 'ア', definition: '1', content_match: '1',
  reading_misfit: '1', listening_choice: '1', listen_meaning: '1', vocab_meaning: '1', vocab_word: '1', vocab_context: '1',
};
const VOCAB_TYPES = new Set(['listen_meaning', 'definition', 'vocab_meaning', 'vocab_word', 'vocab_context', 'vocab_spelling']);
// 放送文を入れる形式
const SCRIPT_TYPES = new Set(['listening', 'listening_choice', 'qa', 'listen_meaning']);
// 大問の形式 → クイック作問の初期形式
const QUICK_FOR = {
  fill_blank: 'fill_blank', reorder_2nd_5th: 'reorder_2nd_5th', choice_4: 'choice_4', word_form: 'word_form',
  underline_grammar: 'underline_grammar', translation: 'translation', error_correction: 'error_correction', referent: 'underline_grammar',
  vocab_context: 'choice_4', vocab_spelling: 'fill_blank', content_match: 'content_match', synonym: 'choice_4', listening: 'fill_blank', paraphrase: 'fill_blank',
};
const QUICK_FORMATS = [
  ['fill_blank', '空所補充', 'type'],
  ['reorder_2nd_5th', '並び替え', 'shuffle'],
  ['choice_4', '4択', 'list'],
  ['content_match', '内容一致', 'check'],
  ['error_correction', '誤文訂正', 'alert'],
  ['word_form', '語形変化', 'edit'],
  ['underline_grammar', '下線部', 'underline'],
  ['translation', '和訳', 'globe'],
  ['ai', 'AIに依頼', 'sparkles'],
];
const AI_FORMATS = [
  ['fill_blank', '空所補充'], ['reorder_2nd_5th', '並び替え（2番目・5番目）'], ['reorder_4th_8th', '並び替え（4番目・8番目）'],
  ['choice_4', '4択'], ['error_correction', '誤文訂正'], ['word_form', '語形変化'], ['paraphrase', '同意文の空所補充'],
  ['underline_grammar', '下線部'], ['translation', '和訳'], ['vocab_context', '例文の空所（4択）'], ['vocab_spelling', '例文の空所（綴り）'],
];
const CHECKLIST = [
  ['solved', '全問を自分で解き直した（模範解答と一致した）'],
  ['text', '本文・例文を一語も改変していない'],
  ['alt', '別解がないことを確認した（特に並び替え・空所補充）'],
  ['slots', '解答用紙の枠の数と、解答の語数が一致している'],
  ['sources', '出典一覧を保存した（「この問題どこから？」に答えられる）'],
  ['leak', '模範解答を生徒が見られる場所に置いていない'],
];
// 位置の自由度が高く、並び替えの別解の原因になりやすい副詞
const FREE_ADVERBS = new Set(['often', 'always', 'usually', 'sometimes', 'never', 'once', 'today', 'tomorrow', 'yesterday',
  'now', 'then', 'also', 'only', 'just', 'even', 'still', 'already', 'really', 'regularly', 'here', 'there', 'soon', 'again', 'finally']);

// ================================================================ 状態

const S = {
  status: { ai: false },
  projects: null,
  project: null,
  step: 'setup',
  materialId: null,
  materialText: {},
  secIdx: 0,
  secOpen: false,         // 大問の設定欄を開いているか
  matSel: {},             // 大問ごとに表示中の素材 {sid: materialId}
  openQ: new Set(),       // 編集欄を開いている問題
  issues: null,
  checking: false,
  verify: null,           // {done, total}
  highlight: null,        // 作問画面で強調する問題 {si, qi}
  exportFiles: null,
  exportIssues: null,
  previewTab: 'exam',
  saveState: 'saved',
  config: { categories: ['定期考査', '英単語テスト', '小テスト', 'その他'] },
  userTemplates: [],
  homeTab: 'exams',       // ホームのタブ（exams / templates）
  filterCat: 'all',       // ホームのカテゴリー絞り込み
  search: '',
  layoutOpen: false,      // 試験の設定で「用紙の体裁」を開いているか
  secDetail: new Set(),   // 詳細設定を開いている大問（sid）
};

// ================================================================ 保存

let saveTimer = null, saving = false, pendingSave = false;

function renumber() {
  applyLabels(S.project.sections);  // 大問番号・問番号・「大問2 問1」の呼び名
  S.project.sections.forEach(s => { s.questions.forEach((q, j) => { q.number = j + 1; }); });
}

function markDirty() {
  if (!S.project) return;
  S.saveState = 'dirty';
  renderSaveState();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
  clearTimeout(UNDO.timer);
  UNDO.timer = setTimeout(checkpoint, 700);  // 入力が止まったら「元に戻す」の区切りを作る
  refreshLive();
}

let retryTimer = null, retryCount = 0;

async function saveNow(force = false) {
  clearTimeout(saveTimer);
  const p = S.project;
  if (!p) return;
  if (S.conflict) return;  // 競合の解決待ち
  if (saving) { pendingSave = true; return; }
  saving = true;
  S.saveState = 'saving';
  renderSaveState();
  try {
    const r = await api('PUT', `projects/${p.id}`, { exam: p.exam, sections: p.sections, checklist: p.checklist || {}, rev: p.rev, force });
    p.rev = r.project.rev;
    if (S.saveState === 'saving') S.saveState = 'saved';
    retryCount = 0; clearTimeout(retryTimer);
    draftClear(p.id);
  } catch (e) {
    S.saveState = 'error';
    draftKeep(p);  // 保存できなかった内容はブラウザ内に退避（次に開いたとき復元できる）
    if (e.status === 409) { saving = false; renderSaveState(); return conflictDialog(e.data); }
    if (e.offline || !e.status || e.status >= 500) {
      // 一時的なエラーは自動で再試行（3秒・6秒・12秒…最大1分おき）
      const wait = Math.min(60, 3 * 2 ** retryCount++);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => saveNow(), wait * 1000);
      if (retryCount === 1) toast(`保存できませんでした。${wait}秒後に自動でやり直します（内容はこの画面に残っています）`, 'error');
    } else toast('保存に失敗しました: ' + e.message, 'error');
  }
  saving = false;
  renderSaveState();
  if (pendingSave) { pendingSave = false; await saveNow(); }
}

// ---- 緊急下書き（保存できなかったときだけ、ブラウザ内に残す）
const DRAFT_KEY = id => `examstudio:draft:${id}`;
function draftKeep(p) {
  try { localStorage.setItem(DRAFT_KEY(p.id), JSON.stringify({ at: new Date().toLocaleString('ja-JP'), exam: p.exam, sections: p.sections })); } catch { /* 容量不足など */ }
}
function draftClear(id) { try { localStorage.removeItem(DRAFT_KEY(id)); } catch { /* 無視 */ } }
function draftOffer(p) {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DRAFT_KEY(p.id)) || 'null'); } catch { d = null; }
  if (!d || !Array.isArray(d.sections)) return;
  // 閉じる直前に退避した内容が、実は保存できていた場合は聞かずに消す
  const digest = x => JSON.stringify([x.exam?.title, x.exam?.written_points, (x.sections || []).map(s => [s.type, s.count, s.points_each, s.instructions, s.passage || '',
    s.questions.map(q => [q.body, q.answer, q.choices || null, q.source_ref])])]);
  if (digest(d) === digest(p)) return draftClear(p.id);
  openModal({
    title: '保存できなかった変更があります', size: 'md',
    body: h('div', { class: 'stack' },
      h('p', { style: { margin: 0 } }, `${d.at} の時点で、サーバーに保存できなかった変更がこのブラウザに残っています。`),
      h('p', { class: 'muted', style: { margin: 0 } }, '「復元する」で、その変更をこの試験に戻します（今の内容は版の履歴に残ります）。')),
    actions: [
      { label: '破棄する', fn: c => { draftClear(p.id); c(); } },
      { label: '復元する', kind: 'primary', fn: c => {
        p.exam = d.exam; p.sections = d.sections; applyLabels(p.sections);
        c(); renumber(); markDirty(); resetUndo(); render(); toast('保存できなかった変更を復元しました', 'ok');
      } },
    ],
  });
}

/** 別の画面（タブ・PC）で同じ試験が更新されていたとき */
function conflictDialog(info) {
  S.conflict = true;
  const p = S.project;
  openModal({
    title: '別の画面でこの試験が更新されています', size: 'md',
    body: h('div', { class: 'stack' },
      h('p', { style: { margin: 0 } }, `この試験は、ほかのタブまたは別の画面で更新されました（${info?.updated_at || ''}）。どちらの内容を残すか選んでください。`),
      h('div', { class: 'warn-box info' }, icon('clock', 14), 'どちらを選んでも、消える側の内容は「版の履歴」に残るので、あとから戻せます。')),
    actions: [
      { label: '向こうの内容を読み込む', fn: async c => {
        S.conflict = false; c(); S.saveState = 'saved'; draftClear(p.id);
        await openProject(p.id, S.step); toast('最新の内容を読み込みました', 'ok');
      } },
      { label: 'この画面の内容で上書き', kind: 'primary', fn: async c => {
        S.conflict = false; c(); await saveNow(true); toast('この画面の内容で保存しました', 'ok');
      } },
    ],
    onClose: () => { S.conflict = false; },
  });
}

// ---- 元に戻す・やり直す（入力が止まるごとに区切りを作り、最大100回分）
const UNDO = { stack: [], redo: [], snap: null, timer: null };
function projectState() { return JSON.stringify({ exam: S.project.exam, sections: S.project.sections }); }
function resetUndo() { UNDO.stack = []; UNDO.redo = []; UNDO.snap = S.project ? projectState() : null; refreshUndoButtons(); }
function checkpoint() {
  clearTimeout(UNDO.timer);
  if (!S.project) return;
  const cur = projectState();
  if (UNDO.snap != null && cur !== UNDO.snap) {
    UNDO.stack.push(UNDO.snap);
    if (UNDO.stack.length > 100) UNDO.stack.shift();
    UNDO.redo = [];
  }
  UNDO.snap = cur;
  refreshUndoButtons();
}
function applyState(json) {
  const st = JSON.parse(json);
  S.project.exam = st.exam; S.project.sections = st.sections;
  applyLabels(S.project.sections);
  UNDO.snap = json;
  S.openQ = new Set(); S.issues = null;
  if (S.secIdx >= S.project.sections.length) S.secIdx = Math.max(0, S.project.sections.length - 1);
  S.saveState = 'dirty'; clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400);
  render({ keepScroll: true });
  refreshUndoButtons();
}
function undo() {
  if (!S.project) return;
  checkpoint();
  if (!UNDO.stack.length) return toast('これ以上は元に戻せません（前の版は「履歴」から戻せます）');
  UNDO.redo.push(UNDO.snap);
  applyState(UNDO.stack.pop());
  toast('元に戻しました', 'info', { label: 'やり直す', fn: redo });
}
function redo() {
  if (!S.project) return;
  checkpoint();
  if (!UNDO.redo.length) return toast('やり直す操作はありません');
  UNDO.stack.push(UNDO.snap);
  applyState(UNDO.redo.pop());
  toast('やり直しました');
}
function refreshUndoButtons() {
  const u = $('#undo-btn'), r = $('#redo-btn');
  if (u) u.disabled = !UNDO.stack.length && UNDO.snap === (S.project ? projectState() : null);
  if (r) r.disabled = !UNDO.redo.length;
}

async function flushSave() {
  clearTimeout(saveTimer);
  while (saving) await sleep(60);
  if (S.project && S.saveState !== 'saved') await saveNow();
  while (saving) await sleep(60);
}

function renderSaveState() {
  const el = $('#save-state');
  if (!el) return;
  const map = {
    saved: ['check', '保存済み', ''], dirty: [null, '編集中…', ''],
    saving: [null, '保存中…', ''], error: ['alert', '保存失敗', 'error'],
  };
  const [ic, label, cls] = map[S.saveState];
  el.className = 'save-state ' + cls;
  el.replaceChildren(ic ? icon(ic, 14) : '', label);
}

window.addEventListener('beforeunload', e => {
  if (S.saveState === 'dirty' || S.saveState === 'saving' || S.saveState === 'error') {
    if (S.project) draftKeep(S.project);  // 閉じる直前の内容をブラウザ内に退避（保存が間に合わなくても消えない）
    saveNow(); e.preventDefault(); e.returnValue = '';
  }
});

// ================================================================ 画面の骨組み

function render({ keepScroll = false } = {}) {
  const scroller = $('.main-scroll');
  const top = keepScroll && scroller ? scroller.scrollTop : 0;
  $('#app').replaceChildren(S.project ? renderWorkspace() : renderHome());
  renderSaveState();
  const next = $('.main-scroll');
  if (next) next.scrollTop = top;
  if (S.highlight) {
    const { si, qi } = S.highlight;
    S.highlight = null;
    requestAnimationFrame(() => {
      const card = document.getElementById(`q-${si}-${qi}`);
      if (card) { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); card.classList.add('flash'); }
    });
  }
}

function stats() {
  const secs = S.project.sections;
  return {
    planned: secs.reduce((a, s) => a + plannedPoints(s), 0),
    count: secs.reduce((a, s) => a + s.count, 0),
    made: secs.reduce((a, s) => a + s.questions.length, 0),
  };
}

function refreshLive() {
  const m = $('#meter'); if (m) m.replaceWith(renderMeter());
  const n = $('#nav'); if (n) n.replaceWith(renderNav());
}

function statusChip() {
  const on = S.status.ai;
  return h('button', { class: 'status-chip', onclick: settingsDialog, title: 'AI機能の設定' },
    h('span', { class: 'dot' + (on ? ' on' : '') }), h('span', {}, on ? `AI 有効（${aiName()}）` : 'API抜きモード'));
}

function logo(sm = false) {
  return h('div', { class: 'logo' + (sm ? ' sm' : '') }, icon('logo', sm ? 18 : 24));
}

// ================================================================ ホーム

function renderHome() {
  const list = S.projects;
  const tabs = segmented([['exams', '試験', list ? `${list.length}` : ''], ['templates', 'テンプレート', `${allTemplates().length}`]],
    S.homeTab, v => { S.homeTab = v; render(); });
  const more = menuButton(h('span', { class: 'row-i' }, icon('download'), '取り込み・バックアップ'), [
    ['upload', '試験データ（JSON）を取り込む', importProject],
    ['download', 'バックアップを保存（全試験・テンプレート）', downloadBackup],
    ['upload', 'バックアップから復元', restoreBackup],
    ['edit', 'カテゴリーを編集', categoriesDialog],
  ]);
  return h('div', { class: 'home' },
    h('header', { class: 'home-hero' },
      h('div', { class: 'brand' }, logo(),
        h('div', {}, h('h1', {}, '定期考査スタジオ'), h('p', {}, '教材の文をクリックして、聞きたいところを、聞きたい形式で。'))),
      h('div', { class: 'hero-actions' },
        statusChip(), usageChip(),
        h('button', { class: 'btn ghost', onclick: helpDialog }, icon('help'), '使い方'),
        more,
        h('button', { class: 'btn primary', onclick: () => newProjectDialog() }, icon('plus'), '新しい試験'))),
    h('div', { class: 'home-bar' }, tabs,
      S.homeTab === 'exams' ? h('div', { class: 'search' }, icon('search', 14),
        h('input', { class: 'inp', type: 'search', value: S.search, placeholder: '試験名で探す', 'aria-label': '試験名で探す',
          oninput: e => { S.search = e.target.value; const g = $('#proj-grid'); if (g) g.replaceWith(projectGrid()); } })) : null),
    S.homeTab === 'templates' ? renderTemplatesView() :
      list == null ? h('div', { class: 'loading' }, '読み込み中…') :
        !list.length ? welcomeCard() : [categoryChips(), projectGrid()]);
}

/** カテゴリーで絞り込むチップ */
function categoryChips() {
  const list = S.projects || [];
  const cats = categoryList();
  if (S.filterCat !== 'all' && !cats.includes(S.filterCat)) S.filterCat = 'all';
  const chip = (v, label, n) => h('button', { class: 'cat-chip' + (S.filterCat === v ? ' on' : ''), onclick: () => { S.filterCat = v; render(); } },
    label, h('span', {}, n));
  return h('div', { class: 'cat-chips' },
    chip('all', 'すべて', list.length),
    cats.map(c => chip(c, c, list.filter(p => p.category === c).length)),
    h('button', { class: 'cat-chip edit', onclick: categoriesDialog, title: 'カテゴリーの追加・名前の変更・並べ替え' }, icon('edit', 13), '編集'));
}

function projectGrid() {
  const q = S.search.trim().toLowerCase();
  const list = (S.projects || []).filter(p => (S.filterCat === 'all' || p.category === S.filterCat)
    && (!q || (p.title || '').toLowerCase().includes(q)));
  const newCard = h('button', { class: 'proj new', onclick: () => newProjectDialog() },
    h('div', {}, icon('plus', 26), h('b', {}, S.filterCat === 'all' ? '新しい試験を作る' : `新しい${S.filterCat}を作る`)));
  return h('div', { class: 'proj-grid', id: 'proj-grid' }, newCard, list.map(projectCard),
    !list.length && (S.projects || []).length ? h('div', { class: 'muted no-hit' }, q ? `「${S.search}」に当てはまる試験はありません` : 'このカテゴリーの試験はまだありません') : null);
}

function projectCard(p) {
  const pct = p.count ? Math.min(100, Math.round(p.questions / p.count * 100)) : 0;
  const ptsOk = p.points === p.written_points;
  return h('div', { class: 'proj', role: 'button', tabindex: '0', onclick: () => openProject(p.id).catch(() => {}),
    onkeydown: e => { if (e.key === 'Enter') openProject(p.id).catch(() => {}); } },
    h('div', { class: 'proj-actions' },
      iconBtn('layers', 'カテゴリーを変更', e => { e.stopPropagation(); changeCategoryDialog(p); }),
      iconBtn('copy', '複製（前回の試験を土台にする）', e => { e.stopPropagation(); duplicateProject(p); }),
      iconBtn('trash', '削除', e => { e.stopPropagation(); deleteProject(p); }, { danger: true })),
    h('div', { class: 'proj-cat' }, h('span', { class: 'cat-tag c' + (categoryList().indexOf(p.category) % 6) }, p.category || '定期考査'),
      p.date ? h('span', { class: 'muted' }, p.date) : null),
    h('h3', {}, p.title || '（無題）'),
    h('div', { class: 'proj-meta' },
      h('span', { class: 'pill' }, `大問 ${p.sections}`),
      h('span', { class: 'pill' }, `素材 ${p.materials}`),
      h('span', { class: 'pill', style: ptsOk ? null : { color: 'var(--warn)' } }, `配点 ${p.points}/${p.written_points}点`)),
    h('div', { class: 'proj-bar' }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'proj-foot' }, h('span', {}, `作問 ${p.questions}/${p.count}問`), h('span', {}, `更新 ${p.updated_at}`)));
}

/** 小さなメニュー（「その他」ボタンなど） */
function menuButton(label, items) {
  const btn = h('button', { class: 'btn ghost', 'aria-haspopup': 'true' }, label);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    $('.menu')?.remove();
    const r = btn.getBoundingClientRect();
    const menu = h('div', { class: 'menu', role: 'menu', style: { top: r.bottom + 6 + 'px', right: Math.max(8, innerWidth - r.right) + 'px' } },
      items.map(([ic, text, fn]) => h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { menu.remove(); fn(); } }, icon(ic, 15), text)));
    document.body.append(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  });
  return btn;
}

async function changeCategoryDialog(p) {
  let cat = p.category;
  openModal({
    title: 'カテゴリーを変更', size: '',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted', style: { margin: 0 } }, p.title),
      field('カテゴリー', select(categoryList().map(c => [c, c]), cat, v => { cat = v; }))),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '変更する', kind: 'primary', fn: async c => {
        try {
          const full = (await api('GET', `projects/${p.id}`)).project;
          await api('PUT', `projects/${p.id}`, { exam: { ...full.exam, category: cat } });
          c(); await loadProjects(); render(); toast(`「${cat}」に移しました`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

async function loadProjects() {
  try { S.projects = (await api('GET', 'projects')).projects; }
  catch (e) { S.projects = []; toast(e.message, 'error'); }
}

function newSid() { return Array.from({ length: 8 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join(''); }

function newSection(type, count = 5) {
  return {
    sid: newSid(), no: 0, type, points_each: DEFAULT_POINTS[type] ?? 1, count, instructions: DEFAULT_INSTR[type] || '',
    source: '', choice_style: DEFAULT_STYLE[type] || '1', per_row: 0, bank: [], bank_style: '', scoring_note: '', questions: [],
  };
}

/** カテゴリーに合わせた試験名のひな型 */
function titleFor(cat) {
  const y = new Date().getFullYear();
  if (cat === '英単語テスト') return `${y}年度　　学年第　回英単語試験`;
  if (cat === '小テスト') return '単語小テスト　No.　';
  return `${y}年度　　学年　英語　　　学期　　試験`;
}

function newProjectDialog(init = {}) {
  const t0 = init.tpl ? findTemplate(init.tpl) : null;
  const cats = categoryList();
  const cat0 = t0?.category || (S.filterCat !== 'all' ? S.filterCat : cats[0] || '定期考査');
  const firstTpl = c => (allTemplates().find(t => t.category === c) || findTemplate('builtin:blank')).id;
  const st = { category: cat0, tpl: t0?.id || firstTpl(cat0), showAll: false, title: titleFor(cat0), titleTouched: false, date: '', points: 0 };
  st.points = examFromTemplate(findTemplate(st.tpl)).written_points;
  const titleInp = input({ value: st.title, 'data-autofocus': true, oninput: v => { st.title = v; st.titleTouched = true; } });
  const pts = input({ type: 'number', min: 0, value: st.points, oninput: v => { st.points = toInt(v, 0); } });
  const picker = templatePicker(st, t => { st.points = examFromTemplate(t).written_points; pts.value = st.points; });
  const catSel = select(cats.map(c => [c, c]), st.category, v => {
    st.category = v;
    st.tpl = firstTpl(v);
    st.points = examFromTemplate(findTemplate(st.tpl)).written_points; pts.value = st.points;
    if (!st.titleTouched) { st.title = titleFor(v); titleInp.value = st.title; }
    picker.redraw();
  });
  openModal({
    title: '新しい試験を作る', size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid-2' }, field('カテゴリー', catSel),
        field('実施日（任意）', input({ value: '', placeholder: '例: 2026.9.1（火）実施', oninput: v => { st.date = v; } }))),
      field('試験名', titleInp),
      h('div', { class: 'fld' }, h('span', {}, 'テンプレート（大問の構成・配点・体裁。あとから自由に変更できます）'), picker),
      field('満点（リスニングを含む筆記試験の合計。テンプレートに合わせて自動で入ります）', pts)),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '作成する', kind: 'primary', icon: 'plus', fn: async c => {
        const t = findTemplate(st.tpl) || findTemplate('builtin:blank');
        const sections = sectionsFromTemplate(t);
        const exam = { ...examFromTemplate(t), category: st.category, date: st.date.trim() };
        try {
          const r = await api('POST', 'projects', { title: st.title, written_points: st.points, sections, exam });
          c();
          await openProject(r.project.id, sections.length ? 'build' : 'setup');
          toast(`「${t.name}」から作成しました。大問ごとに素材を入れて作問します`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

function importProject() {
  const inp = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const r = await api('POST', 'projects/import', { data });
      toast(`「${r.project.exam.title}」を取り込みました`, 'ok');
      await openProject(r.project.id);
    } catch (e) { toast('取り込めませんでした: ' + e.message, 'error'); }
  });
  document.body.append(inp);
  inp.click();
  setTimeout(() => inp.remove(), 60000);
}

async function duplicateProject(p) {
  try {
    await api('POST', `projects/${p.id}/duplicate`);
    toast('複製しました。問題を差し替えて新しい試験に使えます', 'ok');
    await loadProjects(); render();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProject(p) {
  if (!await confirmBox(`「${p.title}」を削除しますか？\n（保存先の .trash フォルダに移動するので、あとから復元もできます）`, { ok: '削除する', danger: true })) return;
  try { await api('DELETE', `projects/${p.id}`); toast('削除しました', 'ok'); await loadProjects(); render(); }
  catch (e) { toast(e.message, 'error'); }
}

async function openProject(id, step) {
  try {
    const r = await api('GET', `projects/${id}`);
    const p = r.project;
    p.checklist ||= {};
    applyLabels(p.sections);
    S.project = p;
    S.step = STEP_ALIAS[step] || step || (p.sections.length ? 'build' : 'setup');
    S.matSel = {};
    S.openQ = new Set();
    S.materialId = p.materials[0]?.id || null;
    S.materialText = {};
    S.secIdx = 0;
    S.issues = null;
    S.exportFiles = null;
    S.saveState = 'saved';
    S.conflict = false;
    if (location.hash !== '#/p/' + id) history.pushState(null, '', '#/p/' + id);
    resetUndo();
    render();
    draftOffer(p);
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

async function goHome() {
  await flushSave();
  hideFab();
  S.project = null;
  if (location.hash) history.pushState(null, '', location.pathname);
  S.projects = null;
  render();
  await loadProjects();
  render();
}

// ================================================================ ワークスペース

function renderWorkspace() {
  return h('div', { class: 'ws' },
    h('aside', { class: 'side' },
      h('div', { class: 'side-brand' }, logo(true), h('b', {}, '定期考査スタジオ')),
      h('button', { class: 'back', onclick: goHome }, icon('back', 14), h('span', {}, '試験の一覧へ')),
      renderNav(),
      h('div', { class: 'side-foot' },
        statusChip(), usageChip(),
        h('button', { class: 'status-chip', onclick: helpDialog }, icon('help', 14), h('span', {}, '使い方・作問のルール')))),
    h('main', { class: 'main' },
      h('header', { class: 'topbar' },
        h('input', { id: 'title-input', class: 'title-input', value: S.project.exam.title, placeholder: '試験名', 'aria-label': '試験名',
          oninput: e => { S.project.exam.title = e.target.value; markDirty(); } }),
        h('div', { class: 'tb-group' },
          h('button', { id: 'undo-btn', class: 'icon-btn', title: '元に戻す（Ctrl+Z）', 'aria-label': '元に戻す', onclick: undo }, icon('undo', 16)),
          h('button', { id: 'redo-btn', class: 'icon-btn', title: 'やり直す（Ctrl+Shift+Z）', 'aria-label': 'やり直す', onclick: redo }, icon('redo', 16))),
        h('button', { class: 'btn ghost sm cmd-btn', onclick: () => openPalette(), title: 'なんでも検索・実行（Ctrl+K）' }, icon('search', 14), h('span', {}, '検索・操作'), h('kbd', {}, 'Ctrl K')),
        h('button', { class: 'btn ghost sm preview-btn', onclick: historyDialog, title: '前の版に戻す（2分おきに自動で残っています）' }, icon('clock', 15), '履歴'),
        h('button', { class: 'btn ghost sm preview-btn', onclick: previewDialog, title: '問題用紙・解答用紙・模範解答の仕上がりを見る（P）' }, icon('eye', 15), 'プレビュー'),
        renderMeter(),
        h('span', { id: 'save-state', class: 'save-state' })),
      h('div', { class: 'main-scroll' }, renderStep())));
}

function renderNav() {
  const p = S.project;
  const st = stats();
  const issues = S.issues;
  const items = [
    ['setup', '試験の設定', 'layers', `${st.planned}/${p.exam.written_points}点`, st.planned === p.exam.written_points ? 'good' : ''],
    ['build', '大問をつくる', 'edit', `${st.made}/${st.count}問`, st.count && st.made >= st.count ? 'good' : ''],
    ['check', 'チェック', 'shield', issues == null ? '' : issues.length ? `${issues.length}件` : 'OK', issues == null ? '' : issues.length ? 'bad' : 'good'],
    ['output', '出力', 'printer', '', ''],
  ];
  return h('nav', { class: 'nav', id: 'nav' }, items.map(([k, label, ic, meta, cls], i) =>
    h('button', { class: 'nav-item' + (S.step === k ? ' on' : ''), onclick: () => gotoStep(k), title: label },
      h('span', { class: 'nav-num' }, i + 1), icon(ic), h('span', { class: 'nav-label' }, label),
      h('span', { class: 'nav-meta ' + cls }, meta))));
}

function renderMeter() {
  const { planned, made, count } = stats();
  const target = S.project.exam.written_points || 0;
  const pct = target ? Math.min(100, planned / target * 100) : 0;
  const cls = planned === target ? ' ok' : planned > target ? ' over' : '';
  return h('div', { class: 'meter' + cls, id: 'meter', title: '大問の配点合計 ／ 筆記の満点' },
    h('div', { class: 'meter-top' }, h('span', { class: 'muted' }, '配点'), h('b', {}, planned), h('span', { class: 'muted' }, `/ ${target}点`)),
    h('div', { class: 'meter-bar' }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'meter-sub' }, `作問 ${made} / ${count}問`));
}

// 旧画面名（教材・試験構成・作問）で呼ばれても新しい画面へ振り替える
const STEP_ALIAS = { materials: 'build', questions: 'build', structure: 'setup' };

function gotoStep(k) {
  hideFab();
  S.step = STEP_ALIAS[k] || k;
  if (S.step === 'check') S.issues = null;
  render();
}

function renderStep() {
  switch (S.step) {
    case 'setup': return renderStructure();
    case 'build': return renderBuild();
    case 'check': return renderCheck();
    case 'output': return renderOutput();
  }
  return h('div');
}

// ================================================================ 素材（大問ごと）

/** この大問の素材。大問に紐づかない古い素材は「共通」として全大問に出す */
function sectionMaterials(s) {
  return S.project.materials.filter(m => m.sid === s.sid || !m.sid);
}

function dropZone(sid, compact = false) {
  const inp = h('input', { type: 'file', multiple: true, accept: '.docx,.txt,.md', style: { display: 'none' } });
  inp.addEventListener('change', () => uploadFiles(inp.files, sid));
  const z = h('div', { class: 'drop' + (compact ? ' compact' : ''), role: 'button', tabindex: '0', onclick: () => inp.click() },
    icon('upload', compact ? 18 : 26),
    h('div', {}, h('b', {}, 'Wordファイルをドロップ'), h('small', {}, '.docx / .txt　クリックでも選べます')), inp);
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); uploadFiles(e.dataTransfer.files, sid); });
  return z;
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('ファイルを読み込めませんでした'));
    fr.readAsDataURL(file);
  });
}

async function uploadFiles(fileList, sid) {
  const files = [...fileList];
  for (const f of files) {
    try {
      const data = await readBase64(f);
      const r = await api('POST', `projects/${S.project.id}/materials`, { name: f.name, data, sid });
      addMaterialLocal(r, sid);
      toast(`「${f.name}」を素材に追加しました（${r.material.chars.toLocaleString()}字）`, 'ok');
    } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
  }
  if (files.length) render({ keepScroll: true });
}

function addMaterialLocal(r, sid) {
  S.project.materials.push(r.material);
  S.materialText[r.material.id] = r.text;
  if (sid) S.matSel[sid] = r.material.id;
  refreshLive();
}

function pasteDialog(sid) {
  const st = { name: '', text: '' };
  const s = S.project.sections.find(x => x.sid === sid);
  openModal({
    title: s ? `${s.label}の素材を貼り付け` : 'テキストを貼り付けて素材にする', size: 'md',
    body: h('div', { class: 'stack' },
      field('素材の名前（出典として問題に記録されます）', input({ value: '', placeholder: '例: L4 Part1 本文／動画でわかる英文法 例文51-60', 'data-autofocus': true, oninput: v => { st.name = v; } })),
      field('本文', textarea({ rows: 12, cls: 'inp en', placeholder: 'ここに英文を貼り付け', oninput: v => { st.text = v; } })),
      h('div', { class: 'hint' }, icon('alert', 14), 'スキャンしたPDFは、文字を読み取ったテキストを貼り付けてください。')),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '追加する', kind: 'primary', icon: 'plus', fn: async c => {
        if (!st.name.trim()) return toast('素材の名前を入力してください', 'error');
        try {
          const r = await api('POST', `projects/${S.project.id}/materials`, { name: st.name.trim(), text: st.text, sid });
          addMaterialLocal(r, sid); c(); render({ keepScroll: true });
          toast(`「${r.material.name}」を素材に追加しました`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

async function deleteMaterial(m) {
  if (!await confirmBox(`素材「${m.name}」を削除しますか？\n（作成済みの問題は消えません）`, { ok: '削除する', danger: true })) return;
  try {
    await api('DELETE', `projects/${S.project.id}/materials/${m.id}`);
    const p = S.project;
    p.materials = p.materials.filter(x => x.id !== m.id);
    p.sections.forEach(s => { if (s.source === m.id) s.source = ''; });
    for (const k of Object.keys(S.matSel)) if (S.matSel[k] === m.id) delete S.matSel[k];
    render({ keepScroll: true });
  } catch (e) { toast(e.message, 'error'); }
}

function materialViewer(m) {
  const text = S.materialText[m.id];
  if (text == null) {
    api('GET', `projects/${S.project.id}/materials/${m.id}`)
      .then(r => { S.materialText[m.id] = r.text; if (S.step === 'build') render({ keepScroll: true }); })
      .catch(e => toast(e.message, 'error'));
    return h('div', { class: 'loading' }, '読み込み中…');
  }
  return matText(text, m.name);
}

function matText(text, source) {
  const box = h('div', { class: 'mat-text' });
  for (const line of text.split('\n')) {
    if (/^\[(TABLE|TEXTBOX)/.test(line)) { box.append(h('div', { class: 'mat-line marker' }, line.replace(/[[\]]/g, ''))); continue; }
    const el = h('div', { class: 'mat-line' });
    const parts = line.match(/[^.!?。？！]+(?:[.!?。？！]+["”’)\]]*)?\s*|[.!?。？！]+\s*/g) || [];
    parts.forEach(part => el.append(h('span', { class: 'sent' }, part)));
    box.append(el);
  }
  box.addEventListener('mouseup', e => {
    const sel = window.getSelection();
    let picked = sel && !sel.isCollapsed && box.contains(sel.anchorNode) ? sel.toString() : '';
    if (!picked.trim()) {
      const s = e.target.closest('.sent');
      if (!s) return hideFab();
      box.querySelectorAll('.sent.picked').forEach(x => x.classList.remove('picked'));
      s.classList.add('picked');
      picked = s.textContent;
    }
    picked = picked.replace(/\s+/g, ' ').trim();
    if (picked) showFab(e.clientX, e.clientY, picked, source); else hideFab();
  });
  return box;
}

let fabEl = null;
function showFab(x, y, text, source) {
  hideFab();
  const s = S.project.sections[S.secIdx];
  const suggested = s ? (QUICK_FOR[s.type] || 'ai') : null;
  fabEl = h('div', { class: 'fab', role: 'dialog', 'aria-label': 'この文で作問' },
    h('div', { class: 'fab-label' }, s ? `${s.label}に、どの形式で問題を作りますか？` : 'どの形式で問題を作りますか？'),
    h('div', { class: 'fab-text' }, text),
    h('div', { class: 'fab-btns' }, QUICK_FORMATS.map(([v, l, ic]) =>
      h('button', { class: 'fab-btn' + (v === suggested ? ' rec' : ''), onmousedown: e => e.preventDefault(),
        onclick: () => openQuick({ text, source, format: v, target: S.step === 'build' ? S.secIdx : undefined }) }, icon(ic, 14), l))));
  document.body.append(fabEl);
  const r = fabEl.getBoundingClientRect();
  fabEl.style.left = Math.max(12, Math.min(x - 40, innerWidth - r.width - 12)) + 'px';
  fabEl.style.top = (y + r.height + 24 > innerHeight ? y - r.height - 14 : y + 16) + 'px';
}
function hideFab() { fabEl?.remove(); fabEl = null; }
document.addEventListener('mousedown', e => { if (fabEl && !fabEl.contains(e.target) && !e.target.closest('.mat-text')) hideFab(); });

// ================================================================ 1. 試験の設定

function renderStructure() {
  const p = S.project, e = p.exam;
  const st = stats();
  const fit = st.planned !== e.written_points && st.planned > 0
    ? h('button', { class: 'link small', onclick: () => { e.written_points = st.planned; markDirty(); render({ keepScroll: true }); } }, `満点を配点合計（${st.planned}点）に合わせる`) : null;
  const examCard = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('file'), '試験の基本情報'),
    h('div', { class: 'grid-4' },
      field('試験名', input({ value: e.title, oninput: v => { e.title = v; markDirty(); const t = $('#title-input'); if (t) t.value = v; } }), 'span2'),
      field('カテゴリー', select(categoryList().map(c => [c, c]), e.category || '定期考査', v => { e.category = v; markDirty(); })),
      h('div', { class: 'fld' }, h('span', {}, '満点'),
        input({ type: 'number', min: 0, value: e.written_points, oninput: v => { e.written_points = toInt(v, 0); markDirty(); } }), fit)),
    h('div', { class: 'grid-2', style: { marginTop: '12px' } },
      field('実施日（表紙または1行目に表示）', input({ value: e.date || '', placeholder: '例: 2026.9.1（火）実施／2026年 7月 2日（木）第2時限実施', oninput: v => { e.date = v; markDirty(); } })),
      field('メモ（用紙には出ません）', input({ value: e.notes || '', placeholder: '例: スピーキング10点は別途', oninput: v => { e.notes = v; markDirty(); } }))));

  const layoutCard = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('printer'), '用紙の体裁',
      h('span', { class: 'muted small' }, layoutSummary(e)),
      h('button', { class: 'btn ghost sm right', onclick: () => { S.layoutOpen = !S.layoutOpen; render({ keepScroll: true }); } }, S.layoutOpen ? '閉じる' : '変更する')),
    S.layoutOpen ? layoutFields(e, markDirty) : null);

  const ctx = { dirty: markDirty, redraw: () => render({ keepScroll: true }), list: p.sections };
  const list = p.sections.length
    ? structureEditor(p.sections, ctx)
    : h('div', { class: 'card', style: { marginTop: '16px' } }, emptyState('layers', '大問がまだありません', '下のボタンで大問を追加するか、テンプレートから組み立てます。',
      [h('button', { class: 'btn primary', onclick: applyTemplateDialog }, icon('layers'), 'テンプレートから組む')]));

  return h('div', { class: 'step' },
    stepHead('試験の設定', '大問は「素材（本文）＋設問（問1・問2…）」でできています。長文の大問なら、同じ本文に空所補充・和訳・指示語・内容一致などの設問を並べます。配点メーターが緑になれば満点と一致しています。',
      [h('button', { class: 'btn ghost', onclick: applyTemplateDialog }, icon('layers'), 'テンプレートを適用'),
        h('button', { class: 'btn ghost', onclick: saveAsTemplateDialog, disabled: !p.sections.length }, icon('download'), 'テンプレートとして保存'),
        p.sections.length ? h('button', { class: 'btn primary', onclick: () => { S.secIdx = 0; gotoStep('build'); } }, '大問をつくる →') : null]),
    examCard, layoutCard, list,
    addBigBar(p.sections, ctx));
}

// 大問のひな型（本文＋設問の組み合わせ）。[形式, 問数, 配点]
const BIG_PRESETS = [
  ['長文読解', '次の英文を読んで、後の問いに答えなさい。', [['fill_blank', 3, 2], ['translation', 1, 4], ['referent', 1, 3], ['content_match', 3, 3]]],
  ['対話文', '次の対話文を読んで、後の問いに答えなさい。', [['choice_4', 3, 2], ['content_match', 2, 3]]],
  ['リスニング', 'リスニング試験　英語は２回放送されます。', [['listening', 8, 1], ['qa', 1, 2]]],
  ['文法', '次の各問いに答えなさい。', [['choice_4', 5, 1], ['reorder_2nd_5th', 3, 2]]],
  ['英作文', '', [['writing', 3, 3]]],
];

/** 大問を追加するバー（本文つきの大問のひな型・1つの形式だけの大問） */
function addBigBar(list, ctx) {
  const addParts = (title, parts) => {
    parts.forEach(([type, count, pe], k) => {
      const s = { ...newSection(type, count), points_each: pe, new_big: k === 0 };
      if (k === 0) s.big_title = title;
      list.push(s);
    });
    applyLabels(list); if (!ctx.template) renumber(); ctx.dirty(); ctx.redraw();
    if (!ctx.template) requestAnimationFrame(() => { const sc = $('.main-scroll'); if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); });
  };
  return h('div', { class: 'add-bar' },
    h('button', { class: 'btn primary sm', onclick: () => addParts('', [['auto', 1, 2]]) }, icon('plus', 14), '大問を追加'),
    h('span', {}, 'またはひな型から'),
    BIG_PRESETS.map(([name, title, parts]) => h('button', { class: 'chip', title: parts.map(([t, c]) => `${SHORT[t]}${c}問`).join('・'),
      onclick: () => addParts(title, parts) }, icon('plus', 13), name)),
    h('button', { class: 'chip solid', onclick: () => typePicker(v => addParts('', [[v, 5, DEFAULT_POINTS[v] ?? 1]])) }, icon('list', 13), '形式を1つ選んで追加'));
}

/** 大問カードの一覧（試験の設定・テンプレート編集で共通） */
function structureEditor(list, ctx) {
  applyLabels(list);
  const gs = groupsOf(list);
  return h('div', { class: 'big-list' }, gs.map((g, gi) => bigCard(list, gs, gi, ctx)));
}

function bigCard(list, gs, gi, ctx) {
  const g = gs[gi];
  const head = list[g[0]];
  const multi = g.length > 1;
  const pts = g.reduce((a, i) => a + plannedPoints(list[i]), 0);
  const fix = () => { applyLabels(list); if (!ctx.template) renumber(); ctx.dirty(); ctx.redraw(); };
  // 大問の中の設問を並べ替え・削除したあと、先頭の設問に大問の指示文・本文を付け直す
  const withGroup = op => {
    const parts = g.map(i => list[i]);
    const hf = { big_title: head.big_title || '', passage: head.passage || '', passage_src: head.passage_src || '' };
    op(parts);
    parts.forEach((x, k) => {
      x.new_big = k === 0;
      if (k === 0) Object.assign(x, hf); else { x.big_title = ''; x.passage = ''; x.passage_src = ''; }
    });
    list.splice(g[0], g.length, ...parts);
    if (!ctx.template && S.secIdx >= list.length) S.secIdx = Math.max(0, list.length - 1);
    fix();
  };
  const moveBig = d => {
    const blocks = gs.map(x => x.map(i => list[i]));
    [blocks[gi], blocks[gi + d]] = [blocks[gi + d], blocks[gi]];
    list.splice(0, list.length, ...blocks.flat());
    fix();
  };
  const delBig = async () => {
    const made = g.reduce((a, i) => a + (list[i].questions?.length || 0), 0);
    if (!await confirmBox(made ? `大問${gi + 1}には作成済みの問題が${made}問あります。設問ごとまとめて削除しますか？` : `大問${gi + 1}を削除しますか？`, { ok: '削除する', danger: true })) return;
    list.splice(g[0], g.length);
    if (!ctx.template && S.secIdx >= list.length) S.secIdx = Math.max(0, list.length - 1);
    fix();
  };
  const addPart = () => typePicker(type => {
    const s = { ...newSection(type), new_big: false };
    list.splice(g[g.length - 1] + 1, 0, s);
    fix();
  });
  const partCtx = { ...ctx, group: g, withGroup, fix };
  return h('div', { class: 'card big-card' },
    h('div', { class: 'big-head' },
      h('div', { class: 'big-no' }, h('small', {}, '大問'), h('b', {}, gi + 1)),
      h('div', { class: 'big-main' },
        field(multi ? '大問の指示文（見出しになります）' : '大問の指示文（設問を2つ以上にしたとき見出しになります）',
          input({ value: head.big_title || '', placeholder: '例: 次の英文を読んで、後の問いに答えなさい。', oninput: v => { head.big_title = v; ctx.dirty(); } })),
        field('作りたい問題（自由に書く。AIへの注文になります・任意）',
          textarea({ value: head.order || '', rows: 2, placeholder: '例: 内容一致を2問、同意語選択を1問。「環境問題に関する問題」を中心に。形式を選ばなくても、ここに書けばAIが問1・問2…に振り分けます',
            oninput: v => { head.order = v; ctx.dirty(); } })),
        h('div', { class: 'big-meta' },
          h('span', { class: 'pill' }, `設問 ${g.length}つ`), h('span', { class: 'pill' }, `${pts}点`),
          ctx.template ? null : h('span', { class: 'pill' + (head.passage ? ' ok' : '') }, head.passage ? `本文あり（${head.passage.length}字）` : '本文なし'),
          gi > 0 && !multi ? h('button', { class: 'link small', type: 'button', title: '前の大問と同じ本文を使う設問にする',
            onclick: () => { head.new_big = false; head.big_title = head.big_title || ''; fix(); } }, '↑ 前の大問の設問にする') : null)),
      h('div', { class: 'sec-actions' },
        iconBtn('up', '大問を上へ', () => moveBig(-1), { disabled: gi === 0 }),
        iconBtn('down', '大問を下へ', () => moveBig(1), { disabled: gi === gs.length - 1 }),
        iconBtn('trash', 'この大問を削除', delBig, { danger: true }))),
    h('div', { class: 'part-list' }, g.map((i, k) => sectionRow(list[i], i, { ...partCtx, k, multi }))),
    h('div', { class: 'row big-foot' },
      h('button', { class: 'btn ghost sm', type: 'button', onclick: addPart }, icon('plus', 13), 'この大問に設問を追加（同じ本文で別の形式）'),
      ctx.template ? null : h('button', { class: 'link', onclick: () => { S.secIdx = g[0]; gotoStep('build'); } }, 'この大問をつくる →')));
}

function layoutSummary(e) {
  return [e.numbering === 'global' ? '通し番号' : '大問ごとの番号', e.heading === 'bracket' ? '【1】見出し' : '１ 見出し',
    e.cover?.enabled ? '表紙あり' : '表紙なし', `解答用紙の欄: ${(e.sheet_fields || '').split(',').filter(Boolean).join('・')}`].join('　／　');
}

/** 用紙の体裁（番号・見出し・解答用紙の欄・表紙）。試験の設定とテンプレート編集で共通 */
function layoutFields(e, dirty) {
  e.cover ||= { enabled: false, grade: '', subject: '', name: '', cautions: '' };
  const coverBox = h('div');
  const drawCover = () => setChildren(coverBox, e.cover.enabled ? h('div', { class: 'cover-box' },
    h('div', { class: 'grid-3' },
      field('学年', input({ value: e.cover.grade || '', placeholder: '例: １学年', oninput: v => { e.cover.grade = v; dirty(); } })),
      field('科目', input({ value: e.cover.subject || '', placeholder: '例: 英語コミュニケーションⅠ', oninput: v => { e.cover.subject = v; dirty(); } })),
      field('試験名（空欄なら上の試験名）', input({ value: e.cover.name || '', placeholder: '例: ２学期中間試験', oninput: v => { e.cover.name = v; dirty(); } }))),
    field('受験上の注意（1行に1つ。空欄なら標準の注意）', textarea({ value: e.cover.cautions || '', rows: 4, placeholder: COVER_CAUTIONS, oninput: v => { e.cover.cautions = v; dirty(); } })),
    h('div', { class: 'row' }, h('button', { class: 'link small', type: 'button', onclick: () => { e.cover.cautions = COVER_CAUTIONS; dirty(); drawCover(); } }, '実物の注意（リスニング・紛らわしい文字）を入れる'))) : null);
  drawCover();
  return h('div', { class: 'layout-fields' },
    h('div', { class: 'grid-2' },
      h('div', { class: 'fld' }, h('span', {}, '問題番号の振り方'),
        segmented([['section', '大問ごと', '(1)(2)…'], ['global', '通し番号', '1, 2, 3 … 100']], e.numbering || 'section', v => { e.numbering = v; dirty(); })),
      h('div', { class: 'fld' }, h('span', {}, '大問の見出し'),
        segmented([['number', '１　指示文（9点）'], ['bracket', '【1】指示文（各1点）']], e.heading || 'number', v => { e.heading = v; dirty(); }))),
    h('div', { class: 'grid-2' },
      field('解答用紙の記入欄（カンマ区切り）', input({ value: e.sheet_fields || '', placeholder: '組,番,氏名,得点', oninput: v => { e.sheet_fields = v; dirty(); } })),
      field('問題用紙の最後の一言', input({ value: e.end_note || '', placeholder: '問題は以上です。', oninput: v => { e.end_note = v; dirty(); } }))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: e.cover.enabled, onchange: ev => { e.cover.enabled = ev.target.checked; dirty(); drawCover(); } }),
      '表紙を付ける（学年・科目・試験名・実施日・受験上の注意）'),
    coverBox);
}

/** 大問の形式・問数・配点 */
function sectionFields(s, ctx) {
  const sub = h('span', { class: 'sec-sub' }, `${plannedPoints(s)}点`);
  const changed = () => { sub.textContent = `${plannedPoints(s)}点`; ctx.dirty(); ctx.onPoints && ctx.onPoints(); };
  return h('div', { class: 'sec-fields' },
    field('形式', groupedSelect(TYPE_GROUPS, s.type, v => {
      const old = s.type;
      s.type = v;
      if (!s.instructions.trim() || s.instructions === DEFAULT_INSTR[old]) s.instructions = DEFAULT_INSTR[v] || '';
      if ((s.choice_style || '1') === (DEFAULT_STYLE[old] || '1')) s.choice_style = DEFAULT_STYLE[v] || '1';
      ctx.dirty(); ctx.redraw();
    })),
    field('問数', input({ type: 'number', min: 0, value: s.count, cls: 'inp num', oninput: v => { s.count = toInt(v, 0); changed(); } })),
    h('span', { class: 'op' }, '×'),
    field('配点', input({ type: 'number', min: 0, value: s.points_each, cls: 'inp num', oninput: v => { s.points_each = toInt(v, 0); changed(); } })),
    h('span', { class: 'op' }, '='), sub);
}

/** 大問の詳細設定（選択肢の記号・解答用紙の詰め方・語群・採点基準） */
function sectionDetails(s, ctx) {
  const bankText = (s.bank || []).join('\n');
  return h('div', { class: 'sec-detail' },
    h('div', { class: 'grid-3' },
      field('選択肢の記号', select(CHOICE_STYLES.map(([v, l]) => [v, l]), s.choice_style || '1', v => {
        s.choice_style = v;
        if (!ctx.template) syncChoiceAnswers(s);  // 作成済みの問題の正解記号も振り直す
        ctx.dirty(); ctx.redraw();
      })),
      field('解答用紙で1行に並べる問題数', select([['0', '自動（形式に合わせる）'], ...[1, 2, 3, 4, 5, 6, 8, 10].map(n => [String(n), `${n}問`])], String(s.per_row || 0), v => { s.per_row = toInt(v, 0); ctx.dirty(); })),
      field('語群の記号', select([['', '選択肢と同じ'], ...CHOICE_STYLES.map(([v, l]) => [v, l])], s.bank_style || '', v => { s.bank_style = v; ctx.dirty(); }))),
    h('div', { class: 'grid-2' },
      field('語群（大問の下にまとめて表示。1行に1つ）', textarea({ value: bankText, rows: 3, cls: 'inp en', placeholder: '例: ancestor\nquality\nextend',
        oninput: v => { s.bank = v.split('\n').map(x => x.trim()).filter(Boolean); ctx.dirty(); } })),
      field('採点基準（模範解答に表示）', textarea({ value: s.scoring_note || '', rows: 3, placeholder: '例: 完答で得点（大・小文字ミスは減点なし）', oninput: v => { s.scoring_note = v; ctx.dirty(); } }))));
}

/** 設問1つ分の行（大問カードの中）。試験の設定とテンプレート編集で共通 */
function sectionRow(s, i, ctx) {
  const k = ctx.k, n = ctx.group.length;
  const open = S.secDetail.has(s.sid);
  const detailCount = [s.bank?.length, s.scoring_note, +s.per_row, (s.choice_style || '1') !== '1'].filter(Boolean).length;
  return h('div', { class: 'sec-row part' },
    h('div', { class: 'sec-top' },
      h('div', { class: 'sec-no part' }, h('b', {}, ctx.multi ? `問${k + 1}` : '設問')),
      sectionFields(s, ctx),
      h('div', { class: 'sec-actions' },
        iconBtn('up', '設問を上へ', () => ctx.withGroup(a => { [a[k - 1], a[k]] = [a[k], a[k - 1]]; }), { disabled: k === 0 }),
        iconBtn('down', '設問を下へ', () => ctx.withGroup(a => { [a[k + 1], a[k]] = [a[k], a[k + 1]]; }), { disabled: k === n - 1 }),
        n > 1 ? iconBtn('trash', 'この設問を削除', async () => {
          const msg = s.questions?.length ? `問${k + 1}には作成済みの問題が${s.questions.length}問あります。削除しますか？` : `問${k + 1}を削除しますか？`;
          if (!await confirmBox(msg, { ok: '削除する', danger: true })) return;
          ctx.withGroup(a => { a.splice(k, 1); });
        }, { danger: true }) : null)),
    field('指示文', textarea({ value: s.instructions, rows: 2, oninput: v => { s.instructions = v; ctx.dirty(); } })),
    open ? sectionDetails(s, ctx) : null,
    h('div', { class: 'sec-foot' },
      h('span', { class: 'row' },
        h('button', { class: 'link', type: 'button', onclick: () => { open ? S.secDetail.delete(s.sid) : S.secDetail.add(s.sid); ctx.redraw(); } },
          open ? '詳細設定を閉じる' : `詳細設定（選択肢の記号・語群・採点基準）${detailCount ? `　${detailCount}件設定済み` : ''}`),
        k > 0 ? h('button', { class: 'link small', type: 'button', title: 'この設問から後ろを新しい大問にする',
          onclick: () => { s.new_big = true; ctx.fix(); } }, 'ここから別の大問にする') : null),
      ctx.template ? null : h('span', {}, `作成済み ${s.questions.length} / ${s.count}問`)));
}

/** 大問の形式を選ぶ（分類ごとのボタン） */
function typePicker(onPick) {
  openModal({
    title: '大問の形式を選ぶ', size: 'md',
    body: h('div', { class: 'type-pick' }, TYPE_GROUPS.map(([g, opts]) => h('div', { class: 'type-group' },
      h('div', { class: 'type-group-name' }, g),
      h('div', { class: 'type-btns' }, opts.map(([v, l]) => h('button', { class: 'type-btn', 'data-type': v,
        onclick: () => { closeTop(); onPick(v); } }, h('b', {}, l), h('small', {}, `${DEFAULT_POINTS[v] ?? 1}点／問　${(DEFAULT_INSTR[v] || '指示文は自由に入力').slice(0, 34)}…`))))))),
    actions: [{ label: 'キャンセル', fn: c => c() }],
  });
}
function closeTop() { if (modalStack.length) modalStack[modalStack.length - 1](); }

function addSection(type, go = false) {
  S.project.sections.push(newSection(type));
  renumber(); markDirty();
  if (go) { S.secIdx = S.project.sections.length - 1; render(); return; }
  render({ keepScroll: true });
  requestAnimationFrame(() => { const sc = $('.main-scroll'); if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); });
}

// ================================================================ 2. 大問をつくる（素材＋問題）

function renderBuild() {
  const p = S.project;
  if (!p.sections.length) {
    return h('div', { class: 'step' }, stepHead('大問をつくる'),
      h('div', { class: 'card' }, emptyState('layers', 'まだ大問がありません', 'まず「試験の設定」で大問を組むか、下から大問を1つ追加してください。', [
        h('button', { class: 'btn primary', onclick: () => gotoStep('setup') }, icon('layers'), '試験の設定へ'),
        h('button', { class: 'btn ghost', onclick: () => addSection('fill_blank', true) }, icon('plus'), '空所補充の大問を追加')])));
  }
  if (S.secIdx >= p.sections.length) S.secIdx = 0;
  applyLabels(p.sections);
  const si = S.secIdx, s = p.sections[si];
  const gs = groupsOf(p.sections);
  const gi = gs.findIndex(g => g.includes(si)), g = gs[gi];
  const big = p.sections[g[0]];                 // 大問の先頭の設問（大問の指示文・本文・素材を持つ）
  const multi = g.length > 1;
  const sids = new Set(g.map(i => p.sections[i].sid));
  const mats = p.materials.filter(m => !m.sid || sids.has(m.sid));
  let selId = S.matSel[big.sid];
  if (!mats.some(m => m.id === selId)) selId = S.matSel[big.sid] = mats[0]?.id;
  const others = p.materials.filter(m => m.sid && !sids.has(m.sid));
  const viewing = p.materials.find(m => m.id === selId);
  const bigLabel = `大問${big.no}`;

  const tabs = h('div', { class: 'sec-tabs', role: 'tablist' },
    gs.map((gg, k) => {
      const secs = gg.map(i => p.sections[i]);
      const made = secs.reduce((a, x) => a + x.questions.length, 0), count = secs.reduce((a, x) => a + x.count, 0);
      return h('button', { class: 'sec-tab' + (k === gi ? ' on' : ''), role: 'tab', onclick: () => { S.secIdx = gg[0]; hideFab(); render(); } },
        h('b', {}, `大問${k + 1}`), h('span', {}, secs.length > 1 ? `${SHORT[secs[0].type]}ほか 設問${secs.length}つ` : SHORT[secs[0].type] || secs[0].type),
        h('em', { class: count && made >= count ? 'full' : '' }, `${made}/${count}問`));
    }),
    h('button', { class: 'sec-tab add', onclick: () => gotoStep('setup'), title: '大問の追加・並べ替えは「試験の設定」で' }, icon('plus', 16), h('span', {}, '大問を追加')));

  // 大問の見出し：大問の指示文・本文・設問（問1・問2…）の切り替え
  const ctx = { dirty: markDirty, redraw: () => render({ keepScroll: true }), onPoints: refreshLive, list: p.sections };
  const editBox = S.secOpen ? h('div', { class: 'sec-edit' },
    sectionFields(s, ctx),
    field('指示文', textarea({ value: s.instructions, rows: 2, oninput: v => { s.instructions = v; markDirty(); const t = $('#sec-instr'); if (t) t.textContent = v; } })),
    sectionDetails(s, ctx)) : null;
  const vocab = VOCAB_TYPES.has(s.type);
  const addPart = () => typePicker(type => {
    const ns = { ...newSection(type), new_big: false };
    p.sections.splice(g[g.length - 1] + 1, 0, ns);
    renumber(); markDirty(); S.secIdx = g[g.length - 1] + 1; render({ keepScroll: true });
  });
  const partTabs = h('div', { class: 'part-tabs' },
    g.map((i, k) => {
      const x = p.sections[i];
      return h('button', { class: 'part-tab' + (i === si ? ' on' : ''), onclick: () => { S.secIdx = i; hideFab(); render({ keepScroll: true }); } },
        h('b', {}, multi ? `問${k + 1}` : '設問'), h('span', {}, SHORT[x.type] || x.type),
        h('em', { class: x.count && x.questions.length >= x.count ? 'full' : '' }, `${x.questions.length}/${x.count}`));
    }),
    h('button', { class: 'part-tab add', onclick: addPart, title: '同じ本文で、別の形式の設問を足します（例: 和訳・指示語・内容一致）' }, icon('plus', 14), '設問を追加'));
  const passage = (big.passage || '').trim();
  const head = h('div', { class: 'card sec-head' },
    h('div', { class: 'sec-head-main' },
      h('div', { class: 'big-title-row' }, h('b', {}, bigLabel),
        input({ value: big.big_title || '', cls: 'inp big-title', placeholder: multi ? '大問の指示文（例: 次の英文を読んで、後の問いに答えなさい。）' : '大問の指示文（設問を2つ以上にしたとき見出しになります）',
          oninput: v => { big.big_title = v; markDirty(); } })),
      h('div', { class: 'passage-row' + (passage ? ' has' : '') },
        icon('book', 15),
        h('div', { class: 'passage-text' }, passage
          ? [h('b', {}, `本文（問題用紙に載せる・${passage.length}字）`), h('span', {}, rich(passage.slice(0, 140).replace(/\n/g, ' ') + (passage.length > 140 ? '…' : '')))]
          : [h('b', {}, '本文（問題用紙に載せる）: なし'), h('span', {}, '長文・対話文の大問は、本文を入れると問題用紙の大問の最初に枠つきで載ります')]),
        h('button', { class: 'btn ghost sm', onclick: () => passageDialog(big, mats) }, icon('edit', 13), passage ? '本文を編集' : '本文を入れる')),
      orderBox(big, g[0]),
      partTabs,
      h('div', { class: 'sec-head-title' }, `${s.label}　${TYPE_LABEL[s.type] || s.type}`,
        h('span', { class: 'pill' }, `${s.points_each}点 × ${s.count}問 ＝ ${plannedPoints(s)}点`),
        balanceChip(s),
        h('button', { class: 'link', onclick: () => { S.secOpen = !S.secOpen; render({ keepScroll: true }); } }, S.secOpen ? '設定を閉じる' : '形式・配点・指示文・語群を変更')),
      h('p', { class: 'sec-instr', id: 'sec-instr' }, s.instructions || '（指示文は「形式・配点・指示文を変更」から入力できます）'),
      s.bank?.length ? h('p', { class: 'sec-bank' }, h('b', {}, '語群: '), choiceLine(s.bank_style || s.choice_style, s.bank).join('　')) : null,
      editBox));

  // 進み具合の案内
  const made = s.questions.length;
  const guide = h('div', { class: 'guide' },
    guideStep(1, vocab ? '単語リストを入れる（Excelの表をコピーして貼り付け）' : 'この大問の素材を入れる', mats.length > 0),
    guideStep(2, vocab ? '「単語リストから作成」で自動作成' : '素材の文をクリックして形式を選ぶ', made > 0),
    guideStep(3, `問題を${s.count}問そろえる（いま${made}問）`, s.count > 0 && made >= s.count));

  // 左：素材（大問で共通）
  const matPane = h('div', { class: 'card pane' },
    h('div', { class: 'pane-head' }, h('span', { class: 'pane-num' }, '1'), h('b', {}, `${bigLabel}の素材`),
      h('span', { class: 'muted' }, vocab ? '単語リスト（単語・意味・例文など）' : '本文・例文など。大問の設問すべてで使えます')),
    h('div', { class: 'mat-tabs' },
      mats.map(m => h('div', { class: 'mat-chip' + (m.id === selId ? ' on' : ''), role: 'button', tabindex: '0',
        onclick: () => { S.matSel[big.sid] = m.id; hideFab(); render({ keepScroll: true }); } },
        icon(/\.docx$/i.test(m.name) ? 'file' : 'type', 14), h('span', {}, m.name), m.sid ? null : h('small', {}, '共通'),
        h('button', { class: 'x', title: '削除', onclick: e => { e.stopPropagation(); deleteMaterial(m); } }, icon('x', 12)))),
      others.length ? select([['', '＋ 他の大問の素材を使う'], ...others.map(m => [m.id, m.name])], '',
        v => { if (v) { S.matSel[big.sid] = v; render({ keepScroll: true }); } }, 'inp mini') : null),
    viewing
      ? h('div', {},
        h('div', { class: 'viewer-tip' }, icon('sparkles', 14), `文をクリック（範囲はドラッグ）→ 形式を選ぶと、${s.label}に問題が入ります`),
        materialViewer(viewing),
        h('div', { class: 'row', style: { marginTop: '10px' } },
          dropZone(big.sid, true),
          h('button', { class: 'btn ghost', onclick: () => pasteDialog(big.sid) }, icon('clipboard'), '貼り付けて追加'),
          vocab ? null : h('button', { class: 'btn ghost', title: 'この素材の全文を、問題用紙に載せる本文にします', onclick: () => useAsPassage(big, viewing) }, icon('book'), 'この素材を本文にする')))
      : h('div', { class: 'stack' },
        h('p', { class: 'muted', style: { margin: 0 } }, vocab
          ? '単語帳・単語リストを入れてください。Excelの表（番号・単語・意味・例文…）をそのままコピーして貼り付けられます。'
          : 'この大問で使う教科書本文・ワークブック・例文集を入れてください。長文の大問なら、その本文を入れて「この素材を本文にする」を押すと問題用紙に載ります。'),
        vocab ? h('button', { class: 'btn primary block', onclick: () => openWordList(si) }, icon('list'), '単語リストを貼り付けて作成') : null,
        dropZone(big.sid),
        h('button', { class: 'btn ghost block', onclick: () => pasteDialog(big.sid) }, icon('clipboard'), 'テキストを貼り付けて追加')));

  // 右：問題
  const plan = numberPlan(p)[si];
  const qPane = h('div', { class: 'card pane' },
    h('div', { class: 'pane-head' }, h('span', { class: 'pane-num' }, '2'), h('b', {}, `${s.label}の問題`),
      h('span', { class: 'pill ' + (s.count && made >= s.count ? 'ok' : '') }, `${made} / ${s.count}問`)),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      vocab ? h('button', { class: 'btn primary sm', onclick: () => openWordList(si) }, icon('list', 14), '単語リストから作成') : null,
      h('button', { class: 'btn sm ' + (vocab ? 'ghost' : 'primary'), onclick: () => openQuick({ format: QUICK_FOR[s.type] || 'ai', target: si, source: viewing?.name || '' }) }, icon('sparkles', 14), '英文を入れて作問'),
      h('button', { class: 'btn ghost sm', onclick: () => addBlankQuestion(si) }, icon('plus', 14), '空の問題'),
      h('button', { class: 'btn ghost sm', disabled: !S.status.ai, title: S.status.ai ? `この大問の素材から${aiName()}が作問します` : 'APIキーを設定すると使えます', onclick: () => aiSection(si) }, icon('sparkles', 14), 'AIで一括作問'),
      made ? menuButton(h('span', { class: 'row-i' }, icon('list', 14), 'まとめて'), [
        ['shuffle', '正解の位置をならす（選択式）', () => balanceAnswers(s)],
        ['copy', 'この大問の問題をコピー（テキスト）', () => copyText(s.questions.map((q, i) => `${plan[i].label} ${q.body.replace(/\n/g, ' ')}${q.choices ? '  ' + choiceLine(s.choice_style, q.choices).join('  ') : ''}　→ ${q.answer}`).join('\n'))],
        ['trash', 'この大問の問題をすべて削除', () => clearSection(s)],
      ]) : null),
    made ? h('div', { class: 'q-list' }, s.questions.map((q, qi) => questionCard(s, si, q, qi, plan[qi])))
      : h('div', { class: 'empty small' }, icon('edit', 26), h('b', {}, 'まだ問題がありません'),
        h('p', {}, vocab ? '「単語リストから作成」で、単語リストから選択肢つきの問題を自動で作れます' : '左の素材の文をクリックすると作れます')));

  return h('div', { class: 'step wide' },
    stepHead('大問をつくる', '上のタブで大問、その下の「問1・問2…」で設問を選びます。素材（本文）は大問で共通です。文をクリックすると、選んでいる設問に問題が入ります。'),
    tabs, head, h('div', { class: 'build' }, matPane, qPane));
}

// ================================================================ AIに注文して作る（自然言語）

function orderBox(big, headIdx) {
  const busy = S.ordering === big.sid;
  return h('div', { class: 'order-box' },
    h('div', { class: 'order-head' }, icon('sparkles', 15), h('b', {}, 'AIに注文して作る'),
      h('span', { class: 'muted' }, '作りたい問題を普通の文章で書くだけ。種類ごとに問1・問2…へ自動で振り分けます')),
    textarea({ value: big.order || '', rows: 2, cls: 'inp order-inp',
      placeholder: '例: 内容一致を2問、同意語選択を1問、下線部(A)の和訳を1問。第2段落の筆者の主張に関する問題を中心に。',
      oninput: v => { big.order = v; markDirty(); } }),
    h('div', { class: 'row' },
      S.status.ai
        ? h('button', { class: 'btn primary sm', disabled: busy, onclick: () => runOrder(big, headIdx) }, icon('sparkles', 14), busy ? 'AIが作問中…（数十秒）' : `${aiName()}で作る`)
        : [h('button', { class: 'btn primary sm', onclick: () => copyOrderPrompt(big, headIdx) }, icon('clipboard', 14), '依頼文をコピー（API抜き）'),
          h('button', { class: 'btn ghost sm', onclick: () => pasteOrderResult(headIdx) }, icon('download', 14), '結果を貼り付けて取り込む')],
      h('span', { class: 'muted small' }, S.status.ai ? '本文と素材だけを根拠に作ります。作った問題は必ず確認してください'
        : 'APIキーなしでも、依頼文を Claude / ChatGPT の画面に貼り付ければ同じことができます')));
}

async function runOrder(big, headIdx) {
  if (!(big.order || '').trim()) return toast('作りたい問題を入力してください（例: 内容一致を2問、同意語選択を1問）', 'error');
  await flushSave();
  S.ordering = big.sid; render({ keepScroll: true });
  try {
    const r = await api('POST', 'ai/order', { pid: S.project.id, index: headIdx, order: big.order });
    const n = placeOrdered(headIdx, r.questions);
    toast(`${n}問を作りました` + (r.dropped ? `（根拠のない${r.dropped}問は破棄）` : '') + `　${r.cost}`, 'ok');
  } catch (e) { toast(e.message, 'error'); }
  S.ordering = null; refreshUsage(); render({ keepScroll: true });
}

async function copyOrderPrompt(big, headIdx) {
  if (!(big.order || '').trim()) return toast('作りたい問題を入力してください', 'error');
  await flushSave();
  try {
    const r = await api('POST', 'prompt/order', { pid: S.project.id, index: headIdx, order: big.order });
    await copyText(r.prompt, '依頼文をコピーしました。Claude / ChatGPT に貼り付け、返ってきた結果を「結果を貼り付けて取り込む」から入れてください');
  } catch (e) { toast(e.message, 'error'); }
}

function pasteOrderResult(headIdx) {
  let raw = '';
  openModal({
    title: 'AIの結果を取り込む', size: 'md',
    body: h('div', { class: 'stack' }, h('p', { class: 'muted', style: { margin: 0 } }, 'Claude / ChatGPT から返ってきた {"questions": [...]} をそのまま貼り付けてください。'),
      textarea({ rows: 10, cls: 'inp prompt-box', 'data-autofocus': true, oninput: v => { raw = v; } })),
    actions: [{ label: 'キャンセル', fn: c => c() }, { label: '取り込む', kind: 'primary', fn: c => {
      try {
        const obj = JSON.parse(raw.slice(raw.search(/[[{]/), Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']')) + 1));
        const qs = (Array.isArray(obj) ? obj : obj.questions || []).filter(q => q.body && q.answer);
        if (!qs.length) throw new Error('問題が見つかりません');
        const noSrc = qs.filter(q => !String(q.source_ref || '').trim()).length;
        const n = placeOrdered(headIdx, qs.filter(q => String(q.source_ref || '').trim()));
        c(); render({ keepScroll: true });
        toast(`${n}問を取り込みました` + (noSrc ? `（出典のない${noSrc}問は除外）` : ''), 'ok');
      } catch (e) { toast('取り込めませんでした: ' + e.message, 'error'); }
    } }],
  });
}

/** AIの結果を、種類ごとに大問の設問（問1・問2…）へ振り分ける。無ければ設問を足す */
function placeOrdered(headIdx, qs) {
  const p = S.project;
  let n = 0, last = null;
  qs.forEach(r => {
    const kind = TYPE_LABEL[r.kind] && r.kind !== 'auto' ? r.kind : 'other';
    applyLabels(p.sections);
    const g = groupsOf(p.sections).find(x => x.includes(headIdx));
    let si = g.find(i => p.sections[i].type === kind);
    if (si == null) si = g.find(i => p.sections[i].type === 'auto' && !p.sections[i].questions.length);
    if (si == null) {
      si = g[g.length - 1] + 1;
      p.sections.splice(si, 0, { ...newSection(kind, 0), new_big: false, instructions: r.instructions || DEFAULT_INSTR[kind] || '' });
    }
    const s = p.sections[si];
    if (s.type === 'auto') {
      Object.assign(s, { type: kind, instructions: r.instructions || DEFAULT_INSTR[kind] || '', choice_style: DEFAULT_STYLE[kind] || '1', points_each: DEFAULT_POINTS[kind] ?? 1 });
    } else if (!s.instructions.trim() && r.instructions) s.instructions = r.instructions;
    const q = { body: r.body, answer: r.answer, source_ref: r.source_ref || '', focus: r.focus || '', kind, number: 0,
      alt_answer_risk: '【AI作問・要確認】' + (r.alt_answer_risk || '') };
    if (Array.isArray(r.choices) && r.choices.length) {
      q.choices = r.choices.map(String);
      if (Number.isInteger(r.correct) && r.correct >= 0 && r.correct < q.choices.length) q.correct = r.correct;
    }
    s.questions.push(q);
    if (q.choices && Number.isInteger(q.correct)) syncChoiceAnswers({ ...s, questions: [q] });
    if (s.questions.length > s.count) s.count = s.questions.length;
    n++; last = s;
  });
  renumber(); markDirty();
  if (last) S.secIdx = p.sections.indexOf(last);
  S.issues = null; S.student = null;
  return n;
}

// ================================================================ API使用量

async function refreshUsage() {
  try { S.usage = await api('GET', 'usage'); } catch { /* 表示しないだけ */ }
  const c = $('#usage-chip'); if (c) c.replaceWith(usageChip());
}

const yen = usd => !usd ? '0円' : usd * 150 < 1 ? '1円未満' : `約${Math.round(usd * 150).toLocaleString()}円`;  // 1ドル150円で換算（目安）

function usageChip() {
  const u = S.usage;
  if (!u || (!S.status.ai && !u.all.calls)) return h('span', { id: 'usage-chip' });
  return h('button', { id: 'usage-chip', class: 'status-chip', onclick: usageDialog, title: 'APIの使用量と料金の目安' },
    icon('key', 14), h('span', {}, `API 今月 ${yen(u.month.cost_usd)}`));
}

async function usageDialog() {
  await refreshUsage();
  const u = S.usage;
  const tile = (label, v, sub) => h('div', { class: 'u-tile' }, h('small', {}, label), h('b', {}, yen(v)), h('span', {}, sub));
  openModal({
    title: 'APIの使用量（料金の目安）', size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'u-tiles' },
        tile('今回（ツールを起動してから）', u.session.cost_usd, `$${u.session.cost_usd.toFixed(3)}・${u.session.calls}回`),
        tile(`今月（${u.month.label}）`, u.month.cost_usd, `$${u.month.cost_usd.toFixed(3)}・${u.month.calls}回`),
        tile('これまでの合計', u.all.cost_usd, `$${u.all.cost_usd.toFixed(3)}・${u.all.calls}回`)),
      u.recent.length ? h('table', { class: 'u-table' },
        h('tr', {}, ['日時', '内容', 'モデル', 'トークン（入力／出力）', '目安'].map(t => h('th', {}, t))),
        u.recent.map(e => h('tr', {}, h('td', {}, e.at), h('td', {}, e.task), h('td', {}, e.model),
          h('td', {}, `${e.input.toLocaleString()} / ${e.output.toLocaleString()}`), h('td', {}, yen(e.cost_usd)))))
        : h('p', { class: 'muted' }, 'まだAIを使っていません。'),
      h('p', { class: 'muted small', style: { margin: 0 } }, u.note + ' 円は1ドル150円で換算しています。')),
    actions: [{ label: '閉じる', kind: 'primary', fn: c => c() }],
  });
}

/** 素材の全文を大問の本文にする */
async function useAsPassage(big, m) {
  let text = S.materialText[m.id];
  if (text == null) { try { text = S.materialText[m.id] = (await api('GET', `projects/${S.project.id}/materials/${m.id}`)).text; } catch (e) { return toast(e.message, 'error'); } }
  passageDialog(big, [], { text: text.split('\n').filter(l => !/^\[(TABLE|TEXTBOX)/.test(l.trim())).join('\n').trim(), src: m.name.replace(/\.\w+$/, '') });
}

/** 大問の本文（問題用紙に枠つきで載る）を編集する */
function passageDialog(big, mats, init) {
  const st = { text: init?.text ?? big.passage ?? '', src: init?.src ?? big.passage_src ?? '' };
  const ta = textarea({ value: st.text, rows: 14, cls: 'inp en', placeholder: '本文を貼り付け。段落は改行で分けます。', oninput: v => { st.text = v; } });
  const srcInp = input({ value: st.src, placeholder: '例: Heartening II Lesson 4 Part 1', oninput: v => { st.src = v; } });
  openModal({
    title: `大問${big.no}の本文（問題用紙に載せる英文）`, size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'hint' }, icon('sparkles', 14), h('span', {}, '__語句__ と書くと下線になります。(A) (1) ① などの記号もそのまま書けます。本文は教材のまま、一語も書き換えないでください（空所や下線の記号を付けるだけにする）。')),
      mats.length ? select([['', '素材から読み込む…'], ...mats.map(m => [m.id, m.name])], '', async v => {
        if (!v) return;
        const m = mats.find(x => x.id === v);
        let text = S.materialText[v];
        if (text == null) { try { text = S.materialText[v] = (await api('GET', `projects/${S.project.id}/materials/${v}`)).text; } catch (e) { return toast(e.message, 'error'); } }
        st.text = text.split('\n').filter(l => !/^\[(TABLE|TEXTBOX)/.test(l.trim())).join('\n').trim(); ta.value = st.text;
        if (!st.src) { st.src = m.name.replace(/\.\w+$/, ''); srcInp.value = st.src; }
      }) : null,
      field('本文', ta),
      field('本文の出典（出典一覧に載ります）', srcInp)),
    actions: [
      big.passage ? { label: '本文を外す', fn: c => { big.passage = ''; markDirty(); c(); render({ keepScroll: true }); } } : null,
      { label: 'キャンセル', fn: c => c() },
      { label: '保存', kind: 'primary', icon: 'check', fn: c => {
        big.passage = st.text.trim(); big.passage_src = st.src.trim();
        markDirty(); c(); render({ keepScroll: true });
        toast('本文を保存しました。問題用紙では大問の見出しのすぐ下に枠つきで載ります', 'ok');
      } },
    ],
  });
}

/** 版の履歴: 自動で残っている前の版に戻す */
async function historyDialog() {
  const p = S.project;
  await flushSave();
  let list = [];
  try { list = (await api('GET', `projects/${p.id}/history`)).history; } catch (e) { return toast(e.message, 'error'); }
  openModal({
    title: '版の履歴', size: 'md',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, '編集中は2分おきに、その時点の内容が自動で残ります（最大40版）。戻しても今の内容は版として残るので、何度でもやり直せます。'),
      list.length ? h('div', { class: 'hist-list' }, list.map(x => h('div', { class: 'hist-row' },
        icon('clock', 15), h('b', {}, x.at), h('span', { class: 'muted' }, `設問${x.sections}・作問${x.questions}問`),
        h('button', { class: 'btn ghost sm', onclick: async () => {
          if (!await confirmBox(`${x.at} の版に戻しますか？\n（今の内容も版として残ります）`, { ok: '戻す' })) return;
          try {
            await api('POST', `projects/${p.id}/history/${x.name}/restore`);
            closeTop(); await openProject(p.id, S.step); toast(`${x.at} の版に戻しました`, 'ok');
          } catch (e) { toast(e.message, 'error'); }
        } }, 'この版に戻す'))))
        : h('div', { class: 'empty small' }, icon('clock', 24), h('b', {}, 'まだ版がありません'), h('p', {}, '編集を続けると、2分おきに自動で残ります'))),
    actions: [{ label: '閉じる', kind: 'primary', fn: c => c() }],
  });
}

/** 試験の分析: 配点の内訳・選択式と記述式・正解記号の分布・問われている要素の重なり */
function analysisCard() {
  const p = S.project;
  const all = p.sections.flatMap(s => s.questions.map(q => ({ s, q })));
  if (!all.length) return null;
  const total = all.reduce((a, { s, q }) => a + qPoints(s, q), 0) || 1;
  const byType = {};
  all.forEach(({ s, q }) => { const k = SHORT[s.type] || s.type; byType[k] = (byType[k] || 0) + qPoints(s, q); });
  const choice = all.filter(({ q }) => q.choices?.length).reduce((a, { s, q }) => a + qPoints(s, q), 0);
  const marks = {};
  all.forEach(({ q }) => { if (q.choices?.length && Number.isInteger(q.correct)) marks[q.correct] = (marks[q.correct] || 0) + 1; });
  const focus = {};
  all.forEach(({ s, q }) => {
    const f = String(q.focus || '').trim().toLowerCase();
    if (f) (focus[f] ||= []).push(`${s.label}(${q.number})`);
  });
  const dups = Object.entries(focus).filter(([, v]) => v.length > 1);
  const bar = (label, v, max, sub) => h('div', { class: 'an-row' }, h('span', { class: 'an-label' }, label),
    h('div', { class: 'an-bar' }, h('i', { style: { width: Math.round(v / max * 100) + '%' } })), h('span', { class: 'an-val' }, sub));
  const gs = groupsOf(p.sections);
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('chart'), '試験の分析', h('span', { class: 'muted small right' }, `作成済み ${all.length}問・${total}点`)),
    h('div', { class: 'an-grid' },
      h('div', {}, h('div', { class: 'qk-label' }, '形式ごとの配点'),
        Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => bar(k, v, total, `${v}点・${Math.round(v / total * 100)}%`))),
      h('div', {}, h('div', { class: 'qk-label' }, '大問ごとの配点'),
        gs.map((g, k) => { const v = g.reduce((a, i) => a + sectionPoints(p.sections[i]), 0); return bar(`大問${k + 1}`, v, total, `${v}点`); }),
        h('div', { class: 'qk-label', style: { marginTop: '10px' } }, '選択式と記述式'),
        bar('選択式', choice, total, `${choice}点`), bar('記述式', total - choice, total, `${total - choice}点`)),
      h('div', {}, h('div', { class: 'qk-label' }, '正解の位置（選択式の全問）'),
        Object.keys(marks).length ? [0, 1, 2, 3, 4].filter(k => marks[k] != null || k < 4).map(k => bar(`${k + 1}番目`, marks[k] || 0, Math.max(...Object.values(marks)), `${marks[k] || 0}問`))
          : h('p', { class: 'muted small' }, '選択式の問題はまだありません'),
        h('div', { class: 'qk-label', style: { marginTop: '10px' } }, '問われている要素の重なり'),
        dups.length ? h('ul', { class: 'an-dups' }, dups.map(([f, v]) => h('li', {}, h('b', {}, f), `：${v.join('・')}`)))
          : h('p', { class: 'muted small' }, Object.keys(focus).length ? '同じ要素を問う問題は見つかりませんでした（「問いたい点」で判定）' : '「問いたい点」が入った問題がないため判定できません。仮想の生徒でも確認できます'))));
}

/** プレビューモード: どの画面からでも、用紙の仕上がりを大きく確認する */
function previewDialog() {
  const p = S.project;
  let tab = S.previewTab || 'exam', zoom = 1;
  const box = h('div', { class: 'pv-stage' });
  const tabs = h('div', { class: 'seg' });
  const draw = () => {
    tabs.replaceChildren(...[['exam', '問題用紙'], ['sheet', '解答用紙'], ['model', '模範解答']].map(([k, l]) =>
      h('button', { class: 'seg-btn' + (tab === k ? ' on' : ''), onclick: () => { tab = S.previewTab = k; draw(); } }, l)));
    const paper = paperView(tab);
    paper.style.zoom = zoom;
    box.replaceChildren(paper);
  };
  const st = stats();
  const bar = h('div', { class: 'pv-bar' }, tabs,
    h('span', { class: 'muted small' }, `大問${groupsOf(p.sections).length}・作問 ${st.made}/${st.count}問・配点 ${p.sections.reduce((a, x) => a + sectionPoints(x), 0)}/${p.exam.written_points}点`),
    h('div', { class: 'row', style: { marginLeft: 'auto' } },
      iconBtn('down', '縮小', () => { zoom = Math.max(.6, zoom - .1); draw(); }),
      iconBtn('up', '拡大', () => { zoom = Math.min(1.6, zoom + .1); draw(); }),
      h('button', { class: 'btn ghost sm', onclick: () => window.print() }, icon('printer', 14), '印刷'),
      h('button', { class: 'btn primary sm', onclick: () => { closeTop(); gotoStep('output'); doExport(); } }, icon('download', 14), 'Wordで出力')));
  draw();
  openModal({ title: `プレビュー — ${p.exam.title}`, size: 'xl preview', body: h('div', { class: 'pv' }, bar, box) });
}

function guideStep(n, text, done) {
  return h('div', { class: 'guide-step' + (done ? ' done' : '') }, h('span', { class: 'gs-num' }, done ? icon('check', 13) : n), h('span', {}, text));
}

function qBadges(q) {
  const b = [];
  if (!q.body.trim() && !(q.script || '').trim() && !q.choices?.length) b.push(['bad', '問題文なし']);
  if (!q.answer.trim()) b.push(['bad', '解答なし']);
  if (q.choices?.length) {
    const clean = q.choices.map(c => String(c).trim().toLowerCase());
    if (clean.some(c => !c)) b.push(['bad', '空の選択肢']);
    else if (new Set(clean).size < clean.length) b.push(['bad', '選択肢が重複']);
    if (!Number.isInteger(q.correct)) b.push(['warn', '正解の選択肢が未設定']);
  }
  if (!q.source_ref.trim()) b.push(['bad', '出典なし']);
  if (!q.alt_answer_risk.trim()) b.push(['warn', '別解未検討']);
  if (q.verdict) b.push(q.verdict.has_alternate_answer ? ['bad', 'AI: 別解の疑い'] : ['good', 'AI: 別解なし']);
  if (!b.length) b.push(['good', 'OK']);
  return b.map(([c, t]) => h('span', { class: 'badge ' + c }, c === 'good' ? icon('check', 12) : c === 'bad' ? icon('alert', 12) : null, t));
}

/** 選択式の大問の正解の分布（偏っていれば警告色） */
function balanceChip(s) {
  const counts = answerBalance(s);
  const keys = Object.keys(counts);
  const n = s.questions.filter(q => q.choices?.length).length;
  if (n < 3 || !keys.length) return null;
  const top = Math.max(...Object.values(counts));
  const bad = keys.length === 1 || (n >= 8 && top > n / 2);
  return h('span', { class: 'pill balance' + (bad ? ' warn' : ''), title: '正解の記号の出現回数（偏りの確認用）' },
    '正解の分布 ', keys.sort().map(k => `${k}:${counts[k]}`).join(' '));
}

/** 選択肢の順番を入れ替えて、正解の位置を均等にする */
function balanceAnswers(s) {
  const qs = s.questions.filter(q => q.choices?.length > 1 && Number.isInteger(q.correct));
  if (!qs.length) return toast('正解が設定された選択式の問題がありません', 'error');
  const k = Math.min(...qs.map(q => q.choices.length));
  const pos = qs.map((_, i) => i % k);
  for (let i = pos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pos[i], pos[j]] = [pos[j], pos[i]]; }
  qs.forEach((q, i) => {
    const right = q.choices.splice(q.correct, 1)[0];
    q.choices.splice(pos[i], 0, right);
    q.correct = pos[i];
  });
  syncChoiceAnswers(s);
  markDirty(); render({ keepScroll: true });
  toast('正解の位置をならしました（選択肢の中身は変わっていません）', 'ok');
}

async function clearSection(s) {
  if (!await confirmBox(`${s.label}の問題${s.questions.length}問をすべて削除しますか？`, { ok: '削除する', danger: true })) return;
  s.questions = [];
  markDirty(); render({ keepScroll: true });
}

function slotRow(slots, labels) {
  return h('div', { class: 'slot-row' }, slots.map((x, i) =>
    h('div', { class: 'slot' }, h('small', {}, labels?.[i] || `枠${i + 1}`), h('span', {}, x))));
}

/** 問題の見た目（カード・クイック作問のプレビューで共通） */
function questionLook(s, q, num) {
  const lines = (q.body || (q.script || q.choices?.length ? '' : '（問題文が空です）')).split('\n');
  const labels = num?.slots || q.slot_labels || [];
  const rl = reorderLine(q, labels);
  return [
    lines[0] || q.script ? h('div', {}, rich(lines[0] || '')) : null,
    lines.slice(1).map(l => h('div', { class: 'line2' }, rich(l))),
    rl ? h('div', { class: 'line2 rline' }, rl) : null,
    q.choices?.length ? h('div', { class: 'q-choices' }, choiceLine(s.choice_style, q.choices).map((c, i) =>
      h('span', { class: i === q.correct ? 'right' : '' }, c))) : null,
    q.script ? h('div', { class: 'q-script' }, h('span', { class: 'tag gray' }, '放送'), q.script) : null,
  ];
}

/** 問題カード。ふだんは仕上がりの見た目だけ、「編集」で入力欄を開く */
function questionCard(s, si, q, qi, num) {
  const open = S.openQ.has(q);
  const badges = h('div', { class: 'badges' }, qBadges(q));
  const odd = q.points != null && q.points !== '' && +q.points !== +s.points_each;
  const look = h('div', { class: 'q-look' }, questionLook(s, q, num),
    h('div', { class: 'q-ans' }, h('span', { class: 'tag' }, '解答'), q.answer || '—',
      odd ? h('span', { class: 'pill' }, `この問 ${q.points}点`) : null,
      h('span', { class: 'q-src' }, '出典: ' + (q.source_ref || '（未入力）'))));
  const refresh = () => { badges.replaceChildren(...qBadges(q)); markDirty(); };
  const redraw = () => { markDirty(); render({ keepScroll: true }); };
  const move = d => { const a = s.questions; [a[qi], a[qi + d]] = [a[qi + d], a[qi]]; renumber(); markDirty(); render({ keepScroll: true }); };
  const toggle = () => { open ? S.openQ.delete(q) : S.openQ.add(q); render({ keepScroll: true }); };

  const verdict = q.verdict ? h('div', { class: 'verdict ' + (q.verdict.has_alternate_answer ? 'bad' : 'good') },
    icon(q.verdict.has_alternate_answer ? 'alert' : 'check', 16),
    h('div', {}, h('b', {}, q.verdict.has_alternate_answer ? 'AIが別解の可能性を指摘しました' : 'AIチェック: 別解は見つかりませんでした'),
      q.verdict.explanation, q.verdict.has_alternate_answer && q.verdict.suggested_fix ? h('div', {}, '修正案: ' + q.verdict.suggested_fix) : null)) : null;

  const byChoice = q.choices?.length && Number.isInteger(q.correct);
  const wantScript = SCRIPT_TYPES.has(s.type) || q.script != null && q.script !== '';
  const editor = open ? h('div', { class: 'q-edit' },
    field('問題文（1行目に日本語訳、2行目以降に英文など。__語句__ で下線）',
      textarea({ value: q.body, rows: Math.min(6, Math.max(2, q.body.split('\n').length + 1)), cls: 'inp qbody', oninput: v => { q.body = v; refresh(); } })),
    q.choices ? choicesEditor(s, q, refresh, redraw) : null,
    wantScript ? field('放送文（模範解答にだけ載ります）', textarea({ value: q.script || '', rows: 2, cls: 'inp en', placeholder: '例: curious', oninput: v => { q.script = v; refresh(); } })) : null,
    h('div', { class: 'qgrid' },
      field(byChoice ? '解答（●の選択肢で自動）' : '解答（模範解答に表示）', input({ value: q.answer, readonly: byChoice || null, oninput: v => { q.answer = v; refresh(); } })),
      field('解答枠（枠ごとに / で区切る・1枠1語）', input({ value: (q.answer_slots || []).join(' / '), placeholder: '空欄なら解答を1枠として扱います', readonly: byChoice || null,
        oninput: v => { const parts = v.split('/').map(x => x.trim()).filter(Boolean); q.answer_slots = parts.length ? parts : undefined; refresh(); } })),
      field('出典（必須）', input({ value: q.source_ref, placeholder: '例: L3 Part3①(6)／例文54', oninput: v => { q.source_ref = v; refresh(); } })),
      field('別解の検討メモ', input({ value: q.alt_answer_risk, placeholder: '例: is to get をチャンク化して文頭移動の別解を防止', oninput: v => { q.alt_answer_risk = v; refresh(); } })),
      field('配点（この問だけ変える場合）', input({ type: 'number', min: 0, value: q.points ?? '', placeholder: `${s.points_each}（大問の配点）`,
        oninput: v => { if (v === '') delete q.points; else q.points = toInt(v, 0); refresh(); refreshLive(); } }))),
    slotRow(slotsOf(q), num?.slots || q.slot_labels),
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '10px' } },
      h('div', { class: 'row' },
        q.choices ? null : h('button', { class: 'btn ghost sm', onclick: () => { q.choices = ['', '', '', '']; delete q.correct; redraw(); } }, icon('list', 13), '選択肢を付ける'),
        wantScript ? null : h('button', { class: 'btn ghost sm', onclick: () => { q.script = ' '; redraw(); } }, icon('type', 13), '放送文を付ける'),
        q.reorder ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: q.reorder.line, onchange: e => { q.reorder.line = e.target.checked; redraw(); } }),
          '解答位置の行（ ( 34 ) の形）を出す') : null),
      h('button', { class: 'btn primary sm', onclick: toggle }, icon('check', 14), '編集を閉じる'))) : null;

  return h('div', { class: 'qcard' + (open ? ' open' : ''), id: `q-${si}-${qi}` },
    h('div', { class: 'qhead' },
      h('span', { class: 'qnum' }, num?.slots ? `${num.label} → ${num.slots.join('・')}` : (num?.label || `(${q.number})`)), badges,
      h('div', { class: 'qactions' },
        h('button', { class: 'btn ghost sm', onclick: toggle }, icon('edit', 13), open ? '閉じる' : '編集'),
        S.status.ai ? iconBtn('sparkles', 'AIで別解チェック', () => verifyOne(s, si, q, qi)) : null,
        iconBtn('up', '上へ', () => move(-1), { disabled: qi === 0 }),
        iconBtn('down', '下へ', () => move(1), { disabled: qi === s.questions.length - 1 }),
        iconBtn('copy', '複製', () => { s.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); renumber(); markDirty(); render({ keepScroll: true }); }),
        iconBtn('trash', '削除', async () => {
          if (!await confirmBox(`${s.label}の(${q.number})を削除しますか？`, { ok: '削除する', danger: true })) return;
          s.questions.splice(qi, 1); renumber(); markDirty(); render({ keepScroll: true });
        }, { danger: true }))),
    open ? null : look, editor, verdict);
}

/** 選択肢の編集欄（●で正解を選ぶ） */
function choicesEditor(s, q, refresh, redraw) {
  const name = 'c' + Math.random().toString(36).slice(2, 8);
  const setCorrect = i => { q.correct = i; syncChoiceAnswers({ ...s, questions: [q] }); redraw(); };
  return h('div', { class: 'choice-edit' },
    h('div', { class: 'choice-head' }, h('span', {}, '選択肢（●が正解。記号は大問の設定で変更）'),
      h('button', { class: 'link small', onclick: () => { q.choices.push(''); redraw(); } }, '＋ 追加'),
      h('button', { class: 'link small', onclick: () => {
        const right = Number.isInteger(q.correct) ? q.choices[q.correct] : null;
        const order = shuffled(q.choices.length);
        q.choices = order.map(k => q.choices[k]);
        if (right != null) setCorrect(q.choices.indexOf(right)); else redraw();
      } }, 'シャッフル'),
      h('button', { class: 'link small danger', onclick: () => { delete q.choices; delete q.correct; redraw(); } }, '選択肢をやめる')),
    q.choices.map((c, i) => h('div', { class: 'choice-row' + (q.correct === i ? ' right' : '') },
      h('input', { type: 'radio', name, checked: q.correct === i, title: 'これを正解にする', onchange: () => setCorrect(i) }),
      h('span', { class: 'cmark' }, markOf(s.choice_style, i)),
      input({ value: c, cls: 'inp en', oninput: v => { q.choices[i] = v; refresh(); } }),
      iconBtn('x', 'この選択肢を削除', () => {
        q.choices.splice(i, 1);
        if (q.correct === i) delete q.correct; else if (q.correct > i) q.correct--;
        if (Number.isInteger(q.correct)) syncChoiceAnswers({ ...s, questions: [q] });
        redraw();
      }, { disabled: q.choices.length <= 2 }))));
}

function addBlankQuestion(si) {
  const s = S.project.sections[si];
  const q = { body: '', answer: '', source_ref: '', alt_answer_risk: '', focus: '', kind: s.type, number: 0 };
  s.questions.push(q);
  S.openQ.add(q);
  renumber(); markDirty();
  S.highlight = { si, qi: s.questions.length - 1 };
  render({ keepScroll: true });
}

async function verifyOne(s, si, q, qi) {
  toast(`${s.label}の(${q.number})をチェック中…`);
  try {
    const r = await api('POST', 'ai/verify_one', { question: q, type: s.type });
    q.verdict = r.verdict; markDirty();
    S.highlight = { si, qi }; render({ keepScroll: true });
    toast(r.verdict.has_alternate_answer ? '別解の可能性があります。内容を確認してください' : '別解は見つかりませんでした',
      r.verdict.has_alternate_answer ? 'error' : 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function aiSection(si) {
  const s = S.project.sections[si];
  if (!sectionMaterials(s).length) return toast(`${s.label}に素材を入れてから使ってください`, 'error');
  if (!await confirmBox(`${s.label}（${SHORT[s.type]}）を、この大問の素材からAI（${aiName()}）で${s.count}問作ります。\n作成された問題は末尾に追加されます（数十秒かかります）。`, { ok: '作問する' })) return;
  await flushSave();
  toast('AIが作問しています…（そのままお待ちください）');
  try {
    const r = await api('POST', 'ai/section', { pid: S.project.id, index: si });
    r.questions.forEach(q => s.questions.push({ ...q, focus: '', kind: s.type }));
    renumber(); markDirty(); render({ keepScroll: true });
    toast(`${r.questions.length}問を追加しました` + (r.dropped ? `（出典のない${r.dropped}問は破棄）` : '') + `　${r.cost}`, 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

// ================================================================ クイック作問

/** 英文を語と記号に分ける。元の文字位置を保持し、本文を一切書き換えずに問題を組み立てる */
function tokenize(text) {
  const toks = [];
  const re = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]/g;
  let m;
  while ((m = re.exec(text))) toks.push({ t: m[0], s: m.index, e: m.index + m[0].length, word: /[A-Za-z0-9]/.test(m[0]) });
  return toks;
}

/** 選んだ語（marks）が連続しているか。間に記号しかなければ連続とみなす */
function selRange(marks, toks) {
  const idx = Object.keys(marks).filter(k => marks[k]).map(Number).sort((a, b) => a - b);
  if (!idx.length) return null;
  for (let i = 1; i < idx.length; i++) {
    for (let k = idx[i - 1] + 1; k < idx[i]; k++) if (toks[k].word) return { bad: true };
  }
  return { a: idx[0], b: idx[idx.length - 1] };
}

function shuffled(n) {
  const a = [...Array(n).keys()];
  for (let tries = 0; tries < 20; tries++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (n < 3 || a.some((v, i) => v !== i)) break;
  }
  return a;
}

function lowerFirst(t) {
  if (/^I\b/.test(t) || /^[A-Z]{2}/.test(t)) return t;  // I / 略語はそのまま
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function buildFill(Q, toks) {
  let out = '', pos = 0;
  const slots = [], warns = [];
  toks.forEach((tk, i) => {
    let gap = Q.text.slice(pos, tk.s);
    if (i > 0 && Q.marks[i] && Q.marks[i - 1] && !gap.trim()) gap = '';
    out += gap;
    const m = Q.marks[i];
    if (m) {
      slots.push(tk.t);
      out += m === 2 ? `（ ${tk.t[0]}　　　 ）` : '（　　　　　）';
      if (m === 1 && tk.t.length >= 6) warns.push({ lvl: 'info', msg: `「${tk.t}」は類義語の別解が出やすい長さです。必要なら頭文字ヒント（もう一度クリック）を付けてください` });
    } else out += tk.t;
    pos = tk.e;
  });
  out += Q.text.slice(pos);
  return { body: out, slots, warns };
}

function reorderParts(Q, toks) {
  let end = toks.length;
  while (end > 0 && !toks[end - 1].word && /[.?!。？！"”’)]/.test(toks[end - 1].t)) end--;
  const final = end < toks.length ? Q.text.slice(toks[end].s, toks[toks.length - 1].e) : '';
  const units = [];
  for (let i = 0; i < end; i++) {
    const tk = toks[i];
    if (tk.word || !units.length) units.push({ s: tk.s, e: tk.e });
    else units[units.length - 1].e = tk.e;  // カンマ等は直前の語にくっつける
  }
  return { units: units.map(u => Q.text.slice(u.s, u.e)), final };
}

function buildReorder(Q, toks) {
  const res = { warns: [] };
  const { units, final } = reorderParts(Q, toks);
  const R = Q.R, n = units.length;
  const pre = Math.min(R.prefix, n), suf = Math.min(R.suffix, n - pre);
  const chunks = [];
  for (let i = pre; i < n - suf; i++) {
    if (chunks.length && R.joins[i - 1]) chunks[chunks.length - 1].push(i); else chunks.push([i]);
  }
  const texts = chunks.map(c => {
    const t = c.map(i => units[i]).join(' ');
    return R.lower && pre === 0 && c[0] === 0 ? lowerFirst(t) : t;
  });
  const extra = (R.extra || '').trim();
  const all = extra ? [...texts, extra] : texts;  // 不要語は選択肢にだけ入る（本文は変えない）
  const key = JSON.stringify(chunks) + '|' + extra;
  if (R.key !== key || !R.order || R.order.length !== all.length) { R.order = shuffled(all.length); R.key = key; }
  // 選択肢の見せ方: 語句のまま / 番号（1. 2. …） / 記号（ア イ …）
  const lab = k => R.style === 'num' ? String(k + 1) : R.style === 'mark' ? markOf('ア', k) : null;
  const items = R.order.map((k, d) => lab(d) ? `${lab(d)}${R.style === 'num' ? '.' : ''} ${all[k]}` : all[k]);
  const before = units.slice(0, pre).join(' '), after = `${units.slice(n - suf).join(' ')}${final}`.trim();
  // 解答位置の行を出すときは、問題文には選択肢だけを置く（行は「I will (　) ( 34 ) … from」の形で別に出る）
  res.body = R.line ? `［ ${items.join('　')} ］` : `${before}（ ${items.join(' / ')} ）${units.slice(n - suf).join(' ')}${final}`;
  res.units = units; res.pre = pre; res.suf = suf; res.texts = texts; res.chunks = chunks;

  const p1 = R.p1, p2 = R.p2;
  if (texts.length < 3) res.error = '並べ替える語句が少なすぎます（3つ以上にしてください）';
  else if (Math.max(p1, p2) > texts.length || Math.min(p1, p2) < 1) res.error = `語句が${texts.length}個しかないので、${Math.max(p1, p2)}番目は答えさせられません`;
  else if (p1 === p2) res.error = '答えさせる2か所は別の位置にしてください';
  else {
    const ans = pos => { const d = R.order.indexOf(pos - 1); return lab(d) || texts[pos - 1]; };
    res.slots = [ans(p1), ans(p2)];
    res.answer = res.slots.join(' / ');
    res.labels = [`${p1}番目`, `${p2}番目`];
    res.reorder = { line: !!R.line, n: texts.length, pos: [p1, p2], before, after };
  }
  if (extra) {
    if (texts.some(t => t.toLowerCase() === extra.toLowerCase())) res.warns.push({ lvl: 'warn', msg: `不要語「${extra}」が並べ替える語句と同じです。別の語にしてください` });
    else res.warns.push({ lvl: 'info', msg: `不要語「${extra}」を選択肢に加えました（本文にない語です。この語を使った別の正しい文ができないか確認してください）` });
  }
  texts.forEach((t, k) => {
    const low = t.toLowerCase();
    if (low === 'to' || low.startsWith('to ')) res.warns.push({ lvl: 'warn', msg: `「${t}」が独立しています。不定詞句は文頭に移動できるため別解の原因になります（例: To get enough sleep is what you need）。前の語と「つなげる」でチャンク化を検討してください` });
    if (FREE_ADVERBS.has(low)) res.warns.push({ lvl: 'warn', msg: `副詞「${t}」は置ける位置が複数あり、別解の原因になりがちです` });
    if (texts.findIndex(x => x.toLowerCase() === low) !== k) res.warns.push({ lvl: 'info', msg: `同じ語句「${t}」が複数あります。解答が一意か確認してください` });
  });
  if (!res.warns.length && !res.error) res.warns.push({ lvl: 'info', msg: '自動チェックでは別解の原因は見つかりませんでした。最終確認は必ず教員が行ってください' });
  return res;
}

/** 誤文訂正。下線を引く語句（ア・イ・ウ）を選び、1か所を誤りにする */
function buildError(Q, toks) {
  const res = { body: Q.text, answer: '', slots: [], labels: ['誤りの箇所', '正しい形'], warns: [], error: null };
  const E = Q.E;
  const groups = [...E.groups].sort((x, y) => x.a - y.a);
  if (groups.length < 2) { res.error = '下線を引く語句を2つ以上（ふつうは3つ）選んでください'; return res; }
  const err = Math.min(E.err, groups.length - 1);
  let out = '', pos = 0, orig = '';
  groups.forEach((g, k) => {
    const text = Q.text.slice(toks[g.a].s, toks[g.b].e);
    const shown = k === err ? (E.wrong.trim() || text) : text;
    if (k === err) orig = text;
    out += Q.text.slice(pos, toks[g.a].s) + `${markOf('ア', k)}__${shown}__`;
    pos = toks[g.b].e;
  });
  res.body = out + Q.text.slice(pos);
  const wrong = E.wrong.trim() || orig, fix = E.fix.trim() || orig;
  if (wrong.toLowerCase() === fix.toLowerCase()) { res.error = '「問題に出す誤りの形」か「正しい形」を入力してください'; return res; }
  res.slots = [markOf('ア', err), fix];
  res.answer = res.slots.join(' / ');
  res.edit = E.wrong.trim() ? `元の文の「${orig}」を「${wrong}」に変えて出題（誤りの箇所として教員が指定）` : '';
  res.warns.push({ lvl: 'info', msg: 'ほかの下線部が確実に正しいか（誤りが1か所だけか）、必ず確認してください' });
  return res;
}

function buildQuick(Q, toks) {
  const res = { body: '', answer: '', slots: [], labels: null, warns: [], error: null };
  const f = Q.format;
  if (f === 'ai') {
    if (!Q.ai.result) { res.pending = true; return res; }
    const r = Q.ai.result;
    Object.assign(res, { body: r.body || '', answer: r.answer || '', slots: slotsOf({ answer: r.answer || '', answer_slots: r.answer_slots }), fromAI: true, verdict: r.verdict });
    if (!res.body || !res.answer) res.error = 'AIの結果に問題文か解答がありません';
  } else if (f === 'content_match') {
    // 内容一致: 選択肢の文は教員が書く（根拠は本文。本文そのものは変えない）
    const opts = Q.M.opts.map(x => x.trim());
    res.body = Q.M.stem.trim();
    res.choices = opts; res.correct = Q.M.correct;
    res.answer = markOf(Q.style || '1', Q.M.correct); res.slots = [res.answer];
    if (!res.body) res.error = '設問文を入力してください';
    else if (opts.filter(Boolean).length < 2 || opts.some(x => !x)) res.error = '選択肢をすべて入力してください';
    else if (new Set(opts.map(x => x.toLowerCase())).size < opts.length) res.error = '選択肢が重複しています';
    else res.warns.push({ lvl: 'info', msg: '正解の選択肢は本文のどこが根拠か、誤りの選択肢は本文のどこと食い違うか、別解の検討メモに書いておくと安心です' });
  } else if (!Q.text.trim()) {
    res.error = '対象の英文を入力してください（教材画面で文をクリックすると自動で入ります）';
    return res;
  } else if (f === 'fill_blank') {
    const r = buildFill(Q, toks);
    res.body = r.body; res.warns = r.warns;
    if (!r.slots.length) res.error = '空所にしたい語をクリックしてください';
    else { res.slots = r.slots; res.answer = r.slots.join(' '); }
  } else if (f === 'reorder_2nd_5th') {
    Object.assign(res, buildReorder(Q, toks));
  } else if (f === 'error_correction') {
    Object.assign(res, buildError(Q, toks));
  } else {
    const rg = selRange(Q.marks, toks);
    const cut = (a, b, repl) => Q.text.slice(0, toks[a].s) + repl + Q.text.slice(toks[b].e);
    const picked = rg && !rg.bad ? Q.text.slice(toks[rg.a].s, toks[rg.b].e) : '';
    if (rg?.bad) { res.error = '連続した語句を選んでください'; res.body = Q.text; }
    else if (f === 'choice_4') {
      if (!rg) { res.error = '空所にする語句をクリックしてください'; res.body = Q.text; }
      else {
        const ds = Q.C.d.map(x => x.trim());
        const choices = [...ds]; choices.splice(Q.C.pos, 0, picked);
        const mk = markOf(Q.style || 'ア', Q.C.pos);
        res.body = cut(rg.a, rg.b, '（　　　　）');
        res.choices = choices; res.correct = Q.C.pos;
        res.answer = mk; res.slots = [mk];
        if (ds.some(x => !x)) res.error = '誤答の選択肢を3つ入力してください';
        else if (new Set(choices.map(c => c.toLowerCase())).size < 4) res.error = '選択肢が重複しています';
      }
    } else if (f === 'word_form') {
      if (!rg) { res.error = '形を変えさせる語をクリックしてください'; res.body = Q.text; }
      else if (rg.a !== rg.b) { res.error = '語形変化は1語だけ選んでください'; res.body = Q.text; }
      else {
        const base = Q.base.trim();
        res.body = cut(rg.a, rg.b, `（ ${base || '原形'} ）`);
        res.answer = picked; res.slots = [picked];
        if (!base) res.error = '（　）内に示す原形を入力してください';
        else if (base.toLowerCase() === picked.toLowerCase()) res.error = '原形と答えが同じです。形を変える必要がある語を選んでください';
      }
    } else if (f === 'underline_grammar' || f === 'translation') {
      if (!rg && f === 'underline_grammar') { res.error = '下線を引く語句をクリックしてください'; res.body = Q.text; }
      else {
        res.body = rg ? cut(rg.a, rg.b, `__${picked}__`) : Q.text;
        if (Q.prompt.trim()) res.body += '\n' + Q.prompt.trim();
        res.answer = Q.answerText.trim(); res.slots = [res.answer];
        if (!res.answer) res.error = '模範解答を入力してください';
      }
    }
  }
  if (!res.error && !Q.source.trim()) res.error = '出典を入力してください（教材にない文の出題を防ぐため必須です）';
  return res;
}

/** 通し番号のとき、大問 si の末尾に問題を足した場合に振られる番号（k個） */
function nextNumbers(p, si, k) {
  let last = 0;
  numberPlan(p).slice(0, si + 1).forEach(rows => rows.forEach(r => {
    const v = r.slots ? +r.slots[r.slots.length - 1] : parseInt(r.cell, 10);
    if (v > last) last = v;
  }));
  return [...Array(k)].map((_, i) => String(last + 1 + i));
}

function defaultTarget(fmt) {
  const secs = S.project.sections;
  if (S.step === 'build' && secs[S.secIdx]) return S.secIdx;  // 大問をつくる画面では、いま開いている大問に入れる
  const i = secs.findIndex(s => s.type === fmt || (fmt === 'reorder_4th_8th' && s.type === 'reorder_2nd_5th'));
  if (i >= 0) return i;
  // 下線部と和訳は同じ大問（英文解釈）に入れることが多い
  const near = { underline_grammar: 'translation', translation: 'underline_grammar' }[fmt];
  const j = near ? secs.findIndex(s => s.type === near) : -1;
  return j >= 0 ? j : 'new';
}

function openQuick(init = {}) {
  hideFab();
  const p = S.project;
  const Q = {
    text: (init.text || '').trim(), ja: '', source: init.source || '', focus: '',
    format: init.format || 'fill_blank', marks: {},
    R: { prefix: 0, suffix: 0, joins: {}, order: null, key: '', p1: 2, p2: 5, lower: true,
      style: p.exam.numbering === 'global' ? 'num' : 'text', extra: '', line: p.exam.numbering === 'global' },
    C: { d: ['', '', ''], pos: Math.floor(Math.random() * 4) },
    E: { groups: [], pending: null, err: 0, wrong: '', fix: '' },
    M: { stem: '本文の内容と一致するものを1つ選びなさい。', opts: ['', '', '', ''], correct: 0 },
    base: '', prompt: '', answerText: '', alt: '', altTouched: false,
    ai: { fmt: 'reorder_2nd_5th', note: '', result: null, busy: false, prompt: '', paste: '' },
  };
  if (init.format === 'ai' && init.target != null && p.sections[init.target]) {
    const t = p.sections[init.target].type;
    if (AI_FORMATS.some(([v]) => v === t)) Q.ai.fmt = t;
  }
  Q.target = init.target ?? defaultTarget(Q.format === 'ai' ? Q.ai.fmt : Q.format);

  const fmtTabs = h('div', { class: 'seg', role: 'tablist' });
  const builderBox = h('div');
  const previewBox = h('div', { class: 'qk-right' });
  let built = null;

  const drawPreview = () => {
    Q.style = p.sections[Q.target]?.choice_style || DEFAULT_STYLE.choice_4;  // 選択肢の記号は追加先の大問に合わせる
    built = buildQuick(Q, tokenize(Q.text));
    previewBox.replaceChildren(quickPreview());
  };
  const drawAll = () => {
    fmtTabs.replaceChildren(...QUICK_FORMATS.map(([v, l, ic]) => h('button', {
      class: 'seg-btn' + (Q.format === v ? ' on' : ''), role: 'tab',
      onclick: () => {
        if (Q.format === v) return;
        Q.format = v; Q.marks = {};
        Q.target = defaultTarget(v === 'ai' ? Q.ai.fmt : v);
        drawAll();
      },
    }, icon(ic, 14), l)));
    builderBox.replaceChildren(builder());
    drawPreview();
  };

  // ---- 形式ごとの操作パネル
  function tokenRow(toks, cls, onClick) {
    return h('div', { class: 'toks' }, toks.map((tk, i) => tk.word
      ? h('button', { class: 'tok ' + (cls(i) || ''), onclick: () => onClick(i) }, tk.t)
      : h('span', { class: 'tok punct' }, tk.t)));
  }
  function hint(text) { return h('div', { class: 'hint' }, icon('sparkles', 14), h('span', {}, text)); }

  function builder() {
    const toks = tokenize(Q.text);
    const box = h('div', { class: 'builder' });
    // 範囲選択: 最初の語と最後の語を押すと間がまとめて選ばれる。端を押すと1語ずつ縮む
    const pickRange = i => {
      const idx = Object.keys(Q.marks).map(Number).sort((a, b) => a - b);
      if (!idx.length) Q.marks = { [i]: true };
      else {
        const a = idx[0], b = idx[idx.length - 1];
        if (i < a || i > b) {
          Q.marks = {};
          for (let k = Math.min(a, i); k <= Math.max(b, i); k++) if (toks[k].word) Q.marks[k] = true;
        } else if (i === a || i === b) delete Q.marks[i];
        else Q.marks = { [i]: true };
      }
      drawAll();
    };
    if (Q.format === 'content_match') {
      const M = Q.M;
      const name = 'cm' + Math.random().toString(36).slice(2, 7);
      box.append(hint('本文の内容と一致する選択肢（正解）と、食い違う選択肢を書き、●で正解を選びます。上の英文欄は本文のメモとして使えます（空でも可）。'),
        field('設問文', input({ value: M.stem, oninput: v => { M.stem = v; drawPreview(); } })),
        h('div', { class: 'choice-edit' }, M.opts.map((o, k) => h('div', { class: 'choice-row' + (M.correct === k ? ' right' : '') },
          h('input', { type: 'radio', name, checked: M.correct === k, onchange: () => { M.correct = k; drawAll(); } }),
          h('span', { class: 'cmark' }, markOf(Q.style || '1', k)),
          input({ value: o, cls: 'inp en', placeholder: k === M.correct ? '本文と一致する文（正解）' : '本文と食い違う文', oninput: v => { M.opts[k] = v; drawPreview(); } }),
          iconBtn('x', '削除', () => { M.opts.splice(k, 1); if (M.correct >= M.opts.length) M.correct = 0; drawAll(); }, { disabled: M.opts.length <= 2 }))),
          h('button', { class: 'link small', onclick: () => { M.opts.push(''); drawAll(); } }, '＋ 選択肢を追加')));
      return box;
    }
    if (Q.format !== 'ai' && !toks.some(t => t.word)) {
      box.append(hint('上の欄に英文を入れてください。教材画面で文をクリックすると、ここに自動で入ります。'));
      return box;
    }
    switch (Q.format) {
      case 'fill_blank':
        box.append(hint('空所にしたい語をクリック。もう一度クリックすると頭文字ヒント付き、3回目で解除。'),
          h('div', { class: 'legend' }, h('span', {}, h('i', { style: { background: 'var(--accent)' } }), '空所'), h('span', {}, h('i', { style: { background: 'var(--teal)' } }), '空所＋頭文字ヒント（別解防止）')),
          tokenRow(toks, i => Q.marks[i] === 2 ? 'hint' : Q.marks[i] ? 'blank' : '',
            i => { Q.marks[i] = ((Q.marks[i] || 0) + 1) % 3; if (!Q.marks[i]) delete Q.marks[i]; drawAll(); }));
        break;
      case 'reorder_2nd_5th': box.append(...reorderBuilder(toks)); break;
      case 'choice_4': {
        box.append(hint('空所にする語をクリック。複数語なら最初と最後の語をクリックします。そのあと誤答を3つ入れてください。'),
          tokenRow(toks, i => Q.marks[i] ? 'sel' : '', pickRange),
          h('div', { class: 'grid-3' }, Q.C.d.map((d, k) => field(`誤答${k + 1}`, input({ value: d, cls: 'inp en', oninput: v => { Q.C.d[k] = v; drawPreview(); } })))),
          h('div', { class: 'ctrl-row' }, h('span', {}, '正解の位置'),
            h('div', { class: 'seg' }, [0, 1, 2, 3].map(k => h('button', { class: 'seg-btn' + (Q.C.pos === k ? ' on' : ''), onclick: () => { Q.C.pos = k; drawAll(); } }, markOf(Q.style, k)))),
            h('button', { class: 'btn ghost sm', onclick: () => { Q.C.pos = Math.floor(Math.random() * 4); drawAll(); } }, icon('shuffle', 14), 'ランダム')));
        break;
      }
      case 'error_correction': box.append(...errorBuilder(toks)); break;
      case 'word_form':
        box.append(hint('形を変えさせる語を1つクリックし、（　）内に示す原形を入れてください。'),
          tokenRow(toks, i => Q.marks[i] ? 'sel' : '', i => { Q.marks = Q.marks[i] ? {} : { [i]: true }; drawAll(); }),
          field('（　）内に示す原形', input({ value: Q.base, cls: 'inp en', placeholder: '例: make', oninput: v => { Q.base = v; drawPreview(); } })));
        break;
      case 'underline_grammar':
      case 'translation': {
        const isTr = Q.format === 'translation';
        box.append(hint((isTr ? '下線部和訳にする範囲の、最初と最後の語をクリック（何も選ばなければ全文和訳）。' : '下線を引く範囲の、最初と最後の語をクリック。') + '端の語をもう一度押すと1語ずつ縮みます。'),
          tokenRow(toks, i => Q.marks[i] ? 'under' : '', pickRange),
          field('設問（問題文の下に表示・任意）', isTr ? input({ value: Q.prompt, placeholder: '例: 下線部を和訳しなさい（大問の指示文にあれば空欄でOK）', oninput: v => { Q.prompt = v; drawPreview(); } })
            : select([['', '（大問の指示文に任せる）'], ['下線部を和訳しなさい。', '下線部を和訳しなさい。'], ['下線部の文法的な働きを説明しなさい。', '下線部の文法的な働きを説明しなさい。'],
              ['下線部とほぼ同じ意味になるように書き換えなさい。', '下線部とほぼ同じ意味になるように書き換えなさい。'], ['下線部が指す内容を日本語で説明しなさい。', '下線部が指す内容を日本語で説明しなさい。']],
            Q.prompt, v => { Q.prompt = v; drawPreview(); })),
          field(isTr ? '模範訳' : '模範解答', textarea({ value: Q.answerText, rows: 2, oninput: v => { Q.answerText = v; drawPreview(); } })));
        break;
      }
      case 'ai': box.append(...aiBuilder()); break;
    }
    return box;
  }

  function reorderBuilder(toks) {
    const R = Q.R;
    const b = buildReorder(Q, toks);
    const n = b.units.length;
    const row = h('div', { class: 'toks' });
    b.units.forEach((u, i) => {
      const fixed = i < b.pre || i >= n - b.suf;
      row.append(h('button', { class: 'tok' + (fixed ? ' fixed' : ''), title: fixed ? 'クリックで固定を解除' : 'クリックで（　）の外に固定', onclick: () => {
        if (i < b.pre) R.prefix = i;
        else if (i >= n - b.suf) R.suffix = n - 1 - i;
        else if (i - b.pre <= (n - b.suf - 1) - i) R.prefix = i + 1;
        else R.suffix = n - i;
        drawAll();
      } }, u));
      if (i < n - 1) {
        const inside = i >= b.pre && i + 1 < n - b.suf;
        row.append(inside
          ? h('button', { class: 'joiner' + (R.joins[i] ? ' on' : ''), title: R.joins[i] ? 'チャンクを解除' : '前後の語をひとまとまり（チャンク）にする', onclick: () => { R.joins[i] = !R.joins[i]; if (!R.joins[i]) delete R.joins[i]; drawAll(); } }, R.joins[i] ? '⌒' : '+')
          : h('span', { class: 'gap-sp' }));
      }
    });
    return [
      hint('語をクリックすると（　）の外に固定（文頭・文末から連続）。語の間の「＋」でチャンク（ひとまとまり）にできます。'),
      row,
      h('div', { class: 'fld' }, h('span', {}, `並べ替える語句（${b.texts.length}個）`),
        h('div', { class: 'chunks' }, b.texts.map((t, k) => h('span', { class: 'chunk' + (b.chunks[k].length > 1 ? ' multi' : '') }, t)))),
      h('div', { class: 'ctrl-row' },
        h('span', {}, '答えさせる位置'),
        input({ type: 'number', min: 1, value: R.p1, cls: 'inp num', oninput: v => { R.p1 = toInt(v, 1); drawPreview(); } }), h('span', {}, '番目 と'),
        input({ type: 'number', min: 1, value: R.p2, cls: 'inp num', oninput: v => { R.p2 = toInt(v, 1); drawPreview(); } }), h('span', {}, '番目'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: R.lower, onchange: e => { R.lower = e.target.checked; drawAll(); } }), '文頭の語を小文字にする'),
        h('button', { class: 'btn ghost sm', onclick: () => { R.order = null; R.key = ''; drawPreview(); } }, icon('shuffle', 14), 'シャッフル')),
      h('div', { class: 'ctrl-row' },
        h('span', {}, '答え方'),
        segmented([['text', '語句で'], ['num', '番号で（1. 2. …）'], ['mark', '記号で（ア イ …）']], R.style, v => { R.style = v; drawPreview(); }),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: R.line, onchange: e => { R.line = e.target.checked; drawPreview(); } }),
          '解答位置の行を出す（I will (　) ( 34 ) … の形）')),
      field('不要語（ダミーの選択肢・任意）', input({ value: R.extra, cls: 'inp en', placeholder: '例: do　（英語演習型の「１つ不要な選択肢」）', oninput: v => { R.extra = v; drawPreview(); } })),
    ];
  }

  function errorBuilder(toks) {
    const E = Q.E;
    const inGroup = i => E.groups.findIndex(g => i >= g.a && i <= g.b);
    const sorted = [...E.groups].sort((x, y) => x.a - y.a);
    const cls = i => {
      const k = inGroup(i);
      if (k >= 0) return sorted.indexOf(E.groups[k]) === Math.min(E.err, sorted.length - 1) ? 'blank' : 'under';
      return E.pending === i ? 'sel' : '';
    };
    const click = i => {
      const k = inGroup(i);
      if (k >= 0) E.groups.splice(k, 1);                         // 下線を外す
      else if (E.pending == null) E.pending = i;                  // 範囲の始まり
      else {
        const a = Math.min(E.pending, i), b = Math.max(E.pending, i);
        if (E.groups.some(g => g.a <= b && a <= g.b)) toast('ほかの下線と重なっています', 'error');
        else E.groups.push({ a, b });
        E.pending = null;
      }
      drawAll();
    };
    const orig = (() => { const g = sorted[Math.min(E.err, sorted.length - 1)]; return g ? Q.text.slice(toks[g.a].s, toks[g.b].e) : ''; })();
    return [
      hint('下線を引く語句の「最初の語」と「最後の語」を順にクリック（1語だけなら同じ語を2回）。下線はア・イ・ウ…の順に自動で振られます。下線をもう一度押すと外れます。'),
      tokenRow(toks, cls, click),
      sorted.length ? h('div', { class: 'ctrl-row' }, h('span', {}, '誤りにする箇所'),
        h('div', { class: 'seg' }, sorted.map((g, k) => h('button', { class: 'seg-btn' + (Math.min(E.err, sorted.length - 1) === k ? ' on' : ''),
          onclick: () => { E.err = k; drawAll(); } }, `${markOf('ア', k)} ${Q.text.slice(toks[g.a].s, toks[g.b].e)}`)))) : null,
      sorted.length ? h('div', { class: 'grid-2' },
        field(`問題に出す誤りの形（元の文: ${orig || '—'}）`, input({ value: E.wrong, cls: 'inp en', placeholder: '例: will be（元の文が正しい場合に入力）', oninput: v => { E.wrong = v; drawPreview(); } })),
        field('正しい形（解答）', input({ value: E.fix, cls: 'inp en', placeholder: orig ? `空欄なら「${orig}」` : '', oninput: v => { E.fix = v; drawPreview(); } }))) : null,
    ];
  }

  function aiBuilder() {
    const els = [
      h('div', { class: 'grid-2' },
        field('作りたい形式', select(AI_FORMATS, Q.ai.fmt, v => { Q.ai.fmt = v; Q.target = defaultTarget(v); drawPreview(); })),
        field('補足指示（任意）', input({ value: Q.ai.note, placeholder: '例: who が解答位置に来るように', oninput: v => { Q.ai.note = v; } }))),
    ];
    if (S.status.ai) {
      els.unshift(hint(aiName() + 'が対象文を無改変で使って作問し、別解チェックまで行います（10〜30秒）。'));
      els.push(h('button', { class: 'btn primary', disabled: Q.ai.busy || !Q.text.trim(), onclick: async () => {
        Q.ai.busy = true; drawAll();
        try {
          const r = await api('POST', 'ai/ask', { text: Q.text, format: Q.ai.fmt, focus: Q.focus, note: Q.ai.note });
          Q.ai.result = r.question;
          if (!Q.source.trim() && r.question.source_ref) Q.source = r.question.source_ref;
          toast('作問しました　' + r.cost, 'ok');
        } catch (e) { toast(e.message, 'error'); }
        Q.ai.busy = false; drawAll();
      } }, icon('sparkles'), Q.ai.busy ? '作問中…' : 'AIで作問する'));
    } else {
      const promptBox = textarea({ value: Q.ai.prompt, rows: 7, cls: 'inp prompt-box', readonly: true, placeholder: '「作問依頼文を作る」を押すと、ここに表示されます' });
      els.unshift(hint('API抜きモード：作問依頼文を Claude / Codex に貼り付け、返ってきた結果を下の欄に貼り付けると問題として取り込めます。'));
      els.push(
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost', disabled: !Q.text.trim(), onclick: async () => {
            try {
              const r = await api('POST', 'prompt', { text: Q.text, format: Q.ai.fmt, focus: Q.focus, note: Q.ai.note, source: Q.source });
              Q.ai.prompt = r.prompt; promptBox.value = r.prompt;
              await copyText(r.prompt, '作問依頼文をコピーしました。Claude / Codex に貼り付けてください');
            } catch (e) { toast(e.message, 'error'); }
          } }, icon('clipboard'), '作問依頼文を作ってコピー')),
        promptBox,
        field('返ってきた結果（JSON）を貼り付け', textarea({ value: Q.ai.paste, rows: 4, cls: 'inp prompt-box', placeholder: '{"body": "...", "answer": "..."}', oninput: v => { Q.ai.paste = v; } })),
        h('button', { class: 'btn primary', onclick: () => {
          try {
            const raw = Q.ai.paste;
            const obj = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
            if (!obj.body || !obj.answer) throw new Error('body と answer が必要です');
            Q.ai.result = obj;
            if (!Q.source.trim() && obj.source_ref) Q.source = obj.source_ref;
            if (obj.alt_answer_risk) { Q.alt = obj.alt_answer_risk; Q.altTouched = true; }
            drawAll();
            toast('取り込みました。プレビューを確認して追加してください', 'ok');
          } catch (e) { toast('取り込めませんでした: ' + e.message, 'error'); }
        } }, icon('download'), '結果を取り込む'));
    }
    return els;
  }

  // ---- 右側：プレビューと追加
  function autoAlt(warns) {
    if (built?.fromAI && built.verdict) return `【AIチェック】${built.verdict.has_alternate_answer ? '別解の疑いあり: ' : '別解なし: '}${built.verdict.explanation}`;
    const real = warns.filter(w => w.lvl !== 'info' || !w.msg.startsWith('自動チェックでは'));
    return real.length ? '【自動チェック】' + real.map(w => w.msg).join(' ／ ') : '【自動チェック】警告なし（最終確認は教員）';
  }

  function quickPreview() {
    const b = built;
    const secs = p.sections;
    const body = b.fromAI ? b.body : (Q.ja.trim() ? Q.ja.trim() + '\n' : '') + (b.body || Q.text);
    const sec = p.sections[Q.target] || { choice_style: Q.style };
    const pq = { body, choices: b.choices, correct: b.correct, reorder: b.reorder, slot_labels: b.labels };
    const targetOpts = [...secs.map((s, i) => [i, `${s.label}　${SHORT[s.type] || s.type}（${s.questions.length}/${s.count}問）`]), ['new', '＋ 新しい大問を作る']];
    const canAdd = !b.error && !b.pending && b.body;
    return h('div', { class: 'qk-card' },
      h('div', { class: 'qk-label' }, 'プレビュー'),
      b.pending ? h('div', { class: 'warn-box info' }, icon('sparkles', 14), S.status.ai ? '「AIで作問する」を押すと、ここに結果が出ます。' : '結果を貼り付けて取り込むと、ここに表示されます。') :
        h('div', { class: 'mini-paper qrow' }, h('span', { class: 'num' }, '(1)'), h('div', { class: 'grow' },
          questionLook(sec, pq, p.exam.numbering === 'global' && b.reorder && p.sections[Q.target] ? { slots: nextNumbers(p, Q.target, b.slots.length) } : null))),
      b.answer ? h('div', { class: 'ans-line' }, h('span', { class: 'tag' }, '解答'), b.answer) : null,
      b.slots.length && b.answer ? h('div', {}, h('div', { class: 'qk-label' }, '解答用紙の枠'), slotRow(b.slots, b.labels)) : null,
      b.error ? h('div', { class: 'warn-box error' }, icon('alert', 14), b.error) : null,
      b.verdict ? h('div', { class: 'warn-box ' + (b.verdict.has_alternate_answer ? 'warn' : 'ok') }, icon(b.verdict.has_alternate_answer ? 'alert' : 'check', 14),
        (b.verdict.has_alternate_answer ? 'AI: 別解の疑い — ' : 'AI: 別解なし — ') + b.verdict.explanation) : null,
      b.edit ? h('div', { class: 'warn-box warn' }, icon('alert', 14), '【改変箇所として記録されます】' + b.edit) : null,
      b.warns.map(w => h('div', { class: 'warn-box ' + w.lvl }, icon(w.lvl === 'info' ? 'check' : 'alert', 14), w.msg)),
      field('別解の検討メモ（自動で入ります・編集可）', textarea({ value: Q.altTouched ? Q.alt : autoAlt(b.warns), rows: 2, oninput: v => { Q.alt = v; Q.altTouched = true; } })),
      h('div', { class: 'add-row' },
        field('追加先', select(targetOpts, Q.target, v => { Q.target = v === 'new' ? 'new' : Number(v); drawAll(); })),
        h('button', { class: 'btn primary', disabled: !canAdd, onclick: addToExam }, icon('plus'), 'この問題を追加')));
  }

  function addToExam() {
    const b = built;
    if (!b || b.error || b.pending) return;
    const kind = Q.format === 'ai' ? Q.ai.fmt : Q.format;
    const alt = Q.altTouched ? Q.alt : autoAlt(b.warns);
    const q = {
      body: b.fromAI ? b.body : (Q.ja.trim() ? Q.ja.trim() + '\n' : '') + b.body,
      answer: b.answer, answer_slots: b.slots, slot_labels: b.labels || undefined,
      source_ref: Q.source.trim(), alt_answer_risk: b.edit ? `【改変箇所】${b.edit} ／ ${alt}` : alt,
      focus: Q.focus, kind, number: 0, verdict: b.verdict || undefined,
    };
    if (b.choices) { q.choices = b.choices; q.correct = b.correct; }
    if (Q.format === 'content_match' && Q.text.trim() && !Q.altTouched) q.alt_answer_risk = '【内容一致】根拠の本文: ' + Q.text.trim().slice(0, 200);
    if (b.reorder) q.reorder = b.reorder;
    let si = Q.target;
    if (si === 'new' || !p.sections[si]) {
      const type = kind === 'reorder_4th_8th' ? 'reorder_2nd_5th' : kind;
      p.sections.push(newSection(TYPE_LABEL[type] ? type : 'other', 0));
      si = p.sections.length - 1;
    }
    const s = p.sections[si];
    if (s.type === 'auto') Object.assign(s, { type: TYPE_LABEL[kind] ? kind : 'other', instructions: s.instructions || DEFAULT_INSTR[kind] || '', choice_style: DEFAULT_STYLE[kind] || s.choice_style });
    if (q.choices) syncChoiceAnswers({ ...s, questions: [q] });  // 正解の記号を追加先の大問に合わせる
    s.questions.push(q);
    let grew = false;
    if (s.questions.length > s.count) { s.count = s.questions.length; grew = true; }
    renumber(); markDirty(); close();
    S.issues = null;
    toast(`${s.label}の(${q.number})に追加しました` + (grew ? `（問数を${s.count}問に増やしました。配点を確認してください）` : ''), 'ok',
      { label: '確認する', fn: () => { S.secIdx = si; S.highlight = { si, qi: s.questions.length - 1 }; gotoStep('questions'); } });
    if (S.step === 'build') { S.secIdx = si; S.highlight = { si, qi: s.questions.length - 1 }; render({ keepScroll: true }); }
  }

  const left = h('div', { class: 'qk-left' },
    field('対象の英文（本文のまま出題に使われます）', textarea({ value: Q.text, rows: 3, cls: 'inp en', 'data-autofocus': !Q.text || null,
      placeholder: '例: She is the girl who I think will win the prize.',
      oninput: v => { Q.text = v; Q.marks = {}; Q.R = { ...Q.R, prefix: 0, suffix: 0, joins: {}, order: null, key: '' }; Q.E = { ...Q.E, groups: [], pending: null, err: 0 }; Q.ai.result = null; builderBox.replaceChildren(builder()); drawPreview(); } })),
    h('div', { class: 'grid-2' },
      field('日本語訳（問題文の1行目・任意）', input({ value: Q.ja, placeholder: '例: 彼女は、その賞を取ると私が思っている女の子だ。', oninput: v => { Q.ja = v; drawPreview(); } })),
      field('出典（必須）', input({ value: Q.source, placeholder: '例: 例文56／L4 Part1', oninput: v => { Q.source = v; drawPreview(); } }))),
    field('問いたい点（メモ。AIに依頼する場合は指示になります）', input({ value: Q.focus, placeholder: '例: 連鎖関係代名詞 who', oninput: v => { Q.focus = v; } })),
    h('div', { class: 'fld' }, h('span', {}, '出題形式'), fmtTabs),
    builderBox);

  const close = openModal({ title: 'クイック作問 — この文の、ここを、この形式で', body: h('div', { class: 'qk' }, left, previewBox), size: 'xl' });
  drawAll();
}

// ================================================================ 4. チェック

async function runChecks() {
  if (S.checking) return;
  S.checking = true;
  try {
    const p = S.project;
    const r = await api('POST', `projects/${p.id}/check`, { exam: p.exam, sections: p.sections });
    S.issues = r.issues;
  } catch (e) { toast(e.message, 'error'); S.issues = []; }
  S.checking = false;
  if (S.step === 'check') render({ keepScroll: true }); else refreshLive();
}

function jumpToIssue(text) {
  const m = text.match(/^(大問\d+(?: 問\d+)?)(?:\((\d+)\))?/);
  if (!m) return gotoStep('setup');
  const si = S.project.sections.findIndex(s => s.label === m[1]);
  if (si < 0) return gotoStep('setup');
  S.secIdx = si;
  if (!m[2]) return gotoStep(/配点/.test(text) ? 'setup' : 'build');
  S.highlight = { si, qi: Number(m[2]) - 1 };
  const q = S.project.sections[si]?.questions[Number(m[2]) - 1];
  if (q) S.openQ.add(q);  // 直す箇所がすぐ見えるように編集欄を開く
  gotoStep('build');
}

function buildVerifyPrompt() {
  const p = S.project;
  const lines = [
    '次の定期考査の各問について、模範解答以外に正解となりうる「別解」がないか、反証するつもりで検証してください。',
    '特に: 並び替え → 不定詞句・副詞句の文頭移動、副詞の位置、等位要素の入れ替え／空所補充 → 同じ品詞の類義語／語句挿入 → 他の挿入位置。',
    '問題ごとに「別解あり／なし」「理由」「修正案（チャンク化・頭文字ヒント・文の差し替えなど）」を答えてください。',
    '', `試験: ${p.exam.title}`, '',
  ];
  p.sections.forEach(s => {
    lines.push(`【${s.label}】${TYPE_LABEL[s.type] || s.type}`, `指示文: ${s.instructions}`);
    s.questions.forEach(q => lines.push(`(${q.number}) ${q.body.replace(/\n/g, ' ／ ')}`, `　解答: ${q.answer}`));
    lines.push('');
  });
  return lines.join('\n');
}

async function verifyAll() {
  const p = S.project;
  const all = [];
  p.sections.forEach((s, si) => s.questions.forEach((q, qi) => { if (q.body.trim() && q.answer.trim()) all.push([s, si, q, qi]); }));
  if (!all.length) return toast('チェックできる問題がありません', 'error');
  S.verify = { done: 0, total: all.length };
  render({ keepScroll: true });
  for (const [s, , q] of all) {
    try {
      const r = await api('POST', 'ai/verify_one', { question: q, type: s.type });
      q.verdict = r.verdict;
    } catch (e) { toast(e.message, 'error'); break; }
    S.verify.done++;
    if (S.step === 'check') render({ keepScroll: true });
  }
  S.verify = null;
  markDirty();
  render({ keepScroll: true });
  toast('AIによる別解チェックが終わりました', 'ok');
}

function renderCheck() {
  const p = S.project;
  if (S.issues == null && !S.checking) runChecks();
  const issues = S.issues;

  const auto = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('shield'), '自動チェック',
      h('button', { class: 'btn ghost sm right', onclick: () => { S.issues = null; render({ keepScroll: true }); } }, '再チェック')),
    h('p', { class: 'muted', style: { marginTop: 0 } }, '配点合計・問数・番号・出典・空欄・答えの重複・選択肢の偏り・空所と解答枠の数を機械的に確認します。'),
    issues == null ? h('div', { class: 'loading' }, 'チェック中…') :
      !issues.length ? h('div', { class: 'all-ok' }, icon('check', 22), h('div', {}, h('b', {}, '問題は見つかりませんでした'), h('div', {}, h('span', {}, '別解と内容の妥当性は、右のチェックと教員の確認で見てください')))) :
        h('ul', { class: 'issue-list' }, issues.map(t => h('li', {},
          h('button', { class: 'issue', onclick: () => jumpToIssue(t) }, icon('alert', 15), h('span', {}, t), h('span', { class: 'issue-go' }, '直す →'))))));

  const flagged = [];
  p.sections.forEach((s, si) => s.questions.forEach((q, qi) => { if (q.verdict?.has_alternate_answer) flagged.push([s, si, q, qi]); }));
  const checked = p.sections.reduce((a, s) => a + s.questions.filter(q => q.verdict).length, 0);
  const total = p.sections.reduce((a, s) => a + s.questions.length, 0);

  const ai = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('sparkles'), '別解チェック'),
    S.status.ai ? [
      h('p', { class: 'muted', style: { marginTop: 0 } }, aiName() + 'が各問について「別解がある」と反証するつもりで検証します。'),
      S.verify ? [h('div', { class: 'progress' }, h('i', { style: { width: (S.verify.done / S.verify.total * 100) + '%' } })), h('div', { class: 'muted' }, `${S.verify.done} / ${S.verify.total}問 チェック中…`)]
        : h('button', { class: 'btn primary', onclick: verifyAll }, icon('sparkles'), '全問をAIでチェック'),
      h('p', { class: 'muted' }, `チェック済み ${checked} / ${total}問`),
    ] : [
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'API抜きモードです。下のボタンで全問の「別解チェック依頼文」をコピーし、Claude / Codex に貼り付けて確認できます。'),
      h('button', { class: 'btn ghost', onclick: () => copyText(buildVerifyPrompt(), '別解チェック依頼文をコピーしました') }, icon('clipboard'), '別解チェック依頼文をコピー'),
    ],
    flagged.length ? h('ul', { class: 'issue-list', style: { marginTop: '12px' } }, flagged.map(([s, si, q, qi]) => h('li', {},
      h('button', { class: 'issue', onclick: () => { S.secIdx = si; S.highlight = { si, qi }; gotoStep('questions'); } },
        icon('alert', 15), h('span', {}, `${s.label}(${q.number}): ${q.verdict.explanation.slice(0, 60)}…`), h('span', { class: 'issue-go' }, '確認 →'))))) : null);

  const done = CHECKLIST.filter(([k]) => p.checklist[k]).length;
  const list = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('check'), '配布前の最終確認', h('span', { class: 'pill right' }, `${done} / ${CHECKLIST.length}`)),
    h('div', { class: 'checklist' }, CHECKLIST.map(([k, label]) =>
      h('label', { class: 'check' + (p.checklist[k] ? ' done' : '') },
        h('input', { type: 'checkbox', checked: p.checklist[k], onchange: e => { p.checklist[k] = e.target.checked; markDirty(); render({ keepScroll: true }); } }),
        h('span', {}, label)))));

  return h('div', { class: 'step' },
    stepHead('チェック', '機械で確実に見つけられるものは自動で、別解は AI または依頼文で、最後に教員が確認します。'),
    analysisCard(),
    studentCard(),
    h('div', { class: 'check-grid', style: { marginTop: '16px' } }, auto, h('div', { class: 'stack' }, ai, list)));
}

// ================================================================ 仮想の生徒

const STUDENT_LEVELS = [['', '平均的な高校生'], ['英語が苦手な高校1年生', '英語が苦手な生徒'], ['英語が得意で大学受験を目指す高校生', '英語が得意な生徒']];

function studentCard() {
  const p = S.project;
  S.studentOpt ||= { level: '', scope: -1 };
  const o = S.studentOpt;
  const gs = groupsOf(p.sections);
  const r = S.student;
  const run = async () => {
    await flushSave();
    S.studentBusy = true; render({ keepScroll: true });
    try {
      const res = await api('POST', 'ai/student', { pid: p.id, level: o.level, scope: o.scope });
      S.student = res; toast(`仮想の生徒が${res.count}問を解きました　${res.cost}`, 'ok');
    } catch (e) { toast(e.message, 'error'); }
    S.studentBusy = false; render({ keepScroll: true });
  };
  const copy = async () => {
    await flushSave();
    try { copyText((await api('POST', 'prompt/student', { pid: p.id, scope: o.scope })).prompt, '仮想の生徒の依頼文をコピーしました。Claude / ChatGPT に貼り付けてください'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const jump = id => jumpToIssue(id);
  let body = null;
  if (r) {
    const rs = r.report.results;
    const ok = rs.filter(x => x.correct && !x.problem).length;
    const alt = rs.filter(x => x.alternate_ok);
    const bad = rs.filter(x => !x.correct && !x.alternate_ok);
    const warn = rs.filter(x => x.problem && !x.alternate_ok);
    const row = x => h('li', {}, h('button', { class: 'issue stu', onclick: () => jump(x.id) },
      h('span', { class: 'stu-mark ' + (x.alternate_ok ? 'alt' : !x.correct ? 'bad' : x.problem ? 'warn' : 'ok') }, x.alternate_ok ? '別解' : !x.correct ? '誤答' : x.problem ? '要確認' : '正解'),
      h('span', { class: 'stu-body' }, h('b', {}, x.id), `　生徒の答え: ${x.student_answer || '—'}`,
        x.problem ? h('small', {}, '指摘: ' + x.problem + (x.fix ? '　→ ' + x.fix : '')) : null,
        x.trouble ? h('small', { class: 'muted' }, '生徒が迷った点: ' + x.trouble) : null),
      h('span', { class: 'issue-go' }, '見る →')));
    body = h('div', { class: 'stack' },
      h('div', { class: 'stu-sum' },
        h('div', { class: 'u-tile' }, h('small', {}, '正答'), h('b', {}, `${rs.filter(x => x.correct).length} / ${rs.length}`), h('span', {}, '想定どおり解けた問題')),
        h('div', { class: 'u-tile' + (alt.length ? ' bad' : '') }, h('small', {}, '別解の疑い'), h('b', {}, alt.length), h('span', {}, '生徒の別の答えも成立')),
        h('div', { class: 'u-tile' + (r.report.duplicates.length ? ' warn' : '') }, h('small', {}, '聞いている要素の重複'), h('b', {}, r.report.duplicates.length), h('span', {}, '同じ箇所・文法を問う組'))),
      h('div', { class: 'warn-box info' }, icon('sparkles', 14), r.report.summary),
      alt.length || bad.length || warn.length ? h('ul', { class: 'issue-list' }, [...alt, ...bad, ...warn].map(row)) : h('div', { class: 'all-ok' }, icon('check', 20), h('b', {}, '全問、想定どおりに解けました')),
      r.report.duplicates.length ? h('div', {}, h('div', { class: 'qk-label' }, '聞いている要素が重なっている問題'),
        h('ul', { class: 'issue-list' }, r.report.duplicates.map(d => h('li', {}, h('div', { class: 'issue' }, icon('layers', 15),
          h('span', {}, h('b', {}, d.ids.join(' と ')), '　' + d.reason)))))) : null,
      h('details', {}, h('summary', {}, `正解した問題（${ok}問）も見る`), h('ul', { class: 'issue-list' }, rs.filter(x => x.correct && !x.problem).map(row))));
  }
  return h('div', { class: 'card stu-card' },
    h('div', { class: 'card-title' }, icon('help'), '仮想の生徒に解かせる'),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'AIの生徒が模範解答を見ずに全問を解き、別のAIが採点します。想定どおり解けたか・別解が成立しないか・問題文が分かりにくくないか・同じ要素を2回聞いていないかをチェックします。'),
    h('div', { class: 'row' },
      select(STUDENT_LEVELS, o.level, v => { o.level = v; }, 'inp mini'),
      select([['-1', 'すべての大問'], ...gs.map((g, k) => [String(g[0]), `大問${k + 1}だけ`])], String(o.scope), v => { o.scope = +v; }, 'inp mini'),
      S.status.ai
        ? h('button', { class: 'btn primary', disabled: !!S.studentBusy, onclick: run }, icon('sparkles'), S.studentBusy ? '解いています…（1〜2分）' : '仮想の生徒に解かせる')
        : h('button', { class: 'btn ghost', onclick: copy }, icon('clipboard'), '依頼文をコピー（API抜き）'),
      h('span', { class: 'muted small' }, S.status.ai ? '生徒役は安いモデル、採点は上位モデルを使います（1回 数円〜数十円の目安）' : 'Claude / ChatGPT に貼り付けると、解答と指摘が返ってきます')),
    body);
}

// ================================================================ 5. 出力

async function doExport() {
  try {
    await flushSave();
    const r = await api('POST', `projects/${S.project.id}/export`, { variant: !!S.exportVariant });
    S.exportFiles = r.files;
    S.exportIssues = r.issues;
    toast('ファイルを作成しました。下のリンクからダウンロードできます', 'ok');
    render({ keepScroll: true });
  } catch (e) { toast(e.message, 'error'); }
}

/** 用紙のプレビュー。Word出力（build_docx.py）と同じ規則で並べる */
function paperView(kind) {
  const p = S.project, e = p.exam;
  const plan = numberPlan(p);
  const paper = h('div', { class: 'paper' });
  const titleLine = suffix => (e.date && !suffix)
    ? h('div', { class: 'paper-title left' }, h('b', {}, e.title), h('span', {}, '　　　' + e.date))
    : h('div', { class: 'paper-title' }, e.title + suffix);

  if (kind === 'exam') {
    if (e.cover?.enabled) {
      const c = e.cover;
      const cautions = (c.cautions || '').split('\n').map(x => x.trim()).filter(Boolean);
      paper.append(h('div', { class: 'paper-cover' },
        c.grade ? h('div', { class: 'cv-grade' }, c.grade) : null,
        c.subject ? h('div', { class: 'cv-subject' }, c.subject) : null,
        h('div', { class: 'cv-name' }, c.name || e.title),
        e.date ? h('div', { class: 'cv-date' }, e.date) : null,
        h('div', { class: 'cv-caution' }, h('b', {}, '受験上の注意'),
          (cautions.length ? cautions : ['試験開始の合図があるまでこの問題冊子を開いてはいけません。', '試験中は監督者の指示に従いなさい。',
            '解答は全て解答用紙の枠内に丁寧な文字で記入しなさい。', '問題の指示がある場合はそれに従いなさい。'])
            .map(t => h('div', {}, '※ ' + t.replace(/^※\s*/, '')))),
        h('div', { class: 'cv-break' }, '— ここで改ページ —')));
    }
    paper.append(titleLine(''));
    applyLabels(p.sections);
    const bigHead = new Map(groupsOf(p.sections).map(g => [g[0], g]));
    p.sections.forEach((s, si) => {
      const g = bigHead.get(si);
      if (g) {  // 大問の見出しと本文（設問が1つも作られていない大問は出さない）
        const secs = g.map(i => p.sections[i]);
        if (secs.some(x => x.questions.length)) {
          paper.append(h('div', { class: 'paper-sec' }, secs.length > 1 ? bigHeadingText(e, secs) : headingText(e, s)));
          if ((s.passage || '').trim()) paper.append(h('div', { class: 'paper-passage' }, s.passage.split('\n').map(l => h('p', {}, rich(l)))));
        }
      }
      if (!s.questions.length) return;  // 未作成の設問は用紙に出さない
      const nums = plan[si];
      if (s.part) paper.append(h('div', { class: 'paper-part' }, partHeadingText(e, s)));
      const short = ch => Math.max(0, ...ch.map(c => String(c).length)) <= 18;  // 横に並べても読める選択肢
      const compact = s.questions.every(q => q.choices?.length && !q.body.includes('\n') && q.body.length <= 40 && short(q.choices));
      if (compact) {
        const narrow = s.questions.every(q => !q.body.trim());  // 単語リスニングは番号だけ
        paper.append(h('table', { class: 'ch-table' }, s.questions.map((q, i) => h('tr', {},
          h('td', { class: 'ch-q' + (narrow ? ' narrow' : '') }, `${nums[i].label} ${q.body}`.trim()),
          choiceLine(s.choice_style, q.choices).map(c => h('td', {}, c))))));
      } else {
        s.questions.forEach((q, i) => {
          const lines = q.body.split('\n');
          const rl = reorderLine(q, nums[i].slots || q.slot_labels || []);
          paper.append(h('div', { class: 'paper-q' }, h('span', { class: 'paper-qn' }, nums[i].label),
            h('div', {}, lines.map(l => h('div', {}, rich(l))), rl ? h('div', {}, rl) : null,
              q.choices?.length ? h('div', { class: 'paper-ch' + (short(q.choices) ? '' : ' long') }, choiceLine(s.choice_style, q.choices).map(c => h('span', {}, c))) : null)));
        });
      }
      if (s.bank?.length) {
        paper.append(h('div', { class: 'paper-bank' }, h('b', {}, '【語群】'),
          h('div', {}, choiceLine(s.bank_style || s.choice_style, s.bank).map(c => h('span', {}, c)))));
      }
    });
    paper.append(h('div', { class: 'paper-score' }, e.end_note || '問題は以上です。'));
    return paper;
  }

  const model = kind === 'model';
  paper.append(titleLine(model ? '　模範解答' : '　解答用紙'));
  if (!model) {
    const fields = (e.sheet_fields || '組,番,氏名,得点').split(',').map(x => x.trim()).filter(Boolean);
    paper.append(h('table', { class: 'sheet-head' }, h('tr', {}, fields.map(f => [h('td', { class: 'lbl' }, f), h('td', { class: f === '氏名' ? 'wide' : '' })]))));
  }
  p.sections.forEach((s, si) => {
    if (!s.questions.length) return;
    const nums = plan[si];
    const pts = pointsLabel(s, nums.map(n => n.cell));
    if (s.part === 1) paper.append(h('div', { class: 'paper-sec' }, e.heading === 'bracket' ? `【${s.no}】` : `${s.no}`));
    paper.append(h('div', { class: s.part ? 'paper-part' : 'paper-sec' }, s.part ? `問${s.part}　${pts}`
      : e.heading === 'bracket' ? `【${s.no}】（${pts.slice(1, -1)}）` : `${s.no}　${pts}`));
    const slots = s.questions.map(slotsOf);
    const width = Math.max(...slots.map(x => x.length));
    const per = Math.min(perRowOf(s), s.questions.length);
    const long = LONG_TYPES.has(s.type);
    const table = h('table', { class: 'grid' });
    for (let r = 0; r < Math.ceil(s.questions.length / per); r++) {
      const tr = h('tr', {});
      for (let c = 0; c < per; c++) {
        const i = r * per + c, q = s.questions[i];
        if (!q) { for (let j = 0; j <= width; j++) tr.append(h('td', { class: 'na light' })); continue; }
        const labels = nums[i].slots || q.slot_labels || [];
        tr.append(h('td', { class: 'qn' }, nums[i].cell));
        for (let j = 0; j < width; j++) {
          tr.append(j < slots[i].length
            ? h('td', { class: long ? 'long' : '' }, labels[j] ? h('small', {}, labels[j]) : null, model ? slots[i][j] : '')
            : h('td', { class: 'na' }));
        }
      }
      table.append(tr);
    }
    paper.append(table);
    if (s.scoring_note) paper.append(h('div', { class: 'paper-note' }, '採点基準: ' + s.scoring_note));
    if (model) {
      const scripts = s.questions.map((q, i) => [nums[i].cell, (q.script || '').trim()]).filter(([, t]) => t);
      if (scripts.length) paper.append(h('div', { class: 'paper-note' }, h('b', {}, '放送文'), scripts.map(([l, t]) => h('div', {}, `${l}　${t}`))));
    }
  });
  const total = p.sections.reduce((a, s) => a + sectionPoints(s), 0);
  paper.append(h('div', { class: 'paper-score' }, `合計　　　　／${e.written_points || total}`));
  return paper;
}

function fileLabel(name) {
  const kind = name.slice(name.lastIndexOf('_') + 1).replace(/\.\w+$/, '');
  const ext = name.endsWith('.docx') ? 'Word' : name.endsWith('.md') ? 'テキスト' : '取り込み用';
  return `${kind}（${ext}）`;
}

function renderOutput() {
  const p = S.project;
  const issues = S.exportIssues;
  const dl = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('download'), 'ファイルを作る'),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Wordの問題用紙・解答用紙・模範解答と、出典一覧・試験データ（取り込み用JSON）を作成します。'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: doExport }, icon('download'), 'Wordファイルを作成'),
      h('label', { class: 'check small', title: '隣の席と答えが同じにならないよう、選択肢の順番だけを入れ替えた問題用紙と模範解答も作ります（解答用紙は共通）' },
        h('input', { type: 'checkbox', checked: !!S.exportVariant, onchange: e => { S.exportVariant = e.target.checked; } }), 'B版（選択肢を並べ替えた版）も作る'),
      h('button', { class: 'btn ghost', onclick: () => window.print() }, icon('printer'), '表示中の用紙を印刷')),
    issues?.length ? h('div', { class: 'warn-box warn', style: { marginTop: '12px' } }, icon('alert', 14),
      `自動チェックで${issues.length}件の問題が残っています。`, h('button', { class: 'link', style: { marginLeft: '6px' }, onclick: () => gotoStep('check') }, 'チェック画面で確認 →')) : null,
    S.exportFiles ? h('div', { class: 'files' }, S.exportFiles.map(n =>
      h('a', { class: 'file', href: `/api/projects/${p.id}/files/${encodeURIComponent(n)}`, download: n },
        icon(n.endsWith('.docx') ? 'file' : n.endsWith('.md') ? 'list' : 'type'),
        h('span', { class: 'fname', title: n }, h('b', {}, fileLabel(n)), h('small', {}, n)), icon('download', 14)))) : null,
    h('div', { class: 'note' }, icon('alert', 14), '模範解答・試験データは、生徒が閲覧できる共有フォルダに置かないでください。'));
  const tabs = h('div', { class: 'seg' }, [['exam', '問題用紙'], ['sheet', '解答用紙'], ['model', '模範解答']].map(([k, l]) =>
    h('button', { class: 'seg-btn' + (S.previewTab === k ? ' on' : ''), onclick: () => { S.previewTab = k; render({ keepScroll: true }); } }, l)));
  return h('div', { class: 'step' },
    stepHead('出力', 'プレビューで仕上がりを確認し、Wordファイルとして保存します。体裁は叩き台なので、最終調整はWordで行ってください。'),
    dl, h('div', { class: 'preview-wrap' }, tabs, paperView(S.previewTab)));
}

// ================================================================ ダイアログ（設定・使い方）

function aiName(prov = S.status.provider) { return prov === 'openai' ? 'ChatGPT' : 'Claude'; }

function settingsDialog() {
  const st = S.status;
  const f = { provider: st.provider || 'anthropic', key: '', model: st.openai_model || 'gpt-4.1' };
  const body = h('div', { class: 'stack' });
  const draw = () => {
    const isOA = f.provider === 'openai';
    const keySet = isOA ? st.openai_key_set : st.anthropic_key_set;
    body.replaceChildren(...[
      h('div', { class: 'warn-box ' + (st.ai ? 'ok' : 'info') }, icon(st.ai ? 'check' : 'key', 14),
        st.ai ? `いまは ${aiName()} でAI機能が使えます。` : 'いまは API抜きモードです。クイック作問（手作業）とチェック・出力はすべて無料で使えます。'),
      h('div', { class: 'fld' }, h('span', {}, '使うAI'),
        h('div', { class: 'seg' }, [['anthropic', 'Claude（Anthropic）'], ['openai', 'ChatGPT（OpenAI）']].map(([v, l]) =>
          h('button', { class: 'seg-btn' + (f.provider === v ? ' on' : ''), onclick: () => { f.provider = v; f.key = ''; draw(); } }, l)))),
      h('p', { class: 'muted', style: { margin: 0 } }, 'APIキーを入れると「AIで一括作問」「AIで作問する」「AIで別解チェック」が使えます（使った分だけ各社から従量課金）。キーはこのツールを閉じるまでの間だけ保持され、ファイルには保存されません。'),
      field(isOA ? 'OpenAIのAPIキー（sk-…）' : 'AnthropicのAPIキー（sk-ant-…）',
        input({ type: 'password', value: f.key, placeholder: keySet ? '設定済み（変更する場合のみ入力）' : (isOA ? 'sk-...' : 'sk-ant-...'), oninput: v => { f.key = v; } })),
      isOA ? field('モデル名（わからなければそのまま）', input({ value: f.model, oninput: v => { f.model = v; } })) : null,
      isOA ? h('p', { class: 'muted', style: { margin: 0, fontSize: '12px' } }, 'ChatGPTの有料プラン（Plus等）とAPIは別契約です。APIキーは platform.openai.com で発行します。') : null,
    ].filter(Boolean));
  };
  draw();
  openModal({
    title: 'AI機能の設定', size: 'md', body,
    actions: [
      { label: 'キーを消去', fn: async c => {
        S.status = (await api('POST', 'settings', { provider: f.provider, key: '', clear: true })).status;
        c(); render({ keepScroll: true }); toast('APIキーを消去しました', 'ok');
      } },
      { label: '閉じる', fn: c => c() },
      { label: '保存', kind: 'primary', fn: async c => {
        const keySet = f.provider === 'openai' ? st.openai_key_set : st.anthropic_key_set;
        if (!f.key.trim() && !keySet) return toast('APIキーを入力してください', 'error');
        try {
          S.status = { ...S.status, ...(await api('POST', 'settings', { provider: f.provider, key: f.key.trim(), model: f.model })).status };
          c(); render({ keepScroll: true });
          toast(S.status.ai ? `${aiName()} のAI機能が使えるようになりました` : 'キーを保存できませんでした。もう一度入力してください', S.status.ai ? 'ok' : 'error');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

function helpDialog() {
  const steps = [
    ['試験の設定', 'テンプレートを選ぶか、大問を追加します。大問は「素材（本文）＋設問（問1・問2…）」。長文の大問なら、同じ本文に空所補充・和訳・指示語・内容一致などの設問を並べます。体裁（番号・見出し・表紙）もここで。'],
    ['大問をつくる', '大問をタブで選び、左にその大問の素材（Word・貼り付け）を入れます。素材の文をクリック → 形式を選ぶ → 語をクリックするだけで問題ができます。'],
    ['チェックする', '配点・番号・出典・空所と解答枠の数などを自動で確認。別解はAIか依頼文で確認します。'],
    ['出力する', 'Wordの問題用紙・解答用紙・模範解答と出典一覧を作成します。'],
  ];
  const rules = [
    '教材にない文は出題しない（出典は必須）',
    '本文・例文は一語も書き換えない（ツールは元の文字をそのまま使います）',
    '並び替えは不定詞句・副詞の位置による別解に注意（チャンク化で防ぐ）',
    '空所補充で類義語の別解が出るなら頭文字ヒントを付ける',
    '解答用紙は1枠1語（ツールが解答の語数どおりに枠を作ります）',
    '生成物はドラフト。配布前に必ず教員が全問解き直す',
  ];
  openModal({
    title: '使い方と作問のルール', size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'help-steps' }, steps.map(([t, d], i) => h('div', { class: 'help-step' }, h('span', { class: 'nav-num' }, i + 1), h('div', {}, h('b', {}, t), h('p', {}, d))))),
      h('div', { class: 'card', style: { background: 'var(--surface-2)' } },
        h('div', { class: 'card-title' }, icon('shield'), '作問のルール（過去の事故の再発防止策）'),
        h('ul', { style: { margin: 0, paddingLeft: '20px' } }, rules.map(r => h('li', {}, r)))),
      h('p', { class: 'muted', style: { margin: 0 } }, `データの保存先（このPC）: ${S.status.workspace || ''}　— 使う人ごとに、その人のPCの「ドキュメント」内に保存されます。生徒が見られる場所に移さないでください。`)),
    actions: [{ label: '閉じる', kind: 'primary', fn: c => c() }],
  });
}

// ================================================================ 起動

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (fabEl) return hideFab();
    if (modalStack.length) modalStack[modalStack.length - 1]();
  }
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && S.project && !modalStack.length
      && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); previewDialog(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (S.project) saveNow().then(() => toast('保存しました', 'ok'));
  }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  if ((e.ctrlKey || e.metaKey) && !typing && S.project && !modalStack.length) {
    // 入力欄の中では、ブラウザ本来の「元に戻す」（文字単位）を使う
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  }
  if (e.key === '?' && !typing && !modalStack.length) { e.preventDefault(); shortcutsDialog(); }
});

window.addEventListener('popstate', async () => {
  const m = location.hash.match(/^#\/p\/([0-9a-f]{12})$/);
  if (m && (!S.project || S.project.id !== m[1])) { await flushSave(); openProject(m[1]).catch(() => {}); }
  else if (!m && S.project) goHome();
});

async function boot() {
  try { S.status = await api('GET', 'status'); } catch (e) { toast(e.message, 'error'); }
  await loadConfig();
  refreshUsage();
  const m = location.hash.match(/^#\/p\/([0-9a-f]{12})$/);
  if (m) { try { await openProject(m[1]); return; } catch { history.replaceState(null, '', location.pathname); } }
  render();
  await loadProjects();
  render();
}

window.addEventListener('DOMContentLoaded', boot);
