'use strict';
/*
 * テンプレート（試験の「型」＝大問の構成・配点・指示文・用紙の体裁）とカテゴリーの管理。
 * 標準テンプレートは実物の定期考査・英単語テストの形式をもとにしている（問題そのものは含まない）。
 * 自分で作ったテンプレートは保存先の templates.json に保存される。
 */

// 実物の表紙にある受験上の注意
const COVER_CAUTIONS = [
  '試験開始の合図があるまでこの問題冊子を開いてはいけません。',
  'リスニング問題は試験開始５分後に放送します。予め問題を見ても構いません。',
  '試験中は監督者の指示に従いなさい。',
  '解答は全て解答用紙の枠内に丁寧な文字で記入し、解答用紙は必要以上に折り曲げないこと。',
  '問題の指示がある場合はそれに従いなさい。',
  '「ｖ に見える ｒ」や「ｎ に見える ｈ」など紛らわしいと採点者が判断した文字は採点対象外となる。また、機械による読取りが出来ない文字や、読み取れないほど薄い文字も採点対象外とする。',
].join('\n');

/** テンプレートの大問を短く書くための関数 */
function T(type, count, points_each, instructions, extra = {}) {
  return { type, count, points_each, instructions: instructions ?? DEFAULT_INSTR[type] ?? '', ...extra };
}

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin:comm1', builtin: true, name: '英語コミュニケーションⅠ型', category: '定期考査',
    desc: 'リスニング → 語義 → 空所補充 → 並べ替え → アクセント → 表 → 内容一致 → 英作文・Retelling（表紙・通し番号）',
    exam: { written_points: 90, numbering: 'global', heading: 'number', sheet_fields: '組,番,氏名,得点',
      cover: { enabled: true, grade: '１学年', subject: '英語コミュニケーションⅠ', name: '　学期　　試験', cautions: COVER_CAUTIONS } },
    sections: [
      T('listening', 8, 1, 'No.1　放送を聞いて英文の空欄に聞き取った語を補いなさい。英語は２回放送されます。'),
      T('qa', 1, 2, 'No.1の英文の直後に流れる質問に対し、英語で答えなさい。'),
      T('listening', 8, 1, 'No.2　放送を聞いて英文の空欄に聞き取った語を補いなさい。英語は２回放送されます。'),
      T('qa', 1, 2, 'No.2の英文の直後に流れる質問に対し、英語で答えなさい。'),
      T('listening_choice', 5, 1, 'No.3　対話を聞き、最後の文に対する応答として最も適切なものを1〜3から選び、番号で答えなさい。選択肢は全て放送されます。'),
      T('definition', 5, 2, '次の英文が定義する英単語を下の語群から選び、記号で答えなさい。', { choice_style: 'ア' }),
      T('fill_blank', 5, 2, '日本語の意味に合うように、空所に適語を１語ずつ入れなさい。'),
      T('reorder_2nd_5th', 5, 2, '日本語の意味に合うように［　］内の語句を並べ替えたとき、解答番号のある（　）に入る語句を番号で答えなさい。なお、文頭に来るべき語も小文字にしてある。'),
      T('accent', 4, 1),
      T('table_fill', 3, 2),
      T('content_match', 5, 2, '本文の内容に合うものとして最も適切なものを(a)〜(d)から選び、記号で答えなさい。', { choice_style: 'a' }),
      T('writing', 4, 3, '日本語の意味を表す英文を書きなさい。ただし、指示がある場合はそれに従うこと。'),
      T('writing', 1, 3, 'Retelling　指示に従って英語で答えなさい。', {
        scoring_note: '文の形式を保っていない文・同一内容の繰り返し・質問内容を理解していないと思われるものを除き、３文以上→３点　２文→２点　１文→１点　０文→０点' }),
    ],
  },
  {
    id: 'builtin:comm2', builtin: true, name: '英語コミュニケーションⅡ型', category: '定期考査',
    desc: '空所補充 → 読解 → 語句選択 → 語句挿入 → 英文解釈 → 並び替え → 長文 → 語群選択（大問ごとの番号）',
    exam: { written_points: 80, numbering: 'section', heading: 'number', sheet_fields: '組,番,氏名,得点', cover: { enabled: false } },
    sections: [
      T('fill_blank', 9, 1), T('reading_misfit', 3, 2), T('choice_4', 4, 1), T('insertion', 5, 2),
      T('translation', 4, 4), T('reorder_2nd_5th', 5, 2), T('content_match', 5, 3, null, { choice_style: '1' }), T('choice_4', 10, 1),
    ],
  },
  {
    id: 'builtin:drill', builtin: true, name: '英語演習型', category: '定期考査',
    desc: '英文識別 → 文型 → 空所選択 → 誤文訂正 → 並べ替え（不要語あり） → 空所補充 → 同意文 → 書き換え → 英作文',
    exam: { written_points: 94, numbering: 'global', heading: 'number', sheet_fields: '組,番,氏名,瞬英,合計', cover: { enabled: false } },
    sections: [
      T('choice_4', 3, 2, '次の各問いの指示に従い、最も適切な英文をア〜ウから選び、記号で答えなさい。'),
      T('pattern', 5, 1, '次の英文と同じ文型の英文を、下記のア〜オから１つずつ選び、記号を答えなさい。'),
      T('choice_4', 19, 1, '次の文の空所に入れるのに最も適当なものを１つずつ選び、記号を答えなさい。'),
      T('error_correction', 7, 2, null, { scoring_note: '①誤りの箇所と②正しい形を各1点（②のみ正解でも1点）' }),
      T('reorder_2nd_5th', 7, 2, '以下の日本語の意味に合う英文になるように下の語(句)を並べかえ、解答番号のある空欄に入る記号を答えなさい。ただし、それぞれ１つ不要な選択肢が含まれているので注意すること。また、先頭にくる語も小文字で書かれているので注意すること。',
        { scoring_note: '解答番号2つとも正解の場合のみ得点' }),
      T('fill_blank', 7, 2, '日本語の意味に合う英文になるように、空所に入る語を前から順に答えなさい。', { scoring_note: '完答で得点（大・小文字ミスは減点なし）' }),
      T('paraphrase', 4, 2, null, { scoring_note: '完答で得点（大・小文字ミスは減点なし）' }),
      T('rewrite', 4, 2, null, { scoring_note: '大・小文字ミス・記号忘れは減点なし。名詞・形容詞・副詞のスペルミスは1つまで減点1、それ以外のミスは1つでも不正解' }),
      T('writing', 3, 2, '日本文を英語に直しなさい。最後の問いは、質問に対して自分自身の言葉（英語）で答えなさい。'),
    ],
  },
  {
    id: 'builtin:vocab', builtin: true, name: '英単語テスト型（100問）', category: '英単語テスト',
    desc: 'Listening → 英英定義 → 英→日 → 日→英 → 例文4択 → 例文の綴り（【1】形式・通し番号・各1点）',
    exam: { written_points: 100, numbering: 'global', heading: 'bracket', sheet_fields: '組,番,氏名,得点', cover: { enabled: false },
      end_note: '問題は以上です。スペルミス、マークミスや時制等、よく見直しましょう。' },
    sections: [
      T('listen_meaning', 10, 1), T('definition', 5, 1), T('vocab_meaning', 20, 1),
      T('vocab_word', 25, 1), T('vocab_context', 20, 1), T('vocab_spelling', 20, 1),
    ],
  },
  {
    id: 'builtin:quiz', builtin: true, name: '単語小テスト（20問）', category: '小テスト',
    desc: '英→日の4択10問と、例文の綴り10問。授業の小テストに',
    exam: { written_points: 20, numbering: 'global', heading: 'bracket', sheet_fields: '組,番,氏名,得点', cover: { enabled: false } },
    sections: [T('vocab_meaning', 10, 1), T('vocab_spelling', 10, 1)],
  },
  {
    id: 'builtin:blank', builtin: true, name: '白紙から', category: 'その他',
    desc: '大問を自分で組み立てる',
    exam: { written_points: 100, numbering: 'section', heading: 'number', sheet_fields: '組,番,氏名,得点', cover: { enabled: false } },
    sections: [],
  },
];

// ================================================================ 読み込み・共通

async function loadConfig() {
  try { S.config = await api('GET', 'config'); } catch { /* 既定値のまま */ }
  try { S.userTemplates = (await api('GET', 'templates')).templates; } catch { S.userTemplates = []; }
}

function allTemplates() { return [...BUILTIN_TEMPLATES, ...(S.userTemplates || [])]; }
function findTemplate(id) { return allTemplates().find(t => t.id === id); }

/** カテゴリーの一覧（設定の順。試験やテンプレートにだけあるカテゴリーも末尾に足す） */
function categoryList() {
  const cats = [...(S.config?.categories || [])];
  const extra = [...(S.projects || []).map(p => p.category), ...(S.userTemplates || []).map(t => t.category)];
  extra.forEach(c => { if (c && !cats.includes(c)) cats.push(c); });
  return cats;
}

function templatePoints(t) { return t.sections.reduce((a, s) => a + (+s.points_each || 0) * (+s.count || 0), 0); }

/** テンプレートの大問 → 試験の大問（sid は新しく振る） */
function sectionsFromTemplate(t) {
  return t.sections.map(s => ({
    ...newSection(s.type, +s.count || 0),
    points_each: +s.points_each || 0,
    instructions: s.instructions ?? DEFAULT_INSTR[s.type] ?? '',
    choice_style: s.choice_style || DEFAULT_STYLE[s.type] || '1',
    per_row: +s.per_row || 0,
    bank: [...(s.bank || [])],
    bank_style: s.bank_style || '',
    scoring_note: s.scoring_note || '',
  }));
}

function examFromTemplate(t) {
  const e = t.exam || {};
  return {
    written_points: e.written_points ?? templatePoints(t),
    numbering: e.numbering || 'section', heading: e.heading || 'number',
    sheet_fields: e.sheet_fields || '組,番,氏名,得点',
    cover: { enabled: false, grade: '', subject: '', name: '', cautions: '', ...(e.cover || {}) },
    end_note: e.end_note || '問題は以上です。',
  };
}

/** テンプレートの説明（大問数・配点・体裁） */
function templateMeta(t) {
  const e = t.exam || {};
  if (!t.sections.length) return '大問なし';
  return [`大問${t.sections.length}`, `${templatePoints(t)}点`, e.numbering === 'global' ? '通し番号' : '大問ごとの番号',
    e.heading === 'bracket' ? '【1】見出し' : null, e.cover?.enabled ? '表紙あり' : null].filter(Boolean).join('・');
}

/** テンプレートを選ぶ一覧（新規作成・適用で共通） */
function templatePicker(st, onPick) {
  const box = h('div', { class: 'tpl-pick' });
  const draw = () => {
    const list = allTemplates().filter(t => st.showAll || !st.category || t.category === st.category || t.id === 'builtin:blank');
    setChildren(box,
      h('div', { class: 'tpl-grid' }, list.map(t => h('button', {
        class: 'tpl' + (st.tpl === t.id ? ' on' : ''), type: 'button',
        onclick: () => { st.tpl = t.id; onPick && onPick(t); draw(); },
      }, h('div', { class: 'tpl-row' }, h('b', {}, t.name), t.builtin ? h('span', { class: 'pill' }, '標準') : h('span', { class: 'pill mine' }, '自作')),
        h('small', {}, templateMeta(t) + (t.desc ? '　' + t.desc : ''))))),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: st.showAll, onchange: e => { st.showAll = e.target.checked; draw(); } }),
        '他のカテゴリーのテンプレートも表示'));
  };
  draw();
  box.redraw = draw;
  return box;
}

// ================================================================ ホームの「テンプレート」タブ

function renderTemplatesView() {
  const cats = categoryList();
  const all = allTemplates();
  const groups = cats.map(c => [c, all.filter(t => t.category === c)]).filter(([, l]) => l.length);
  const orphan = all.filter(t => !cats.includes(t.category));
  if (orphan.length) groups.push(['（カテゴリーなし）', orphan]);
  return h('div', { class: 'tpl-view' },
    h('div', { class: 'tpl-intro' },
      h('div', {}, h('b', {}, 'テンプレート＝試験の「型」'),
        h('p', { class: 'muted' }, '大問の構成・配点・指示文・番号の振り方・表紙などを保存しておき、新しい試験の土台にします（問題そのものは含みません）。標準テンプレートは「複製して編集」で自分用に作り変えられます。')),
      h('button', { class: 'btn primary', onclick: () => templateEditor(null) }, icon('plus'), '新しいテンプレート')),
    groups.map(([cat, list]) => h('section', { class: 'tpl-group' },
      h('h3', {}, cat, h('span', { class: 'pill' }, list.length)),
      h('div', { class: 'tpl-cards' }, list.map(templateCard)))));
}

function templateCard(t) {
  return h('div', { class: 'tpl-card' },
    h('div', { class: 'tpl-card-head' }, h('b', {}, t.name), t.builtin ? h('span', { class: 'pill' }, '標準') : h('span', { class: 'pill mine' }, '自作')),
    h('div', { class: 'tpl-meta' }, templateMeta(t)),
    t.desc ? h('p', { class: 'tpl-desc' }, t.desc) : null,
    t.sections.length ? h('div', { class: 'tpl-secs' }, t.sections.map((s, i) =>
      h('span', { class: 'tpl-sec', title: TYPE_LABEL[s.type] || s.type }, h('i', {}, i + 1), SHORT[s.type] || s.type, h('small', {}, `${s.count}×${s.points_each}`)))) : null,
    h('div', { class: 'tpl-actions' },
      h('button', { class: 'btn primary sm', onclick: () => newProjectDialog({ tpl: t.id }) }, icon('plus', 14), 'この形で試験を作る'),
      t.builtin
        ? h('button', { class: 'btn ghost sm', onclick: () => templateEditor(copyTemplate(t)) }, icon('copy', 14), '複製して編集')
        : [h('button', { class: 'btn ghost sm', onclick: () => templateEditor(t) }, icon('edit', 14), '編集'),
          iconBtn('copy', '複製', () => templateEditor(copyTemplate(t))),
          iconBtn('trash', '削除', () => deleteTemplate(t), { danger: true })]));
}

function copyTemplate(t) {
  const c = JSON.parse(JSON.stringify(t));
  delete c.id; delete c.builtin;
  c.name = t.name + '（コピー）';
  return c;
}

async function deleteTemplate(t) {
  if (!await confirmBox(`テンプレート「${t.name}」を削除しますか？\n（このテンプレートから作った試験は消えません）`, { ok: '削除する', danger: true })) return;
  try {
    await api('DELETE', `templates/${t.id}`);
    S.userTemplates = S.userTemplates.filter(x => x.id !== t.id);
    toast('削除しました', 'ok'); render();
  } catch (e) { toast(e.message, 'error'); }
}

// ================================================================ テンプレートの編集

/** テンプレート編集。t が null なら新規、id がなければ新規保存（複製） */
function templateEditor(t) {
  const isNew = !t || !t.id;
  const src = t ? JSON.parse(JSON.stringify(t)) : null;
  const d = {
    name: src?.name || '', category: src?.category || (S.filterCat !== 'all' ? S.filterCat : categoryList()[0] || '定期考査'),
    desc: src?.desc || '',
    exam: examFromTemplate(src || { exam: {}, sections: [] }),
    sections: src ? sectionsFromTemplate(src) : [],
  };
  if (!src) d.exam.written_points = 100;
  const body = h('div', { class: 'stack' });
  const total = h('span', { class: 'tpl-total' });
  const updateTotal = () => {
    const sum = d.sections.reduce((a, s) => a + plannedPoints(s), 0);
    total.className = 'tpl-total' + (sum === d.exam.written_points ? ' ok' : '');
    total.replaceChildren(`大問の配点合計 ${sum}点 ／ 満点 ${d.exam.written_points}点`,
      sum !== d.exam.written_points ? h('button', { class: 'link', type: 'button', onclick: () => { d.exam.written_points = sum; draw(); } }, `満点を${sum}点にする`) : '');
  };
  const secBox = h('div', { class: 'sec-list compact' });
  const ctx = { dirty: updateTotal, redraw: () => drawSections(), list: d.sections, template: true };
  const drawSections = () => {
    d.sections.forEach((s, i) => { s.no = i + 1; });
    secBox.replaceChildren(...(d.sections.length ? d.sections.map((s, i) => sectionRow(s, i, ctx))
      : [h('div', { class: 'empty small' }, icon('layers', 24), h('b', {}, '大問がありません'), h('p', {}, '下の「大問を追加」から組み立てます'))]));
    updateTotal();
  };
  const draw = () => {
    setChildren(body,
      h('div', { class: 'grid-3' },
        field('テンプレートの名前', input({ value: d.name, 'data-autofocus': true, placeholder: '例: 英コミュⅠ 2学期期末', oninput: v => { d.name = v; } })),
        field('カテゴリー', select(categoryList().map(c => [c, c]), d.category, v => { d.category = v; })),
        field('満点', input({ type: 'number', min: 0, value: d.exam.written_points, oninput: v => { d.exam.written_points = toInt(v, 0); updateTotal(); } }))),
      field('説明（任意）', input({ value: d.desc, placeholder: '例: リスニング＋長文2題。2学期から使う形式', oninput: v => { d.desc = v; } })),
      h('div', { class: 'card flat' }, h('div', { class: 'card-title' }, icon('printer'), '用紙の体裁'), layoutFields(d.exam, () => {})),
      h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, icon('layers'), '大問の構成', total),
        secBox,
        h('button', { class: 'btn ghost', style: { marginTop: '10px' }, type: 'button', onclick: () => typePicker(type => { d.sections.push(newSection(type)); drawSections(); }) }, icon('plus'), '大問を追加')));
    drawSections();
  };
  draw();
  openModal({
    title: isNew ? '新しいテンプレート' : `テンプレートを編集：${src.name}`, size: 'xl scroll', body,
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '保存', kind: 'primary', icon: 'check', fn: async c => {
        if (!d.name.trim()) return toast('テンプレートの名前を入力してください', 'error');
        const payload = { name: d.name.trim(), category: d.category, desc: d.desc, exam: { ...d.exam, category: d.category }, sections: d.sections };
        try {
          const r = isNew ? await api('POST', 'templates', { template: payload }) : await api('PUT', `templates/${src.id}`, { template: payload });
          S.userTemplates = isNew ? [...S.userTemplates, r.template] : S.userTemplates.map(x => x.id === src.id ? r.template : x);
          c(); toast(`テンプレート「${r.template.name}」を保存しました`, 'ok');
          if (!S.project) render();
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

/** 今の試験の構成をテンプレートとして保存 */
function saveAsTemplateDialog() {
  const p = S.project;
  const st = { name: '', category: p.exam.category || '定期考査', desc: '', overwrite: '' };
  const mine = S.userTemplates || [];
  openModal({
    title: 'テンプレートとして保存', size: 'md',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, `大問${p.sections.length}つの構成・配点・指示文・語群・採点基準と、番号の振り方・表紙などの体裁を保存します。問題・素材は保存されません。`),
      field('テンプレートの名前', input({ value: '', 'data-autofocus': true, placeholder: '例: 英コミュⅠ 期末（リスニングあり）', oninput: v => { st.name = v; } })),
      h('div', { class: 'grid-2' },
        field('カテゴリー', select(categoryList().map(c => [c, c]), st.category, v => { st.category = v; })),
        field('説明（任意）', input({ value: '', oninput: v => { st.desc = v; } }))),
      mine.length ? field('既存のテンプレートを上書きする（任意）', select([['', '上書きしない（新しく保存）'], ...mine.map(t => [t.id, t.name])], '', v => { st.overwrite = v; })) : null),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '保存', kind: 'primary', icon: 'check', fn: async c => {
        const old = mine.find(t => t.id === st.overwrite);
        const name = st.name.trim() || old?.name;
        if (!name) return toast('テンプレートの名前を入力してください', 'error');
        const payload = { name, category: st.category, desc: st.desc || old?.desc || '', exam: { ...p.exam, category: st.category }, sections: p.sections };
        try {
          const r = old ? await api('PUT', `templates/${old.id}`, { template: payload }) : await api('POST', 'templates', { template: payload });
          S.userTemplates = old ? mine.map(x => x.id === old.id ? r.template : x) : [...mine, r.template];
          c(); toast(`テンプレート「${name}」を保存しました。次からは新規作成で選べます`, 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

/** テンプレートを今の試験に適用 */
function applyTemplateDialog() {
  const p = S.project;
  const st = { tpl: null, category: p.exam.category, showAll: false, keepPoints: false };
  openModal({
    title: 'テンプレートを適用', size: 'md',
    body: h('div', { class: 'stack' }, templatePicker(st),
      p.sections.length ? h('div', { class: 'warn-box warn' }, icon('alert', 14), '今の大問構成と用紙の体裁がテンプレートに置き換わります（作成済みの問題・素材の割り当ても外れます）。') : null),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '適用する', kind: 'primary', fn: async c => {
        const t = findTemplate(st.tpl);
        if (!t) return toast('テンプレートを選んでください', 'error');
        const has = p.sections.some(s => s.questions.length);
        if (has && !await confirmBox('作成済みの問題も含めて置き換えます。よろしいですか？', { ok: '置き換える', danger: true })) return;
        p.sections = sectionsFromTemplate(t);
        Object.assign(p.exam, examFromTemplate(t));
        S.secIdx = 0; renumber(); markDirty(); c(); render();
        toast(`「${t.name}」を適用しました`, 'ok');
      } },
    ],
  });
}

// ================================================================ カテゴリーの編集

function categoriesDialog() {
  const rows = categoryList().map(c => ({ name: c, orig: c }));
  const count = c => (S.projects || []).filter(p => p.category === c).length;
  const box = h('div', { class: 'cat-list' });
  const draw = () => box.replaceChildren(...rows.map((r, i) => h('div', { class: 'cat-row' },
    input({ value: r.name, oninput: v => { r.name = v; } }),
    h('span', { class: 'muted cat-n' }, r.orig ? `試験 ${count(r.orig)}件` : '新規'),
    iconBtn('up', '上へ', () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; draw(); }, { disabled: i === 0 }),
    iconBtn('down', '下へ', () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; draw(); }, { disabled: i === rows.length - 1 }),
    iconBtn('trash', '削除', () => { rows.splice(i, 1); draw(); }, { danger: true, disabled: rows.length <= 1 }))));
  draw();
  openModal({
    title: 'カテゴリーを編集', size: 'md',
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, '試験の種類を自由に分類できます（例: 定期考査・英単語テスト・小テスト・課題・その他）。名前を変えると、そのカテゴリーの試験とテンプレートにも反映されます。削除しても試験は消えません。'),
      box,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { rows.push({ name: '', orig: '' }); draw(); box.lastChild?.querySelector('input')?.focus(); } }, icon('plus'), 'カテゴリーを追加')),
    actions: [
      { label: 'キャンセル', fn: c => c() },
      { label: '保存', kind: 'primary', icon: 'check', fn: async c => {
        const cats = rows.map(r => r.name.trim()).filter(Boolean);
        if (!cats.length) return toast('カテゴリーを1つ以上残してください', 'error');
        const rename = Object.fromEntries(rows.filter(r => r.orig && r.name.trim() && r.name.trim() !== r.orig).map(r => [r.orig, r.name.trim()]));
        try {
          S.config = await api('PUT', 'config', { categories: cats, rename });
          if (S.filterCat !== 'all' && rename[S.filterCat]) S.filterCat = rename[S.filterCat];
          await loadConfig(); await loadProjects();
          c(); render(); toast('カテゴリーを保存しました', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      } },
    ],
  });
}

// ================================================================ バックアップ

function downloadBackup() {
  const a = h('a', { href: '/api/backup', download: '' });
  document.body.append(a); a.click(); a.remove();
  toast('バックアップ（全試験・素材・テンプレート）をダウンロードしています。生徒が見られない場所に保存してください', 'ok');
}

function restoreBackup() {
  const inp = h('input', { type: 'file', accept: '.zip', style: { display: 'none' } });
  inp.addEventListener('change', async () => {
    const f = inp.files[0];
    if (!f) return;
    try {
      const r = await api('POST', 'restore', { data: await readBase64(f) });
      await loadConfig(); await loadProjects(); render();
      toast(`バックアップから${r.added}件の試験を読み込みました（既存の試験は上書きしていません）`, 'ok');
    } catch (e) { toast('読み込めませんでした: ' + e.message, 'error'); }
  });
  document.body.append(inp);
  inp.click();
  setTimeout(() => inp.remove(), 60000);
}
