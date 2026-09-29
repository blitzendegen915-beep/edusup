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
};

function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  return span;
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Exam-Studio': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('ツールのサーバーに接続できません。黒い画面（起動ウィンドウ）が開いたままか確認してください');
  }
  let data = {};
  try { data = await res.json(); } catch { /* 本文なし */ }
  if (!res.ok) throw new Error(data.error || `エラーが発生しました（${res.status}）`);
  return data;
}

function toast(msg, kind = 'info', action) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const el = h('div', { class: `toast ${kind}` }, h('span', {}, msg),
    action ? h('button', { class: 'toast-act', onclick: () => { el.remove(); action.fn(); } }, action.label) : null);
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  const life = kind === 'error' ? 7000 : action ? 5000 : 3500;
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
  setTimeout(() => dlg.querySelector('[data-autofocus], .modal-body input, .modal-body textarea')?.focus(), 40);
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

const SECTION_TYPES = [
  ['fill_blank', '空所補充'],
  ['reorder_2nd_5th', '並び替え（○番目と○番目）'],
  ['choice_4', '語句選択（4択・語群）'],
  ['word_form', '語形変化'],
  ['underline_grammar', '下線部（文法・書き換え）'],
  ['translation', '和訳・英文解釈'],
  ['insertion', '語句挿入位置'],
  ['reading_misfit', '読解（不要文・空所・内容一致）'],
  ['content_match', '長文・内容一致'],
  ['other', 'その他'],
];
const TYPE_LABEL = Object.fromEntries(SECTION_TYPES);
const SHORT = {
  fill_blank: '空所補充', reorder_2nd_5th: '並び替え', choice_4: '語句選択', word_form: '語形変化',
  underline_grammar: '下線部', translation: '和訳', insertion: '語句挿入', reading_misfit: '読解',
  content_match: '長文', other: 'その他',
};
const DEFAULT_POINTS = {
  fill_blank: 1, reorder_2nd_5th: 2, choice_4: 1, word_form: 1, underline_grammar: 2,
  translation: 4, insertion: 2, reading_misfit: 2, content_match: 3, other: 1,
};
const DEFAULT_INSTR = {
  fill_blank: '日本文の意味になるように英文の空所に適語を入れなさい。空欄にアルファベットがあるものは、それではじまる単語を答えること。',
  reorder_2nd_5th: '日本語の意味を表す英文になるように（　）内の語句を並べ替え，（　）内で２番目と５番目に来る語句を答えなさい。なお，複数の単語からなる選択肢も一つの語句として数える。また，文頭に来る語も１文字目は小文字になっている。',
  choice_4: '（　）に入る最も適切なものを選び、記号で答えなさい。',
  word_form: '（　）内の語を適切な形に直しなさい。',
  underline_grammar: '下線部について、各問いに答えなさい。',
  translation: '下線部を日本語に訳しなさい。',
  insertion: 'この英文中には下の語句が抜けている。本来入るべき場所を指摘しなさい。解答欄には，それぞれの語句が入る場所の前後の単語を書きなさい。',
  reading_misfit: 'Read the following text and answer the questions.',
  content_match: '以下の英文を読み、各問いに答えなさい。番号で答えなさい。',
  other: '',
};
// 大問の形式 → クイック作問の初期形式
const QUICK_FOR = {
  fill_blank: 'fill_blank', reorder_2nd_5th: 'reorder_2nd_5th', choice_4: 'choice_4', word_form: 'word_form',
  underline_grammar: 'underline_grammar', translation: 'translation',
};
const QUICK_FORMATS = [
  ['fill_blank', '空所補充', 'type'],
  ['reorder_2nd_5th', '並び替え', 'shuffle'],
  ['choice_4', '4択', 'list'],
  ['word_form', '語形変化', 'edit'],
  ['underline_grammar', '下線部', 'underline'],
  ['translation', '和訳', 'globe'],
  ['ai', 'AIに依頼', 'sparkles'],
];
const AI_FORMATS = [
  ['fill_blank', '空所補充'], ['reorder_2nd_5th', '並び替え（2番目・5番目）'], ['reorder_4th_8th', '並び替え（4番目・8番目）'],
  ['choice_4', '4択'], ['word_form', '語形変化'], ['underline_grammar', '下線部'], ['translation', '和訳'],
];
const TEMPLATES = [
  { id: 'comm2', name: '英語コミュニケーション型（8大問・80点）', points: 80,
    desc: '空所補充 → 読解 → 語句選択 → 語句挿入 → 英文解釈 → 並び替え → 長文 → 語群選択',
    sections: [['fill_blank', 9, 1], ['reading_misfit', 3, 2], ['choice_4', 4, 1], ['insertion', 5, 2],
      ['translation', 4, 4], ['reorder_2nd_5th', 5, 2], ['content_match', 5, 3], ['choice_4', 10, 1]] },
  { id: 'grammar', name: '文法演習型（4大問・60点）', points: 60,
    desc: '語句選択 → 空所補充 → 並び替え → 語形変化',
    sections: [['choice_4', 10, 2], ['fill_blank', 10, 2], ['reorder_2nd_5th', 5, 2], ['word_form', 5, 2]] },
  { id: 'blank', name: '白紙から', points: null, desc: '大問を自分で組み立てる', sections: [] },
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
  step: 'materials',
  materialId: null,
  materialText: {},
  secIdx: 0,
  issues: null,
  checking: false,
  verify: null,           // {done, total}
  highlight: null,        // 作問画面で強調する問題 {si, qi}
  exportFiles: null,
  exportIssues: null,
  previewTab: 'exam',
  saveState: 'saved',
};

// ================================================================ 保存

let saveTimer = null, saving = false, pendingSave = false;

function renumber() {
  S.project.sections.forEach((s, i) => { s.no = i + 1; s.questions.forEach((q, j) => { q.number = j + 1; }); });
}

function markDirty() {
  if (!S.project) return;
  S.saveState = 'dirty';
  renderSaveState();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 600);
  refreshLive();
}

async function saveNow() {
  clearTimeout(saveTimer);
  const p = S.project;
  if (!p) return;
  if (saving) { pendingSave = true; return; }
  saving = true;
  S.saveState = 'saving';
  renderSaveState();
  try {
    await api('PUT', `projects/${p.id}`, { exam: p.exam, sections: p.sections, checklist: p.checklist || {} });
    if (S.saveState === 'saving') S.saveState = 'saved';
  } catch (e) {
    S.saveState = 'error';
    toast('保存に失敗しました: ' + e.message, 'error');
  }
  saving = false;
  renderSaveState();
  if (pendingSave) { pendingSave = false; await saveNow(); }
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
  if (S.saveState === 'dirty' || S.saveState === 'saving') { saveNow(); e.preventDefault(); e.returnValue = ''; }
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
    planned: secs.reduce((a, s) => a + s.points_each * s.count, 0),
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
    h('span', { class: 'dot' + (on ? ' on' : '') }), h('span', {}, on ? 'AI 有効（Sonnet）' : 'API抜きモード'));
}

function logo(sm = false) {
  return h('div', { class: 'logo' + (sm ? ' sm' : '') }, icon('logo', sm ? 18 : 24));
}

// ================================================================ ホーム

function renderHome() {
  const list = S.projects;
  const newCard = h('button', { class: 'proj new', onclick: newProjectDialog },
    h('div', {}, icon('plus', 26), h('b', {}, '新しい試験を作る')));
  return h('div', { class: 'home' },
    h('header', { class: 'home-hero' },
      h('div', { class: 'brand' }, logo(),
        h('div', {}, h('h1', {}, '定期考査スタジオ'), h('p', {}, '教材の文をクリックして、聞きたいところを、聞きたい形式で。'))),
      h('div', { class: 'hero-actions' },
        statusChip(),
        h('button', { class: 'btn ghost', onclick: helpDialog }, icon('help'), '使い方'),
        h('button', { class: 'btn ghost', onclick: importProject }, icon('upload'), '取り込む'),
        h('button', { class: 'btn primary', onclick: newProjectDialog }, icon('plus'), '新しい試験'))),
    list == null ? h('div', { class: 'loading' }, '読み込み中…') :
      h('div', { class: 'proj-grid' }, newCard, list.map(projectCard)));
}

function projectCard(p) {
  const pct = p.count ? Math.min(100, Math.round(p.questions / p.count * 100)) : 0;
  const ptsOk = p.points === p.written_points;
  return h('div', { class: 'proj', role: 'button', tabindex: '0', onclick: () => openProject(p.id).catch(() => {}),
    onkeydown: e => { if (e.key === 'Enter') openProject(p.id).catch(() => {}); } },
    h('div', { class: 'proj-actions' },
      iconBtn('copy', '複製（前回の試験を土台にする）', e => { e.stopPropagation(); duplicateProject(p); }),
      iconBtn('trash', '削除', e => { e.stopPropagation(); deleteProject(p); }, { danger: true })),
    h('h3', {}, p.title || '（無題）'),
    h('div', { class: 'proj-meta' },
      h('span', { class: 'pill' }, `大問 ${p.sections}`),
      h('span', { class: 'pill' }, `教材 ${p.materials}`),
      h('span', { class: 'pill', style: ptsOk ? null : { color: 'var(--warn)' } }, `配点 ${p.points}/${p.written_points}点`)),
    h('div', { class: 'proj-bar' }, h('i', { style: { width: pct + '%' } })),
    h('div', { class: 'proj-foot' }, h('span', {}, `作問 ${p.questions}/${p.count}問`), h('span', {}, `更新 ${p.updated_at}`)));
}

async function loadProjects() {
  try { S.projects = (await api('GET', 'projects')).projects; }
  catch (e) { S.projects = []; toast(e.message, 'error'); }
}

function newSection(type, count = 5) {
  return { no: 0, type, points_each: DEFAULT_POINTS[type] ?? 1, count, instructions: DEFAULT_INSTR[type] || '', source: '', questions: [] };
}

function newProjectDialog() {
  const year = new Date().getFullYear();
  const st = { title: `${year}年度　　学年　　　　　　　学期　　　試験`, points: 80, tpl: 'comm2' };
  const pts = input({ type: 'number', value: st.points, oninput: v => { st.points = toInt(v, 80); } });
  const box = h('div', { class: 'tpl-grid' });
  const draw = () => box.replaceChildren(...TEMPLATES.map(t => h('button', {
    class: 'tpl' + (st.tpl === t.id ? ' on' : ''),
    onclick: () => { st.tpl = t.id; if (t.points) { st.points = t.points; pts.value = t.points; } draw(); },
  }, h('b', {}, t.name), h('small', {}, t.desc))));
  draw();
  openModal({
    title: '新しい試験を作る', size: 'md',
    body: h('div', { class: 'stack' },
      field('試験名', input({ value: st.title, 'data-autofocus': true, oninput: v => { st.title = v; } })),
      field('筆記の満点（リスニング等を除く）', pts),
      h('div', { class: 'fld' }, h('span', {}, 'ひな形（あとから自由に変更できます）'), box)),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '作成する', kind: 'primary', icon: 'plus', fn: async c => {
        const t = TEMPLATES.find(x => x.id === st.tpl);
        const sections = t.sections.map(([type, count, pe]) => ({ ...newSection(type, count), points_each: pe }));
        try {
          const r = await api('POST', 'projects', { title: st.title, written_points: st.points, sections });
          c();
          await openProject(r.project.id, 'materials');
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
  if (!await confirmBox(`「${p.title}」を削除しますか？\n（exam_workspace/.trash フォルダに移動するので、あとから復元もできます）`, { ok: '削除する', danger: true })) return;
  try { await api('DELETE', `projects/${p.id}`); toast('削除しました', 'ok'); await loadProjects(); render(); }
  catch (e) { toast(e.message, 'error'); }
}

async function openProject(id, step) {
  try {
    const r = await api('GET', `projects/${id}`);
    const p = r.project;
    p.checklist ||= {};
    S.project = p;
    S.step = step || (!p.materials.length ? 'materials' : p.sections.some(s => s.questions.length) ? 'questions' : 'materials');
    S.materialId = p.materials[0]?.id || null;
    S.materialText = {};
    S.secIdx = 0;
    S.issues = null;
    S.exportFiles = null;
    S.saveState = 'saved';
    if (location.hash !== '#/p/' + id) history.pushState(null, '', '#/p/' + id);
    render();
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
        statusChip(),
        h('button', { class: 'status-chip', onclick: helpDialog }, icon('help', 14), h('span', {}, '使い方・作問のルール')))),
    h('main', { class: 'main' },
      h('header', { class: 'topbar' },
        h('input', { id: 'title-input', class: 'title-input', value: S.project.exam.title, placeholder: '試験名', 'aria-label': '試験名',
          oninput: e => { S.project.exam.title = e.target.value; markDirty(); } }),
        renderMeter(),
        h('span', { id: 'save-state', class: 'save-state' })),
      h('div', { class: 'main-scroll' }, renderStep())));
}

function renderNav() {
  const p = S.project;
  const st = stats();
  const issues = S.issues;
  const items = [
    ['materials', '教材', 'book', p.materials.length ? `${p.materials.length}件` : '未登録', ''],
    ['structure', '試験構成', 'layers', `${st.planned}/${p.exam.written_points}点`, st.planned === p.exam.written_points ? 'good' : ''],
    ['questions', '作問', 'edit', `${st.made}/${st.count}問`, st.count && st.made >= st.count ? 'good' : ''],
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

function gotoStep(k) {
  hideFab();
  S.step = k;
  if (k === 'check') S.issues = null;
  render();
}

function renderStep() {
  switch (S.step) {
    case 'materials': return renderMaterials();
    case 'structure': return renderStructure();
    case 'questions': return renderQuestions();
    case 'check': return renderCheck();
    case 'output': return renderOutput();
  }
  return h('div');
}

// ================================================================ 1. 教材

function renderMaterials() {
  const p = S.project;
  return h('div', { class: 'step' },
    stepHead('教材', '試験範囲の本文・ワークブック・例文集を入れます。右側の文をクリック（または範囲をドラッグ）すると、その部分から作問できます。'),
    h('div', { class: 'mat-layout' },
      h('div', { class: 'mat-side' },
        dropZone(),
        h('button', { class: 'btn ghost block', onclick: pasteDialog }, icon('clipboard'), 'テキストを貼り付けて追加'),
        p.materials.length ? h('div', { class: 'mat-list' }, p.materials.map(m =>
          h('div', { class: 'mat-item' + (m.id === S.materialId ? ' on' : ''), role: 'button', tabindex: '0',
            onclick: () => { S.materialId = m.id; hideFab(); render({ keepScroll: true }); } },
            icon(/\.docx$/i.test(m.name) ? 'file' : 'type', 16),
            h('span', { class: 'mat-name', title: m.name }, m.name),
            h('span', { class: 'mat-meta' }, `${m.chars.toLocaleString()}字`),
            iconBtn('trash', 'この教材を削除', e => { e.stopPropagation(); deleteMaterial(m); }, { danger: true })))) : null),
      renderViewer()));
}

function dropZone() {
  const inp = h('input', { type: 'file', multiple: true, accept: '.docx,.txt,.md', style: { display: 'none' } });
  inp.addEventListener('change', () => uploadFiles(inp.files));
  const z = h('div', { class: 'drop', role: 'button', tabindex: '0', onclick: () => inp.click() },
    icon('upload', 26), h('b', {}, 'ファイルをここにドロップ'),
    h('small', {}, 'Word（.docx）・テキスト（.txt）／クリックでも選べます'), inp);
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('over'); uploadFiles(e.dataTransfer.files); });
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

async function uploadFiles(fileList) {
  const files = [...fileList];
  for (const f of files) {
    try {
      const data = await readBase64(f);
      const r = await api('POST', `projects/${S.project.id}/materials`, { name: f.name, data });
      addMaterialLocal(r);
      toast(`「${f.name}」を追加しました（${r.material.chars.toLocaleString()}字）`, 'ok');
    } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
  }
  if (files.length) render({ keepScroll: true });
}

function addMaterialLocal(r) {
  S.project.materials.push(r.material);
  S.materialText[r.material.id] = r.text;
  S.materialId = r.material.id;
  refreshLive();
}

function pasteDialog() {
  const st = { name: '', text: '' };
  openModal({
    title: 'テキストを貼り付けて教材にする', size: 'md',
    body: h('div', { class: 'stack' },
      field('教材名（出典として使われます）', input({ value: '', placeholder: '例: L4 Part1 本文／動画でわかる英文法 例文51-60', 'data-autofocus': true, oninput: v => { st.name = v; } })),
      field('本文', textarea({ rows: 12, cls: 'inp en', placeholder: 'ここに英文を貼り付け', oninput: v => { st.text = v; } })),
      h('div', { class: 'hint' }, icon('alert', 14), 'スキャンしたPDFは、文字を読み取ったテキストを貼り付けてください。')),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '追加する', kind: 'primary', icon: 'plus', fn: async c => {
        if (!st.name.trim()) return toast('教材名を入力してください', 'error');
        try {
          const r = await api('POST', `projects/${S.project.id}/materials`, { name: st.name.trim(), text: st.text });
          addMaterialLocal(r); c(); render({ keepScroll: true });
          toast(`「${r.material.name}」を追加しました`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

async function deleteMaterial(m) {
  if (!await confirmBox(`教材「${m.name}」を削除しますか？\n（作成済みの問題は消えません）`, { ok: '削除する', danger: true })) return;
  try {
    await api('DELETE', `projects/${S.project.id}/materials/${m.id}`);
    const p = S.project;
    p.materials = p.materials.filter(x => x.id !== m.id);
    p.sections.forEach(s => { if (s.source === m.id) s.source = ''; });
    if (S.materialId === m.id) S.materialId = p.materials[0]?.id || null;
    render({ keepScroll: true });
  } catch (e) { toast(e.message, 'error'); }
}

function renderViewer() {
  const p = S.project;
  const m = p.materials.find(x => x.id === S.materialId);
  if (!m) return h('div', { class: 'card' }, emptyState('book', '教材がまだありません',
    '左の枠にWordファイルをドロップするか、本文を貼り付けてください。教材の文を選ぶと、その文から作問できます。'));
  const text = S.materialText[m.id];
  if (text == null) {
    api('GET', `projects/${p.id}/materials/${m.id}`)
      .then(r => { S.materialText[m.id] = r.text; if (S.step === 'materials' && S.materialId === m.id) render({ keepScroll: true }); })
      .catch(e => toast(e.message, 'error'));
    return h('div', { class: 'card' }, h('div', { class: 'loading' }, '読み込み中…'));
  }
  return h('div', { class: 'card viewer' },
    h('div', { class: 'viewer-head' }, h('b', {}, m.name), h('span', { class: 'muted' }, `${m.chars.toLocaleString()}字`),
      h('span', { class: 'viewer-tip' }, icon('sparkles', 14), '文をクリック／範囲をドラッグして作問')),
    matText(text, m.name));
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
  fabEl = h('div', { class: 'fab', role: 'dialog', 'aria-label': 'この文で作問' },
    h('div', { class: 'fab-label' }, 'この部分を、どの形式で聞きますか？'),
    h('div', { class: 'fab-text' }, text),
    h('div', { class: 'fab-btns' }, QUICK_FORMATS.map(([v, l, ic]) =>
      h('button', { class: 'fab-btn', onmousedown: e => e.preventDefault(), onclick: () => openQuick({ text, source, format: v }) }, icon(ic, 14), l))));
  document.body.append(fabEl);
  const r = fabEl.getBoundingClientRect();
  fabEl.style.left = Math.max(12, Math.min(x - 40, innerWidth - r.width - 12)) + 'px';
  fabEl.style.top = (y + r.height + 24 > innerHeight ? y - r.height - 14 : y + 16) + 'px';
}
function hideFab() { fabEl?.remove(); fabEl = null; }
document.addEventListener('mousedown', e => { if (fabEl && !fabEl.contains(e.target) && !e.target.closest('.mat-text')) hideFab(); });

// ================================================================ 2. 試験構成

function renderStructure() {
  const p = S.project, e = p.exam;
  const examCard = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('file'), '試験の基本情報'),
    h('div', { class: 'grid-3' },
      field('試験名', input({ value: e.title, oninput: v => { e.title = v; markDirty(); const t = $('#title-input'); if (t) t.value = v; } }), 'span2'),
      field('筆記の満点', input({ type: 'number', min: 0, value: e.written_points, oninput: v => { e.written_points = toInt(v, 0); markDirty(); } }))),
    h('div', { style: { marginTop: '12px' } },
      field('メモ（リスニング・スピーキングの配点など）', input({ value: e.notes || '', placeholder: '例: S10 + L10 は別途', oninput: v => { e.notes = v; markDirty(); } }))));

  const list = p.sections.length
    ? h('div', { class: 'sec-list' }, p.sections.map((s, i) => sectionRow(s, i)))
    : h('div', { class: 'card', style: { marginTop: '16px' } }, emptyState('layers', '大問がまだありません', '下のボタンで大問を追加するか、ひな形から組み立てます。',
      [h('button', { class: 'btn primary', onclick: templateDialog }, icon('layers'), 'ひな形から組む')]));

  return h('div', { class: 'step' },
    stepHead('試験構成', '大問の形式・問数・配点を決めます。上部の配点メーターが緑になれば満点と一致しています。',
      [h('button', { class: 'btn ghost', onclick: templateDialog }, icon('layers'), 'ひな形を適用')]),
    examCard, list,
    h('div', { class: 'add-bar' }, h('span', {}, '大問を追加'),
      SECTION_TYPES.map(([v]) => h('button', { class: 'chip', onclick: () => addSection(v) }, icon('plus', 13), SHORT[v]))));
}

function sectionRow(s, i) {
  const p = S.project;
  const sub = h('span', { class: 'sec-sub' }, `${s.points_each * s.count}点`);
  const changed = () => { sub.textContent = `${s.points_each * s.count}点`; markDirty(); };
  return h('div', { class: 'card sec-row' },
    h('div', { class: 'sec-top' },
      h('div', { class: 'sec-no' }, h('small', {}, '大問'), h('b', {}, s.no)),
      h('div', { class: 'sec-fields' },
        field('形式', select(SECTION_TYPES, s.type, v => {
          const old = s.type;
          s.type = v;
          if (!s.instructions.trim() || s.instructions === DEFAULT_INSTR[old]) s.instructions = DEFAULT_INSTR[v] || '';
          markDirty(); render({ keepScroll: true });
        })),
        field('問数', input({ type: 'number', min: 0, value: s.count, cls: 'inp num', oninput: v => { s.count = toInt(v, 0); changed(); } })),
        h('span', { class: 'op' }, '×'),
        field('配点', input({ type: 'number', min: 0, value: s.points_each, cls: 'inp num', oninput: v => { s.points_each = toInt(v, 0); changed(); } })),
        h('span', { class: 'op' }, '='), sub,
        field('主な出典教材（AI作問で使用）', select([['', '（指定なし）'], ...p.materials.map(m => [m.id, m.name])], s.source,
          v => { s.source = v; markDirty(); }), 'src')),
      h('div', { class: 'sec-actions' },
        iconBtn('up', '上へ移動', () => moveSection(i, -1), { disabled: i === 0 }),
        iconBtn('down', '下へ移動', () => moveSection(i, 1), { disabled: i === p.sections.length - 1 }),
        iconBtn('trash', 'この大問を削除', () => deleteSection(i), { danger: true }))),
    field('指示文', textarea({ value: s.instructions, rows: 2, oninput: v => { s.instructions = v; markDirty(); } })),
    h('div', { class: 'sec-foot' },
      h('span', {}, `作成済み ${s.questions.length} / ${s.count}問`),
      h('button', { class: 'link', onclick: () => { S.secIdx = i; gotoStep('questions'); } }, 'この大問の作問へ →')));
}

function addSection(type) {
  S.project.sections.push(newSection(type));
  renumber(); markDirty(); render({ keepScroll: true });
  requestAnimationFrame(() => { const sc = $('.main-scroll'); if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' }); });
}

function moveSection(i, d) {
  const a = S.project.sections;
  [a[i], a[i + d]] = [a[i + d], a[i]];
  renumber(); markDirty(); render({ keepScroll: true });
}

async function deleteSection(i) {
  const s = S.project.sections[i];
  const msg = s.questions.length ? `大問${s.no}には作成済みの問題が${s.questions.length}問あります。まとめて削除しますか？` : `大問${s.no}を削除しますか？`;
  if (!await confirmBox(msg, { ok: '削除する', danger: true })) return;
  S.project.sections.splice(i, 1);
  if (S.secIdx >= S.project.sections.length) S.secIdx = Math.max(0, S.project.sections.length - 1);
  renumber(); markDirty(); render({ keepScroll: true });
}

function templateDialog() {
  let pick = 'comm2';
  const box = h('div', { class: 'tpl-grid' });
  const draw = () => box.replaceChildren(...TEMPLATES.filter(t => t.sections.length).map(t =>
    h('button', { class: 'tpl' + (pick === t.id ? ' on' : ''), onclick: () => { pick = t.id; draw(); } }, h('b', {}, t.name), h('small', {}, t.desc))));
  draw();
  openModal({
    title: 'ひな形を適用', size: 'md',
    body: h('div', { class: 'stack' }, box,
      S.project.sections.length ? h('div', { class: 'warn-box warn' }, icon('alert', 14), '今の大問構成はひな形に置き換わります（作成済みの問題も消えます）。') : null),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '適用する', kind: 'primary', fn: async c => {
        const has = S.project.sections.some(s => s.questions.length);
        if (has && !await confirmBox('作成済みの問題も含めて置き換えます。よろしいですか？', { ok: '置き換える', danger: true })) return;
        const t = TEMPLATES.find(x => x.id === pick);
        S.project.sections = t.sections.map(([type, count, pe]) => ({ ...newSection(type, count), points_each: pe }));
        if (t.points) S.project.exam.written_points = t.points;
        S.secIdx = 0; renumber(); markDirty(); c(); render();
      } },
    ],
  });
}

// ================================================================ 3. 作問

function renderQuestions() {
  const p = S.project;
  if (!p.sections.length) {
    return h('div', { class: 'step' }, stepHead('作問'),
      h('div', { class: 'card' }, emptyState('layers', 'まだ大問がありません', '「試験構成」で大問を組むか、教材の文から直接作問してください（大問は自動で作られます）。', [
        h('button', { class: 'btn primary', onclick: () => gotoStep('structure') }, icon('layers'), '試験構成へ'),
        h('button', { class: 'btn ghost', onclick: () => gotoStep('materials') }, icon('book'), '教材から作問')])));
  }
  if (S.secIdx >= p.sections.length) S.secIdx = 0;
  const si = S.secIdx, s = p.sections[si];

  const tabs = h('div', { class: 'sec-tabs', role: 'tablist' }, p.sections.map((x, i) =>
    h('button', { class: 'sec-tab' + (i === si ? ' on' : ''), role: 'tab', onclick: () => { S.secIdx = i; render(); } },
      h('b', {}, `大問${x.no}`), h('span', {}, SHORT[x.type] || x.type),
      h('em', { class: x.count && x.questions.length >= x.count ? 'full' : '' }, `${x.questions.length}/${x.count}問`))));

  const head = h('div', { class: 'card sec-head' },
    h('div', { class: 'sec-head-main' },
      h('div', { class: 'sec-head-title' }, `大問${s.no}　${TYPE_LABEL[s.type] || s.type}`, h('span', { class: 'pill' }, `${s.points_each}点 × ${s.count}問`)),
      h('p', { class: 'sec-instr' }, s.instructions || '（指示文は「試験構成」で入力できます）')),
    h('div', { class: 'sec-head-actions' },
      h('button', { class: 'btn primary', onclick: () => openQuick({ format: QUICK_FOR[s.type] || 'ai', target: si }) }, icon('sparkles'), 'クイック作問'),
      h('button', { class: 'btn ghost', onclick: () => gotoStep('materials') }, icon('book'), '教材から選ぶ'),
      h('button', { class: 'btn ghost', onclick: () => addBlankQuestion(si) }, icon('plus'), '空の問題'),
      h('button', { class: 'btn ghost', disabled: !S.status.ai, title: S.status.ai ? '教材からこの大問をSonnetが作問します' : 'APIキーを設定すると使えます', onclick: () => aiSection(si) }, icon('sparkles'), 'AIで一括作問')));

  const list = s.questions.length
    ? h('div', { class: 'q-list' }, s.questions.map((q, qi) => questionCard(s, si, q, qi)))
    : h('div', { class: 'card', style: { marginTop: '14px' } }, emptyState('edit', 'この大問にはまだ問題がありません',
      '「教材」で文をクリックして形式を選ぶか、「クイック作問」に英文を入れて作れます。'));

  return h('div', { class: 'step' },
    stepHead('作問', '問題文・解答・解答枠・出典を確認・編集します。赤いバッジは配布前に必ず解消してください。'),
    tabs, head, list);
}

function qBadges(q) {
  const b = [];
  if (!q.body.trim()) b.push(['bad', '問題文なし']);
  if (!q.answer.trim()) b.push(['bad', '解答なし']);
  if (!q.source_ref.trim()) b.push(['bad', '出典なし']);
  if (!q.alt_answer_risk.trim()) b.push(['warn', '別解未検討']);
  if (q.verdict) b.push(q.verdict.has_alternate_answer ? ['bad', 'AI: 別解の疑い'] : ['good', 'AI: 別解なし']);
  if (!b.length) b.push(['good', '入力OK']);
  return b.map(([c, t]) => h('span', { class: 'badge ' + c }, c === 'good' ? icon('check', 12) : c === 'bad' ? icon('alert', 12) : null, t));
}

function slotsOf(q) {
  if (Array.isArray(q.answer_slots) && q.answer_slots.some(x => String(x).trim())) return q.answer_slots;
  if (q.answer.includes(' / ')) return q.answer.split(' / ').map(x => x.trim());
  return [q.answer];
}

function slotRow(slots, labels) {
  return h('div', { class: 'slot-row' }, slots.map((x, i) =>
    h('div', { class: 'slot' }, h('small', {}, labels?.[i] || `枠${i + 1}`), h('span', {}, x))));
}

function questionCard(s, si, q, qi) {
  const badges = h('div', { class: 'badges' }, qBadges(q));
  const slotsBox = h('div', {}, slotRow(slotsOf(q), q.slot_labels));
  const refresh = () => { badges.replaceChildren(...qBadges(q)); slotsBox.replaceChildren(slotRow(slotsOf(q), q.slot_labels)); markDirty(); };
  const move = d => { const a = s.questions; [a[qi], a[qi + d]] = [a[qi + d], a[qi]]; renumber(); markDirty(); render({ keepScroll: true }); };

  const verdict = q.verdict ? h('div', { class: 'verdict ' + (q.verdict.has_alternate_answer ? 'bad' : 'good') },
    icon(q.verdict.has_alternate_answer ? 'alert' : 'check', 16),
    h('div', {}, h('b', {}, q.verdict.has_alternate_answer ? 'AIが別解の可能性を指摘しました' : 'AIチェック: 別解は見つかりませんでした'),
      q.verdict.explanation, q.verdict.has_alternate_answer && q.verdict.suggested_fix ? h('div', {}, '修正案: ' + q.verdict.suggested_fix) : null)) : null;

  return h('div', { class: 'card qcard', id: `q-${si}-${qi}` },
    h('div', { class: 'qhead' },
      h('span', { class: 'qnum' }, `(${q.number})`), badges,
      h('div', { class: 'qactions' },
        S.status.ai ? iconBtn('sparkles', 'AIで別解チェック', () => verifyOne(s, si, q, qi)) : null,
        iconBtn('up', '上へ', () => move(-1), { disabled: qi === 0 }),
        iconBtn('down', '下へ', () => move(1), { disabled: qi === s.questions.length - 1 }),
        iconBtn('copy', '複製', () => { s.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); renumber(); markDirty(); render({ keepScroll: true }); }),
        iconBtn('trash', '削除', async () => {
          if (!await confirmBox(`大問${s.no}の(${q.number})を削除しますか？`, { ok: '削除する', danger: true })) return;
          s.questions.splice(qi, 1); renumber(); markDirty(); render({ keepScroll: true });
        }, { danger: true }))),
    field('問題文（1行目に日本語訳、2行目以降に英文など。__語句__ で下線）',
      textarea({ value: q.body, rows: Math.min(6, Math.max(2, q.body.split('\n').length + 1)), cls: 'inp qbody', oninput: v => { q.body = v; refresh(); } })),
    h('div', { class: 'qgrid' },
      field('解答（模範解答に表示）', input({ value: q.answer, oninput: v => { q.answer = v; refresh(); } })),
      field('解答枠（枠ごとに / で区切る・1枠1語）', input({ value: (q.answer_slots || []).join(' / '), placeholder: '空欄なら解答を1枠として扱います',
        oninput: v => { const parts = v.split('/').map(x => x.trim()).filter(Boolean); q.answer_slots = parts.length ? parts : undefined; refresh(); } })),
      field('出典（必須）', input({ value: q.source_ref, placeholder: '例: L3 Part3①(6)／例文54', oninput: v => { q.source_ref = v; refresh(); } })),
      field('別解の検討メモ', input({ value: q.alt_answer_risk, placeholder: '例: is to get をチャンク化して文頭移動の別解を防止', oninput: v => { q.alt_answer_risk = v; refresh(); } }))),
    slotsBox, verdict);
}

function addBlankQuestion(si) {
  const s = S.project.sections[si];
  s.questions.push({ body: '', answer: '', source_ref: '', alt_answer_risk: '', focus: '', kind: s.type, number: 0 });
  renumber(); markDirty();
  S.highlight = { si, qi: s.questions.length - 1 };
  render({ keepScroll: true });
}

async function verifyOne(s, si, q, qi) {
  toast(`大問${s.no}の(${q.number})をチェック中…`);
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
  if (!S.project.materials.length) return toast('先に「教材」で教材を追加してください', 'error');
  if (!await confirmBox(`大問${s.no}（${SHORT[s.type]}）を、教材からAI（Sonnet）で${s.count}問作ります。\n作成された問題は末尾に追加されます（数十秒かかります）。`, { ok: '作問する' })) return;
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
  const key = JSON.stringify(chunks);
  if (R.key !== key || !R.order || R.order.length !== texts.length) { R.order = shuffled(texts.length); R.key = key; }
  const inner = R.order.map(k => texts[k]).join(' / ');
  res.body = `${units.slice(0, pre).join(' ')}（ ${inner} ）${units.slice(n - suf).join(' ')}${final}`;
  res.units = units; res.pre = pre; res.suf = suf; res.texts = texts; res.chunks = chunks;

  const p1 = R.p1, p2 = R.p2;
  if (texts.length < 3) res.error = '並べ替える語句が少なすぎます（3つ以上にしてください）';
  else if (Math.max(p1, p2) > texts.length || Math.min(p1, p2) < 1) res.error = `語句が${texts.length}個しかないので、${Math.max(p1, p2)}番目は答えさせられません`;
  else if (p1 === p2) res.error = '答えさせる2か所は別の位置にしてください';
  else {
    res.slots = [texts[p1 - 1], texts[p2 - 1]];
    res.answer = res.slots.join(' / ');
    res.labels = [`${p1}番目`, `${p2}番目`];
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

function buildQuick(Q, toks) {
  const res = { body: '', answer: '', slots: [], labels: null, warns: [], error: null };
  const f = Q.format;
  if (f === 'ai') {
    if (!Q.ai.result) { res.pending = true; return res; }
    const r = Q.ai.result;
    Object.assign(res, { body: r.body || '', answer: r.answer || '', slots: slotsOf({ answer: r.answer || '', answer_slots: r.answer_slots }), fromAI: true, verdict: r.verdict });
    if (!res.body || !res.answer) res.error = 'AIの結果に問題文か解答がありません';
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
        const L = ['ア', 'イ', 'ウ', 'エ'];
        res.body = cut(rg.a, rg.b, '（　　　　）') + '\n［ ' + choices.map((c, i) => `${L[i]} ${c || '＿＿'}`).join(' ／ ') + ' ］';
        res.answer = L[Q.C.pos]; res.slots = [L[Q.C.pos]];
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

function defaultTarget(fmt) {
  const secs = S.project.sections;
  if (S.step === 'questions' && secs[S.secIdx] && (QUICK_FOR[secs[S.secIdx].type] || 'ai') === fmt) return S.secIdx;
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
    R: { prefix: 0, suffix: 0, joins: {}, order: null, key: '', p1: 2, p2: 5, lower: true },
    C: { d: ['', '', ''], pos: Math.floor(Math.random() * 4) },
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
            h('div', { class: 'seg' }, ['ア', 'イ', 'ウ', 'エ'].map((L, k) => h('button', { class: 'seg-btn' + (Q.C.pos === k ? ' on' : ''), onclick: () => { Q.C.pos = k; drawAll(); } }, L))),
            h('button', { class: 'btn ghost sm', onclick: () => { Q.C.pos = Math.floor(Math.random() * 4); drawAll(); } }, icon('shuffle', 14), 'ランダム')));
        break;
      }
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
        h('button', { class: 'btn ghost sm', onclick: () => { R.order = shuffled(b.texts.length); drawPreview(); } }, icon('shuffle', 14), 'シャッフル')),
    ];
  }

  function aiBuilder() {
    const els = [
      h('div', { class: 'grid-2' },
        field('作りたい形式', select(AI_FORMATS, Q.ai.fmt, v => { Q.ai.fmt = v; Q.target = defaultTarget(v); drawPreview(); })),
        field('補足指示（任意）', input({ value: Q.ai.note, placeholder: '例: who が解答位置に来るように', oninput: v => { Q.ai.note = v; } }))),
    ];
    if (S.status.ai) {
      els.unshift(hint('Sonnetが対象文を無改変で使って作問し、別解チェックまで行います（10〜30秒）。'));
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
    const lines = body.split('\n');
    const targetOpts = [...secs.map((s, i) => [i, `大問${s.no}　${SHORT[s.type] || s.type}（${s.questions.length}/${s.count}問）`]), ['new', '＋ 新しい大問を作る']];
    const canAdd = !b.error && !b.pending && b.body;
    return h('div', { class: 'qk-card' },
      h('div', { class: 'qk-label' }, 'プレビュー'),
      b.pending ? h('div', { class: 'warn-box info' }, icon('sparkles', 14), S.status.ai ? '「AIで作問する」を押すと、ここに結果が出ます。' : '結果を貼り付けて取り込むと、ここに表示されます。') :
        h('div', { class: 'mini-paper' },
          h('div', {}, h('span', { class: 'num' }, '(1)'), rich(lines[0] || '')),
          lines.slice(1).map(l => h('div', { class: 'line2' }, rich(l)))),
      b.answer ? h('div', { class: 'ans-line' }, h('span', { class: 'tag' }, '解答'), b.answer) : null,
      b.slots.length && b.answer ? h('div', {}, h('div', { class: 'qk-label' }, '解答用紙の枠'), slotRow(b.slots, b.labels)) : null,
      b.error ? h('div', { class: 'warn-box error' }, icon('alert', 14), b.error) : null,
      b.verdict ? h('div', { class: 'warn-box ' + (b.verdict.has_alternate_answer ? 'warn' : 'ok') }, icon(b.verdict.has_alternate_answer ? 'alert' : 'check', 14),
        (b.verdict.has_alternate_answer ? 'AI: 別解の疑い — ' : 'AI: 別解なし — ') + b.verdict.explanation) : null,
      b.warns.map(w => h('div', { class: 'warn-box ' + w.lvl }, icon(w.lvl === 'info' ? 'check' : 'alert', 14), w.msg)),
      field('別解の検討メモ（自動で入ります・編集可）', textarea({ value: Q.altTouched ? Q.alt : autoAlt(b.warns), rows: 2, oninput: v => { Q.alt = v; Q.altTouched = true; } })),
      h('div', { class: 'add-row' },
        field('追加先', select(targetOpts, Q.target, v => { Q.target = v === 'new' ? 'new' : Number(v); })),
        h('button', { class: 'btn primary', disabled: !canAdd, onclick: addToExam }, icon('plus'), 'この問題を追加')));
  }

  function addToExam() {
    const b = built;
    if (!b || b.error || b.pending) return;
    const kind = Q.format === 'ai' ? Q.ai.fmt : Q.format;
    const q = {
      body: b.fromAI ? b.body : (Q.ja.trim() ? Q.ja.trim() + '\n' : '') + b.body,
      answer: b.answer, answer_slots: b.slots, slot_labels: b.labels || undefined,
      source_ref: Q.source.trim(), alt_answer_risk: Q.altTouched ? Q.alt : autoAlt(b.warns),
      focus: Q.focus, kind, number: 0, verdict: b.verdict || undefined,
    };
    let si = Q.target;
    if (si === 'new' || !p.sections[si]) {
      const type = kind === 'reorder_4th_8th' ? 'reorder_2nd_5th' : kind;
      p.sections.push(newSection(TYPE_LABEL[type] ? type : 'other', 0));
      si = p.sections.length - 1;
    }
    const s = p.sections[si];
    s.questions.push(q);
    let grew = false;
    if (s.questions.length > s.count) { s.count = s.questions.length; grew = true; }
    renumber(); markDirty(); close();
    S.issues = null;
    toast(`大問${s.no}の(${q.number})に追加しました` + (grew ? `（問数を${s.count}問に増やしました。配点を確認してください）` : ''), 'ok',
      { label: '確認する', fn: () => { S.secIdx = si; S.highlight = { si, qi: s.questions.length - 1 }; gotoStep('questions'); } });
    if (S.step === 'questions') { S.secIdx = si; S.highlight = { si, qi: s.questions.length - 1 }; render({ keepScroll: true }); }
  }

  const left = h('div', { class: 'qk-left' },
    field('対象の英文（本文のまま出題に使われます）', textarea({ value: Q.text, rows: 3, cls: 'inp en', 'data-autofocus': !Q.text || null,
      placeholder: '例: She is the girl who I think will win the prize.',
      oninput: v => { Q.text = v; Q.marks = {}; Q.R = { ...Q.R, prefix: 0, suffix: 0, joins: {}, order: null, key: '' }; Q.ai.result = null; builderBox.replaceChildren(builder()); drawPreview(); } })),
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
  const m = text.match(/大問(\d+)(?:\((\d+)\))?/);
  if (!m) return gotoStep('structure');
  const si = Number(m[1]) - 1;
  if (!m[2]) { S.secIdx = si; return gotoStep(/配点/.test(text) ? 'structure' : 'questions'); }
  S.secIdx = si;
  S.highlight = { si, qi: Number(m[2]) - 1 };
  gotoStep('questions');
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
    lines.push(`【大問${s.no}】${TYPE_LABEL[s.type] || s.type}`, `指示文: ${s.instructions}`);
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
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Sonnetが各問について「別解がある」と反証するつもりで検証します。'),
      S.verify ? [h('div', { class: 'progress' }, h('i', { style: { width: (S.verify.done / S.verify.total * 100) + '%' } })), h('div', { class: 'muted' }, `${S.verify.done} / ${S.verify.total}問 チェック中…`)]
        : h('button', { class: 'btn primary', onclick: verifyAll }, icon('sparkles'), '全問をAIでチェック'),
      h('p', { class: 'muted' }, `チェック済み ${checked} / ${total}問`),
    ] : [
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'API抜きモードです。下のボタンで全問の「別解チェック依頼文」をコピーし、Claude / Codex に貼り付けて確認できます。'),
      h('button', { class: 'btn ghost', onclick: () => copyText(buildVerifyPrompt(), '別解チェック依頼文をコピーしました') }, icon('clipboard'), '別解チェック依頼文をコピー'),
    ],
    flagged.length ? h('ul', { class: 'issue-list', style: { marginTop: '12px' } }, flagged.map(([s, si, q, qi]) => h('li', {},
      h('button', { class: 'issue', onclick: () => { S.secIdx = si; S.highlight = { si, qi }; gotoStep('questions'); } },
        icon('alert', 15), h('span', {}, `大問${s.no}(${q.number}): ${q.verdict.explanation.slice(0, 60)}…`), h('span', { class: 'issue-go' }, '確認 →'))))) : null);

  const done = CHECKLIST.filter(([k]) => p.checklist[k]).length;
  const list = h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('check'), '配布前の最終確認', h('span', { class: 'pill right' }, `${done} / ${CHECKLIST.length}`)),
    h('div', { class: 'checklist' }, CHECKLIST.map(([k, label]) =>
      h('label', { class: 'check' + (p.checklist[k] ? ' done' : '') },
        h('input', { type: 'checkbox', checked: p.checklist[k], onchange: e => { p.checklist[k] = e.target.checked; markDirty(); render({ keepScroll: true }); } }),
        h('span', {}, label)))));

  return h('div', { class: 'step' },
    stepHead('チェック', '機械で確実に見つけられるものは自動で、別解は AI または依頼文で、最後に教員が確認します。'),
    h('div', { class: 'check-grid' }, auto, h('div', { class: 'stack' }, ai, list)));
}

// ================================================================ 5. 出力

async function doExport() {
  try {
    await flushSave();
    const r = await api('POST', `projects/${S.project.id}/export`);
    S.exportFiles = r.files;
    S.exportIssues = r.issues;
    toast('ファイルを作成しました。下のリンクからダウンロードできます', 'ok');
    render({ keepScroll: true });
  } catch (e) { toast(e.message, 'error'); }
}

function paperView(kind) {
  const p = S.project;
  const paper = h('div', { class: 'paper' },
    h('div', { class: 'paper-title' }, p.exam.title + (kind === 'sheet' ? '　解答用紙' : kind === 'model' ? '　模範解答' : '')));
  if (kind === 'sheet') paper.append(h('div', { class: 'paper-name' }, '　　年　　組　　番　氏名＿＿＿＿＿＿＿＿＿＿＿'));
  p.sections.forEach(s => {
    if (!s.questions.length) return;  // 未作成の大問は用紙に出さない
    if (kind === 'exam') {
      paper.append(h('div', { class: 'paper-sec' }, `${s.no}　${s.instructions}（${s.points_each * s.questions.length}点）`));
      s.questions.forEach(q => {
        const lines = q.body.split('\n');
        paper.append(h('div', { class: 'paper-q' }, h('span', { class: 'paper-qn' }, `(${q.number})`),
          h('div', {}, lines.map(l => h('div', {}, rich(l))))));
      });
      return;
    }
    paper.append(h('div', { class: 'paper-sec' }, `${s.no}　【${s.points_each}点×${s.questions.length}】`));
    const slots = s.questions.map(slotsOf);
    const width = Math.max(...slots.map(x => x.length));
    const labels = s.questions.find(q => q.slot_labels)?.slot_labels;
    const long = s.type === 'translation' || s.type === 'underline_grammar';
    const table = h('table', {});
    if (labels) table.append(h('tr', {}, h('td', { class: 'qn lbl' }), [...Array(width).keys()].map(j => h('td', { class: 'lbl' }, labels[j] || ''))));
    s.questions.forEach((q, i) => table.append(h('tr', {}, h('td', { class: 'qn' }, `(${q.number})`),
      [...Array(width).keys()].map(j => j < slots[i].length
        ? h('td', { class: long ? 'long' : '' }, kind === 'model' ? slots[i][j] : '')
        : h('td', { class: 'na' })))));
    paper.append(table);
  });
  if (kind !== 'exam') {
    const total = p.sections.reduce((a, s) => a + s.points_each * s.questions.length, 0);
    paper.append(h('div', { class: 'paper-score' }, `得点　　　　／${p.exam.written_points || total}`));
  } else paper.append(h('div', { class: 'paper-score' }, '問題は以上です。'));
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

function settingsDialog() {
  const st = S.status;
  let key = '';
  openModal({
    title: 'AI機能の設定', size: 'md',
    body: h('div', { class: 'stack' },
      h('div', { class: 'warn-box ' + (st.ai ? 'ok' : 'info') }, icon(st.ai ? 'check' : 'key', 14),
        st.ai ? 'AI機能が使えます（作問: Sonnet／別解チェック: Sonnet）' : 'いまは API抜きモードです。クイック作問（手作業）とチェック・出力はすべて無料で使えます。'),
      h('p', { class: 'muted', style: { margin: 0 } }, 'APIキーを入れると「AIで一括作問」「AIで作問する」「AIで別解チェック」が使えます。キーはこのツールを閉じるまでの間だけ保持され、ファイルには保存されません。'),
      !st.anthropic_installed ? h('div', { class: 'warn-box warn' }, icon('alert', 14), 'AI用のパッケージが未インストールです。黒い画面で「python -m pip install anthropic」を実行してから起動し直してください。') : null,
      field('APIキー（sk-ant-…）', input({ type: 'password', placeholder: st.key_set ? '設定済み（変更する場合のみ入力）' : 'sk-ant-...', oninput: v => { key = v; } }))),
    actions: [
      st.key_set ? { label: 'キーを消去', fn: async c => { S.status = (await api('POST', 'settings/apikey', { key: '' })).status; c(); render({ keepScroll: true }); toast('APIキーを消去しました', 'ok'); } } : null,
      { label: '閉じる', fn: c => c() },
      { label: '保存', kind: 'primary', fn: async c => {
        if (!key.trim()) return toast('APIキーを入力してください', 'error');
        try {
          S.status = { ...S.status, ...(await api('POST', 'settings/apikey', { key })).status };
          c(); render({ keepScroll: true });
          toast(S.status.ai ? 'AI機能が使えるようになりました' : 'キーは保存しましたが、パッケージが不足しています', S.status.ai ? 'ok' : 'error');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

function helpDialog() {
  const steps = [
    ['教材を入れる', 'Wordファイルをドロップするか、本文を貼り付けます。スキャンPDFは文字にしてから貼り付けます。'],
    ['試験構成を決める', 'ひな形を選ぶか、大問を追加して形式・問数・配点を決めます。配点メーターが緑なら満点と一致。'],
    ['作問する', '教材の文をクリック → 形式を選ぶ → 語をクリックするだけで、問題文・解答・解答枠ができます。'],
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
      h('p', { class: 'muted', style: { margin: 0 } }, `データの保存先: ${S.status.workspace || 'exam_workspace'}（試験の実物を含むため、生徒が見られる場所に置かないでください）`)),
    actions: [{ label: '閉じる', kind: 'primary', fn: c => c() }],
  });
}

// ================================================================ 起動

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (fabEl) return hideFab();
    if (modalStack.length) modalStack[modalStack.length - 1]();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (S.project) saveNow().then(() => toast('保存しました', 'ok'));
  }
});

window.addEventListener('popstate', async () => {
  const m = location.hash.match(/^#\/p\/([0-9a-f]{12})$/);
  if (m && (!S.project || S.project.id !== m[1])) { await flushSave(); openProject(m[1]).catch(() => {}); }
  else if (!m && S.project) goHome();
});

async function boot() {
  try { S.status = await api('GET', 'status'); } catch (e) { toast(e.message, 'error'); }
  const m = location.hash.match(/^#\/p\/([0-9a-f]{12})$/);
  if (m) { try { await openProject(m[1]); return; } catch { history.replaceState(null, '', location.pathname); } }
  render();
  await loadProjects();
  render();
}

boot();
