'use strict';
/*
 * 使い勝手を上げる機能:
 * ・AIの実行中表示（経過時間・中止）
 * ・コマンドパレット（Ctrl+K）: 大問・設問・問題・操作を検索してすぐ実行
 * ・キーボードショートカットの一覧（?）
 * ・はじめて使う人向けの案内（試験が1つもないときのホーム）
 */

// ================================================================ AIの実行中表示

const AI_LABELS = {
  'ai/order': ['AIが問題を作っています', '本文と素材を読んで、注文どおりに作問しています'],
  'ai/student': ['仮想の生徒が解いています', '生徒役が解いたあと、採点役が別解・重複をチェックします（1〜2分）'],
  'ai/verify_one': ['別解をチェックしています', ''],
  'ai/ask': ['AIが作問しています', '対象の文を変えずに、指定の形式で作っています'],
  'ai/section': ['AIが設問をまとめて作っています', ''],
};
let aiBusy = null;

function aiBusyStart(path, ctl) {
  aiBusyEnd();
  const [title, sub] = AI_LABELS[path] || ['AIが処理しています', ''];
  const started = Date.now();
  const time = h('b', { class: 'ai-time' }, '0秒');
  const el = h('div', { class: 'ai-busy', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'spin', 'aria-hidden': 'true' }),
    h('div', { class: 'ai-busy-text' },
      h('div', { class: 'ai-busy-title' }, title, h('span', { class: 'muted' }, '　経過 '), time),
      sub ? h('small', {}, sub) : null,
      h('small', { class: 'muted' }, `${aiName()} を使用中・ほかの作業はそのまま続けられます`)),
    h('button', { class: 'btn ghost sm', onclick: () => ctl && ctl.abort(), title: '待つのをやめます（AIの処理が途中まで進んでいた分の料金はかかる場合があります）' }, icon('x', 14), '中止'));
  document.body.append(el);
  const iv = setInterval(() => {
    const sec = Math.round((Date.now() - started) / 1000);
    time.textContent = sec < 60 ? `${sec}秒` : `${Math.floor(sec / 60)}分${sec % 60}秒`;
  }, 1000);
  aiBusy = { el, iv };
}

function aiBusyEnd() {
  if (!aiBusy) return;
  clearInterval(aiBusy.iv);
  aiBusy.el.remove();
  aiBusy = null;
}

// ================================================================ コマンドパレット

/** ひらがな・カタカナ・全角半角・大文字小文字の違いを無視して比べるための形 */
function normText(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function paletteItems() {
  const items = [];
  const add = (group, label, run, opt = {}) => items.push({ group, label, run, hint: opt.hint || '', kw: opt.kw || '', ic: opt.icon || 'list' });
  const p = S.project;
  if (p) {
    [['setup', '試験の設定', 'layers'], ['build', '大問をつくる', 'edit'], ['check', 'チェック', 'shield'], ['output', '出力', 'printer']]
      .forEach(([k, l, ic], i) => add('画面', `${i + 1}. ${l}`, () => gotoStep(k), { icon: ic, kw: k }));
    applyLabels(p.sections);
    groupsOf(p.sections).forEach(g => g.forEach(i => {
      const s = p.sections[i], big = p.sections[g[0]];
      add('大問・設問', `${s.label}　${TYPE_LABEL[s.type] || s.type}`, () => { S.secIdx = i; hideFab(); gotoStep('build'); },
        { icon: 'layers', hint: `${s.questions.length}/${s.count}問・${plannedPoints(s)}点`, kw: `${big.big_title || ''} ${s.instructions} ${SHORT[s.type] || ''}` });
    }));
    p.sections.forEach((s, si) => s.questions.forEach((q, qi) => {
      const text = (q.body || q.script || (q.choices || []).join(' / ') || '（問題文なし）').replace(/\n/g, ' ');
      add('問題', `${s.label}(${q.number})　${text.slice(0, 70)}`, () => {
        S.secIdx = si; S.highlight = { si, qi }; S.openQ.add(q); gotoStep('build');
      }, { icon: 'edit', hint: q.answer ? `解答: ${String(q.answer).slice(0, 24)}` : '解答なし', kw: `${q.answer} ${q.source_ref} ${q.focus || ''} ${(q.choices || []).join(' ')}` });
    }));
    add('操作', 'プレビュー（問題用紙・解答用紙・模範解答）', previewDialog, { icon: 'eye', hint: 'P' });
    add('操作', 'Wordファイルを作成', () => { gotoStep('output'); doExport(); }, { icon: 'download', kw: '出力 印刷 docx' });
    add('操作', '元に戻す', undo, { icon: 'undo', hint: 'Ctrl+Z' });
    add('操作', 'やり直す', redo, { icon: 'redo', hint: 'Ctrl+Shift+Z' });
    add('操作', '版の履歴（前の版に戻す）', historyDialog, { icon: 'clock' });
    add('操作', '自動チェックを実行', () => { S.issues = null; gotoStep('check'); }, { icon: 'shield', kw: '確認 点検' });
    add('操作', '仮想の生徒に解かせる', () => gotoStep('check'), { icon: 'help', kw: 'AI 生徒 解答' });
    add('操作', '大問を追加', () => gotoStep('setup'), { icon: 'plus' });
    add('操作', '過去の試験から問題を探す', () => openBank(), { icon: 'clock', kw: '再利用 問題バンク 前回' });
    add('操作', '過去の試験の大問（本文ごと）を使う', () => openBank({ tab: 'bigs' }), { icon: 'clock', kw: '再利用 長文 前回' });
    add('操作', 'テンプレートとして保存', saveAsTemplateDialog, { icon: 'download' });
    add('操作', 'テンプレートを適用', applyTemplateDialog, { icon: 'layers' });
    add('操作', '試験の一覧へ戻る', goHome, { icon: 'back', kw: 'ホーム home' });
  } else {
    add('操作', '新しい試験を作る', () => newProjectDialog(), { icon: 'plus', kw: '作成 new' });
    (S.projects || []).forEach(x => add('試験', x.title || '（無題）', () => openProject(x.id).catch(() => {}),
      { icon: 'file', hint: `${x.category}・${x.updated_at}`, kw: `${x.category} ${x.date || ''}` }));
    add('操作', 'テンプレートの一覧', () => { S.homeTab = 'templates'; render(); }, { icon: 'layers' });
    add('操作', 'カテゴリーを編集', categoriesDialog, { icon: 'edit' });
    add('操作', 'バックアップを保存', downloadBackup, { icon: 'download' });
    add('操作', 'バックアップから復元', restoreBackup, { icon: 'upload' });
    add('操作', '試験データ（JSON）を取り込む', importProject, { icon: 'upload' });
  }
  add('設定', 'AI機能の設定（Claude / ChatGPT）', settingsDialog, { icon: 'key', kw: 'APIキー api' });
  add('設定', 'APIの使用量（料金の目安）', usageDialog, { icon: 'key', kw: '料金 コスト' });
  add('設定', '使い方と作問のルール', helpDialog, { icon: 'help' });
  add('設定', 'キーボードショートカット', shortcutsDialog, { icon: 'command', hint: '?' });
  return items;
}

function openPalette() {
  if ($('.palette-overlay')) return;
  const all = paletteItems();
  let sel = 0, shown = [];
  const inp = h('input', { class: 'palette-input', placeholder: '大問・設問・問題・操作を検索（例: 大問2 / 内容一致 / プレビュー / 出典の語）', 'aria-label': '検索' });
  const list = h('div', { class: 'palette-list', role: 'listbox' });
  const overlay = h('div', { class: 'palette-overlay' },
    h('div', { class: 'palette', role: 'dialog', 'aria-label': 'コマンドパレット' },
      h('div', { class: 'palette-head' }, icon('search', 16), inp, h('kbd', {}, 'Esc')), list,
      h('div', { class: 'palette-foot' }, h('span', {}, h('kbd', {}, '↑↓'), ' 選ぶ'), h('span', {}, h('kbd', {}, 'Enter'), ' 実行'), h('span', {}, h('kbd', {}, 'Ctrl K'), ' いつでも開く'))));
  const close = () => {
    overlay.remove();
    modalStack = modalStack.filter(m => m !== close);
  };
  const run = it => { close(); setTimeout(() => it.run(), 0); };
  const draw = () => {
    const toks = normText(inp.value).split(/\s+/).filter(Boolean);
    const scored = all.map(it => {
      const lab = normText(it.label), hay = lab + ' ' + normText(it.kw) + ' ' + normText(it.group);
      if (!toks.every(t => hay.includes(t))) return null;
      const score = toks.reduce((a, t) => a + (lab.startsWith(t) ? 3 : lab.includes(t) ? 2 : 1), 0);
      return { it, score };
    }).filter(Boolean);
    if (toks.length) scored.sort((a, b) => b.score - a.score);
    shown = scored.slice(0, 80).map(x => x.it);
    if (sel >= shown.length) sel = Math.max(0, shown.length - 1);
    let lastGroup = '';
    const rows = [];
    shown.forEach((it, i) => {
      if (!toks.length && it.group !== lastGroup) { rows.push(h('div', { class: 'palette-group' }, it.group)); lastGroup = it.group; }
      rows.push(h('button', { class: 'palette-item' + (i === sel ? ' on' : ''), role: 'option', 'aria-selected': i === sel ? 'true' : 'false',
        onmousemove: () => { if (sel !== i) { sel = i; draw(); } }, onclick: () => run(it) },
        icon(it.ic, 15), h('span', { class: 'pi-label' }, it.label), it.hint ? h('span', { class: 'pi-hint' }, it.hint) : null,
        toks.length ? h('span', { class: 'pi-group' }, it.group) : null));
    });
    list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'palette-empty' }, '見つかりませんでした')]));
    list.querySelector('.palette-item.on')?.scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) run(shown[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  modalStack.push(close);
  draw();
  setTimeout(() => inp.focus(), 0);
}

// ================================================================ ショートカット

function shortcutsDialog() {
  const rows = [
    ['Ctrl + K', 'なんでも検索・実行（大問・設問・問題・操作）'],
    ['P', 'プレビュー（問題用紙・解答用紙・模範解答）'],
    ['Ctrl + Z', '元に戻す（入力欄の外で）'],
    ['Ctrl + Shift + Z / Ctrl + Y', 'やり直す'],
    ['Ctrl + S', 'すぐに保存（ふだんは自動保存）'],
    ['Esc', 'ダイアログ・メニューを閉じる'],
    ['?', 'この一覧を表示'],
  ];
  openModal({
    title: 'キーボードショートカット', size: 'md',
    body: h('div', { class: 'stack' },
      h('table', { class: 'kbd-table' }, rows.map(([k, d]) => h('tr', {}, h('td', {}, k.split(' / ').map((x, i) => [i ? ' / ' : '', ...x.split(' + ').map((y, j) => [j ? ' + ' : '', h('kbd', {}, y)])])), h('td', {}, d)))),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Mac では Ctrl の代わりに ⌘（command）キーも使えます。')),
    actions: [{ label: '閉じる', kind: 'primary', fn: c => c() }],
  });
}

// ================================================================ はじめての人向けの案内

function welcomeCard() {
  const card = (ic, title, text, btn, fn, primary) => h('div', { class: 'welcome-card' },
    h('div', { class: 'wc-icon' }, icon(ic, 22)), h('b', {}, title), h('p', {}, text),
    h('button', { class: 'btn ' + (primary ? 'primary' : 'ghost') + ' sm', onclick: fn }, btn));
  return h('div', { class: 'welcome' },
    h('div', { class: 'welcome-head' },
      h('h2', {}, 'ようこそ。最初の試験を作りましょう'),
      h('p', { class: 'muted' }, '大問ごとに素材（本文・例文・単語リスト）を入れて、文をクリックするかAIに注文するだけで、問題用紙・解答用紙・模範解答がWordで仕上がります。')),
    h('div', { class: 'welcome-grid' },
      card('layers', 'テンプレートから作る', '英コミュⅠ・Ⅱ、英語演習、長文総合、英単語テストなど、実物の形の大問構成から始めます。', '新しい試験を作る', () => newProjectDialog(), true),
      card('sparkles', 'AIに注文して作る', '白紙から大問を追加し、「内容一致を2問、同意語を1問」のように書くだけ。APIキーなしでも依頼文のコピーで使えます。', '白紙から始める', () => newProjectDialog({ tpl: 'builtin:blank' })),
      card('upload', '前のデータを使う', '別のPCで保存したバックアップ（ZIP）や、出力した試験データ（JSON）を読み込みます。', 'バックアップから復元', restoreBackup)),
    h('div', { class: 'welcome-tips' },
      h('span', {}, icon('command', 14), h('kbd', {}, 'Ctrl K'), ' でいつでも検索・操作'),
      h('span', {}, icon('eye', 14), h('kbd', {}, 'P'), ' でプレビュー'),
      h('span', {}, icon('clock', 14), '2分おきに版を自動保存（履歴から戻せます）')));
}

// ================================================================ 問題バンク（過去の試験から探して使う）

/** 過去の試験の問題・大問（本文ごと）を検索して、今の試験にコピーする */
function openBank(init = {}) {
  const p = S.project;
  if (!p) return;
  const st = { q: '', type: '', category: p.exam.category || '', tab: init.tab || 'questions', res: null, busy: false, added: new Set() };
  const target = () => p.sections[S.secIdx];
  const listBox = h('div', { class: 'bank-list' });
  const countBox = h('span', { class: 'muted small' });
  let timer = null;
  const load = async () => {
    st.busy = true; draw();
    try { st.res = await api('POST', 'bank', { q: st.q, type: st.type, category: st.category, exclude: p.id }); }
    catch (e) { toast(e.message, 'error'); st.res = { questions: [], bigs: [], total: 0, total_bigs: 0 }; }
    st.busy = false; draw();
  };
  const addQuestion = r => {
    const s = target();
    if (!s) return toast('先に大問を作ってください', 'error');
    const q = JSON.parse(JSON.stringify(r.question));
    delete q.verdict; delete q.rate;
    q.origin = `${r.title} ${r.label}`;
    q.number = 0;
    if (s.type === 'auto') Object.assign(s, { type: r.type || 'other', instructions: s.instructions || r.instructions, choice_style: r.choice_style });
    s.questions.push(q);
    if (q.choices && Number.isInteger(q.correct)) syncChoiceAnswers({ ...s, questions: [q] });
    if (s.questions.length > s.count) s.count = s.questions.length;
    renumber(); markDirty(); S.issues = null;
    st.added.add(r); draw();
    toast(`${s.label}に追加しました（元: ${q.origin}）`, 'ok');
  };
  const addBig = r => {
    const secs = JSON.parse(JSON.stringify(r.sections)).map((x, k) => ({
      ...x, sid: newSid(), new_big: k === 0,
      questions: (x.questions || []).map(q => ({ ...q, origin: `${r.title} ${r.label}`, verdict: undefined, rate: undefined })),
    }));
    p.sections.push(...secs);
    renumber(); markDirty(); S.issues = null;
    S.secIdx = p.sections.indexOf(secs[0]);
    st.added.add(r); draw();
    toast(`「${r.title}」の${r.label}を、大問${secs[0].no}として追加しました（本文・設問・問題をすべてコピー）`, 'ok');
  };
  const qCard = r => {
    const q = r.question;
    const done = st.added.has(r);
    return h('div', { class: 'bank-card' },
      h('div', { class: 'bank-meta' },
        h('span', { class: 'cat-tag c' + Math.max(0, categoryList().indexOf(r.category)) % 6 }, r.category),
        h('b', {}, r.title || '（無題）'), h('span', { class: 'muted' }, `${r.label}・${SHORT[r.type] || r.type}`),
        r.date ? h('span', { class: 'muted small' }, r.date) : null,
        q.rate != null ? h('span', { class: 'pill rate ' + rateClass(q.rate) }, `正答率 ${q.rate}%`) : null),
      h('div', { class: 'bank-body' }, questionLook({ choice_style: r.choice_style }, q, null)),
      h('div', { class: 'bank-foot' },
        h('span', {}, h('span', { class: 'tag' }, '解答'), ' ', String(q.answer || '—').slice(0, 60)),
        h('span', { class: 'muted small' }, '出典: ' + (q.source_ref || '—')),
        h('button', { class: 'btn sm ' + (done ? 'ghost' : 'primary'), disabled: !target(), onclick: () => addQuestion(r) },
          icon(done ? 'check' : 'plus', 13), done ? 'もう一度追加' : `${target()?.label || ''}に追加`)));
  };
  const bigCard = r => {
    const done = st.added.has(r);
    return h('div', { class: 'bank-card' },
      h('div', { class: 'bank-meta' },
        h('span', { class: 'cat-tag c' + Math.max(0, categoryList().indexOf(r.category)) % 6 }, r.category),
        h('b', {}, r.title || '（無題）'), h('span', { class: 'muted' }, r.label), r.date ? h('span', { class: 'muted small' }, r.date) : null),
      r.big_title ? h('div', { class: 'bank-title' }, r.big_title) : null,
      r.passage ? h('div', { class: 'bank-passage' }, r.passage + (r.passage.length >= 300 ? '…' : '')) : null,
      h('div', { class: 'tpl-secs' }, r.parts.map((x, k) => h('span', { class: 'tpl-sec' }, `問${k + 1} ${SHORT[x.type] || x.type}`, h('small', {}, `${x.count}問`)))),
      h('div', { class: 'bank-foot' },
        h('span', { class: 'muted small' }, r.passage_src ? '本文の出典: ' + r.passage_src : ''),
        h('button', { class: 'btn sm ' + (done ? 'ghost' : 'primary'), onclick: () => addBig(r) }, icon(done ? 'check' : 'plus', 13), done ? 'もう一度追加' : '大問ごと追加')));
  };
  const draw = () => {
    const r = st.res;
    countBox.textContent = !r ? '' : st.tab === 'questions'
      ? `${r.total}問${r.total > r.questions.length ? `（新しい順に${r.questions.length}問を表示）` : ''}` : `${r.total_bigs}題`;
    const items = !r ? [] : st.tab === 'questions' ? r.questions.map(qCard) : r.bigs.map(bigCard);
    listBox.replaceChildren(...(st.busy && !r ? [h('div', { class: 'loading' }, '探しています…')]
      : items.length ? items : [h('div', { class: 'empty small' }, icon('search', 24), h('b', {}, '見つかりませんでした'),
        h('p', {}, (S.projects || []).length <= 1 && !st.q ? 'ほかの試験を作ると、ここから問題を探して使えるようになります' : '言葉を変えるか、カテゴリー・形式の絞り込みを外してください'))]));
    tabs.replaceChildren(...[['questions', '問題'], ['bigs', '大問（本文ごと）']].map(([k, l]) =>
      h('button', { class: 'seg-btn' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; draw(); } }, l, r ? h('small', {}, k === 'questions' ? r.total : r.total_bigs) : null)));
  };
  const tabs = h('div', { class: 'seg' });
  const search = h('input', { class: 'inp', type: 'search', placeholder: '本文・解答・出典・問いたい点で探す（例: 関係代名詞 / Lesson 4 / universal）', 'data-autofocus': true });
  search.addEventListener('input', () => { st.q = search.value; clearTimeout(timer); timer = setTimeout(load, 250); });
  const body = h('div', { class: 'bank' },
    h('div', { class: 'bank-bar' }, search,
      groupedSelect([['すべて', [['', 'すべての形式']]], ...TYPE_GROUPS], st.type, v => { st.type = v; load(); }, 'inp mini'),
      select([['', 'すべてのカテゴリー'], ...categoryList().map(c => [c, c])], st.category, v => { st.category = v; load(); }, 'inp mini')),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, tabs, countBox),
    h('div', { class: 'hint' }, icon('alert', 14), h('span', {}, '追加した問題には「再利用」の印が付き、出典一覧にも元の試験が残ります。同じ生徒に同じ問題を出していないか、配布前に確認してください。')),
    listBox);
  openModal({ title: '過去の試験から探す', size: 'xl', body, onClose: () => { if (st.added.size && S.project === p) render({ keepScroll: true }); } });
  if ((S.projects || []).length === 0) loadProjects();
  load();
}

/** 正答率の色分け（易しい・ふつう・難しい） */
function rateClass(r) { return r >= 80 ? 'easy' : r < 40 ? 'hard' : 'mid'; }

// ================================================================ 実施後の記録（正答率）

/** 試験の実施後に、問題ごとの正答率を記録する。次の試験づくりで、難しすぎた問題・易しすぎた問題が分かる */
function ratesCard() {
  const p = S.project;
  const rows = [];
  const plan = numberPlan(p);
  p.sections.forEach((s, si) => s.questions.forEach((q, qi) => rows.push({ s, si, q, qi, num: plan[si][qi] })));
  if (!rows.length) return null;
  const open = S.ratesOpen;
  const done = rows.filter(r => r.q.rate != null);
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.q.rate, 0) / done.length * 10) / 10 : null;
  const hard = done.filter(r => r.q.rate < 40).sort((a, b) => a.q.rate - b.q.rate);
  const easy = done.filter(r => r.q.rate >= 90);
  const set = (q, v) => {
    const n = parseFloat(String(v).replace(/[％%]/, ''));
    if (v === '' || isNaN(n)) delete q.rate; else q.rate = Math.max(0, Math.min(100, Math.round(n * 10) / 10));
    markDirty();
  };
  const paste = () => {
    let raw = '';
    openModal({
      title: '正答率をまとめて貼り付け', size: 'md',
      body: h('div', { class: 'stack' },
        h('p', { class: 'muted', style: { margin: 0 } }, 'Excelの正答率の列（問題の順に1行ずつ）をコピーして貼り付けます。「85」「85%」「0.85」のどれでも読めます。'),
        textarea({ rows: 10, cls: 'inp prompt-box', placeholder: '85\n72\n40\n…', 'data-autofocus': true, oninput: v => { raw = v; } })),
      actions: [{ label: 'キャンセル', fn: c => c() }, { label: '取り込む', kind: 'primary', fn: c => {
        const vals = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.split(/[\t,\s]+/).pop());
        let n = 0;
        vals.forEach((v, i) => {
          if (!rows[i]) return;
          let x = parseFloat(String(v).replace(/[％%]/, ''));
          if (isNaN(x)) return;
          if (x <= 1 && !/%|％/.test(v) && vals.every(y => parseFloat(y) <= 1)) x *= 100;  // 0.85 の形
          rows[i].q.rate = Math.max(0, Math.min(100, Math.round(x * 10) / 10)); n++;
        });
        markDirty(); c(); render({ keepScroll: true });
        toast(`${n}問の正答率を取り込みました` + (vals.length > rows.length ? `（${vals.length - rows.length}行は問題数より多いので無視）` : ''), 'ok');
      } }],
    });
  };
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, icon('chart'), '実施後の記録（正答率）',
      h('span', { class: 'muted small' }, done.length ? `${done.length}/${rows.length}問 記録済み・平均 ${avg}%` : '試験のあとに入力すると、次の試験づくりに使えます'),
      h('button', { class: 'btn ghost sm right', onclick: () => { S.ratesOpen = !open; render({ keepScroll: true }); } }, open ? '閉じる' : '記録する')),
    done.length ? h('div', { class: 'rate-sum' },
      h('div', { class: 'u-tile' }, h('small', {}, '平均正答率'), h('b', {}, `${avg}%`), h('span', {}, `${done.length}問`)),
      h('div', { class: 'u-tile' + (hard.length ? ' bad' : '') }, h('small', {}, '難しかった（40%未満）'), h('b', {}, hard.length), h('span', {}, '問題文・選択肢の見直し候補')),
      h('div', { class: 'u-tile' }, h('small', {}, '易しかった（90%以上）'), h('b', {}, easy.length), h('span', {}, '差がつきにくい問題'))) : null,
    hard.length ? h('ul', { class: 'issue-list', style: { marginTop: '10px' } }, hard.slice(0, 8).map(r => h('li', {},
      h('button', { class: 'issue', onclick: () => { S.secIdx = r.si; S.highlight = { si: r.si, qi: r.qi }; S.openQ.add(r.q); gotoStep('build'); } },
        h('span', { class: 'pill rate hard' }, `${r.q.rate}%`), h('span', {}, `${r.s.label}(${r.q.number})　${(r.q.body || (r.q.choices || []).join(' / ')).replace(/\n/g, ' ').slice(0, 60)}`),
        h('span', { class: 'issue-go' }, '見る →'))))) : null,
    open ? h('div', { class: 'stack', style: { marginTop: '12px' } },
      h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: paste }, icon('clipboard', 14), 'Excelから貼り付け'),
        h('span', { class: 'muted small' }, '正答率は「過去の試験から探す」にも表示され、問題を選ぶときの目安になります')),
      h('div', { class: 'rate-table' }, rows.map(r => h('label', { class: 'rate-row' },
        h('span', { class: 'rate-no' }, r.num.slots ? r.num.slots.join('・') : r.num.cell),
        h('span', { class: 'rate-q' }, (r.q.body || r.q.script || (r.q.choices || []).join(' / ')).replace(/\n/g, ' ').slice(0, 80)),
        h('span', { class: 'rate-ans' }, String(r.q.answer || '').slice(0, 16)),
        h('span', { class: 'rate-in' }, input({ type: 'number', min: 0, max: 100, step: 0.1, value: r.q.rate ?? '', cls: 'inp num', oninput: v => set(r.q, v) }), '%'))))) : null);
}
