'use strict';
/*
 * 試験のレイアウト計算（番号・配点・選択肢記号・解答用紙の詰め方）。
 * exam_app/layout.py と同じ規則。Word出力と画面のプレビューがずれないよう、変えるときは両方を直す。
 */

const CHOICE_MARKS = {
  '1': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
  'ア': [...'アイウエオカキクケコサシ'],
  '①': [...'①②③④⑤⑥⑦⑧⑨⑩⑪⑫'],
  'a': [...'abcdefghijkl'],
};
const CHOICE_STYLES = [['1', '1. 2. 3. 4.'], ['ア', 'ア イ ウ エ'], ['①', '① ② ③ ④'], ['a', 'a. b. c. d.']];
const LONG_TYPES = new Set(['translation', 'writing', 'qa', 'table_fill', 'paraphrase', 'underline_grammar', 'rewrite', 'referent']);
const MARK_TYPES = new Set(['choice_4', 'choice_3', 'definition', 'listen_meaning', 'vocab_meaning', 'vocab_word',
  'vocab_context', 'content_match', 'accent', 'pattern', 'reading_misfit', 'listening_choice', 'synonym']);

function markOf(style, i) {
  const m = CHOICE_MARKS[style || '1'] || CHOICE_MARKS['1'];
  return i >= 0 && i < m.length ? m[i] : String(i + 1);
}

function choiceLine(style, choices) {
  return (choices || []).map((c, i) => ['1', 'a'].includes(style || '1') ? `${markOf(style, i)}. ${c}` : `${markOf(style, i)} ${c}`);
}

function slotsOf(q) {
  if (Array.isArray(q.answer_slots) && q.answer_slots.some(x => String(x).trim())) return q.answer_slots;
  const a = String(q.answer || '');
  if (a.includes(' / ')) return a.split(' / ').map(x => x.trim());
  return [a];
}

function qPoints(s, q) {
  return q.points != null && q.points !== '' && !isNaN(+q.points) ? +q.points : +s.points_each || 0;
}
function sectionPoints(s) { return s.questions.reduce((a, q) => a + qPoints(s, q), 0); }
function plannedPoints(s) {
  const base = +s.points_each || 0;
  return base * (+s.count || 0) + s.questions.reduce((a, q) => a + qPoints(s, q) - base, 0);
}

function pointsLabel(s, labels) {
  // いちばん多い配点を基準にする（同数なら大問の配点）
  const pts = s.questions.map(q => qPoints(s, q));
  const score = v => pts.filter(x => x === v).length * 2 + (v === (+s.points_each || 0) ? 1 : 0);
  const base = pts.length ? [...new Set(pts)].sort((a, b) => score(b) - score(a) || a - b)[0] : 0;  // 同点なら小さい配点（layout.py と同じ）
  const odd = pts.map((p, i) => [i, p]).filter(([, p]) => p !== base);
  if (!odd.length) return `【${base}点×${s.questions.length}】`;
  return `【${base}点×${s.questions.length - odd.length}・${odd.map(([i, p]) => `${labels ? labels[i] : `(${i + 1})`}のみ${p}点`).join('・')}】`;
}

function perSlot(q) { return String(q.kind || '').startsWith('reorder') && Array.isArray(q.slot_labels) && q.slot_labels.length > 0; }

/** 問題番号。大問ごとに [{label, cell, slots}]。通し番号では並び替えの答える箇所ごとに番号を振る */
function numberPlan(p) {
  const global = p.exam.numbering === 'global';
  const hidden = hiddenIndices(p.sections);  // 用紙に出さない（下書き）大問は通し番号を使わない
  let n = 1;
  return p.sections.map((s, si) => s.questions.map((q, i) => {
    if (!global || hidden.has(si)) return { label: `(${i + 1})`, cell: `(${i + 1})`, slots: null };
    if (perSlot(q)) {
      const nums = slotsOf(q).map(() => String(n++));
      return { label: `(${i + 1})`, cell: `(${i + 1})`, slots: nums };
    }
    const k = n++;
    return { label: `${k}.`, cell: String(k), slots: null };
  }));
}

function perRowOf(s) {
  if (+s.per_row > 0) return +s.per_row;
  if (!s.questions.length) return 1;
  const width = Math.max(...s.questions.map(q => slotsOf(q).length));
  if (LONG_TYPES.has(s.type)) return 1;
  if (width === 1) return MARK_TYPES.has(s.type) || s.questions.every(q => q.choices && q.choices.length) ? 5 : 3;
  if (width === 2) return 2;
  return 1;
}

function reorderLine(q, labels) {
  const r = q.reorder || {};
  if (!r.line || !r.n) return '';
  const pos = r.pos || [];
  const cells = [];
  for (let i = 1; i <= r.n; i++) {
    const k = pos.indexOf(i);
    cells.push(k >= 0 && k < labels.length ? `( ${labels[k]} )` : '(　　)');
  }
  return [r.before, cells.join(' '), r.after].filter(Boolean).join(' ').trim();
}

const ZEN = s => String(s).replace(/[0-9]/g, d => '０１２３４５６７８９'[d]);

function headingText(exam, s) {
  const instr = (s.instructions || '').trim();
  if (!s.questions.length) return exam.heading === 'bracket' ? `【${s.no}】${instr}` : `${ZEN(s.no)}　${instr}`;
  const pts = new Set(s.questions.map(q => qPoints(s, q)));
  if (exam.heading === 'bracket') return `【${s.no}】${instr}${pts.size === 1 ? `（各${[...pts][0]}点）` : `（${sectionPoints(s)}点）`}`;
  return `${ZEN(s.no)}　${instr}（${sectionPoints(s)}点）`;
}

/** 選択式の正解の記号を、大問の記号の種類に合わせて振り直す */
function syncChoiceAnswers(s) {
  s.questions.forEach(q => {
    if (Array.isArray(q.choices) && q.choices.length && Number.isInteger(q.correct)) {
      q.answer = markOf(s.choice_style, q.correct);
      q.answer_slots = [q.answer];
    } else if (Number.isInteger(q.bank_idx)) {  // 語群から選ぶ問題（英英定義など）
      q.answer = markOf(s.bank_style || s.choice_style, q.bank_idx);
      q.answer_slots = [q.answer];
    }
  });
}

/** 正解記号の出現回数（偏りの確認用） */
function answerBalance(s) {
  const counts = {};
  s.questions.forEach(q => {
    const a = String(q.answer || '').trim();
    if (a && a.length <= 2) counts[a] = (counts[a] || 0) + 1;
  });
  return counts;
}

// ---------------------------------------------------------------- 大問のまとまり（layout.py と同じ）
// sections の1つ1つは「設問」。new_big=false は直前の大問の続き（同じ本文を使う問2・問3…）

/** 大問ごとに設問の添字をまとめる。例: [[0], [1, 2, 3], [4]] */
function groupsOf(sections) {
  const out = [];
  sections.forEach((s, i) => { if (!out.length || s.new_big !== false) out.push([i]); else out[out.length - 1].push(i); });
  return out;
}

/** no（大問番号）・part（問番号。設問が1つなら0）・label（「大問2 問1」）を振る。
 *  「用紙に出さない」大問は番号を使わず「下書き1」と呼ぶ（印刷される大問の番号は詰める） */
function applyLabels(sections) {
  let n = 0, d = 0;
  groupsOf(sections).forEach(g => {
    const multi = g.length > 1;
    const hide = !!sections[g[0]].hide;
    if (hide) d++; else n++;
    g.forEach((i, k) => {
      const s = sections[i];
      s.no = hide ? 0 : n; s.part = multi ? k + 1 : 0; s.new_big = k === 0;
      const base = hide ? `下書き${d}` : `大問${n}`;
      s.label = multi ? `${base} 問${k + 1}` : base;
    });
  });
}

function hiddenIndices(sections) {
  const out = new Set();
  groupsOf(sections).forEach(g => { if (sections[g[0]].hide) g.forEach(i => out.add(i)); });
  return out;
}

/** 用紙に出す設問だけ */
function visibleSections(sections) {
  const hid = hiddenIndices(sections);
  return sections.filter((_, i) => !hid.has(i));
}

// ---------------------------------------------------------------- 用紙のレイアウト（layout.py と同じ）

const PAPER_DEFAULT = { size: 'A4', orient: 'portrait', columns: 1, font_size: 10.5, font: 'mincho', margin: 'normal', line: 'normal', sheet: 'A4', answer_height: 'normal' };
const PAPER_SIZES = { A4: [210, 297], B4: [257, 364], A3: [297, 420] };
const MARGINS = { narrow: 10, normal: 16, wide: 22 };
const LINE = { compact: 1.0, normal: 1.1, loose: 1.4 };
const SHEETS = { A4: ['A4', 'portrait'], B4: ['B4', 'portrait'], A3L: ['A3', 'landscape'] };

function paperOf(exam) { return { ...PAPER_DEFAULT, ...(exam.paper || {}) }; }
function pageMm(size, orient) {
  const [w, hh] = PAPER_SIZES[size] || PAPER_SIZES.A4;
  return orient === 'landscape' ? [hh, w] : [w, hh];
}

/** 選択肢の並べ方: row（横一列）/ column（縦）/ grid2（2つずつ2段）。自動は短ければ横、文なら縦 */
function choiceMode(s, q) {
  const mode = s.choice_layout || 'auto';
  if (['row', 'column', 'grid2'].includes(mode)) return mode;
  return Math.max(0, ...(q.choices || []).map(c => String(c).length)) <= 18 ? 'row' : 'column';
}

function bigHeadingText(exam, secs) {
  const head = secs[0];
  const instr = (head.big_title || '').trim();
  const total = secs.reduce((a, s) => a + sectionPoints(s), 0);
  return exam.heading === 'bracket' ? `【${head.no}】${instr}（${total}点）` : `${ZEN(head.no)}　${instr}（${total}点）`;
}

function partHeadingText(exam, s) {
  const instr = (s.instructions || '').trim();
  const pts = new Set(s.questions.map(q => qPoints(s, q)));
  const p = pts.size === 1 && s.questions.length > 1 ? `（各${[...pts][0]}点）` : `（${sectionPoints(s)}点）`;
  return `問${s.part || 1}　${instr}${s.questions.length ? p : ''}`;
}
