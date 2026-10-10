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
