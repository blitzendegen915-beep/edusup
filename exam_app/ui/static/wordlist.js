'use strict';
/*
 * 英単語テスト：単語リストから問題を自動で作る。
 * ・Excelの表をそのままコピー＆貼り付け（タブ区切り）、Wordの表（素材）、「番号 単語 意味」の行、のどれでも読める
 * ・誤答は同じ単語リストの、同じ品詞の語から選ぶ（品詞は意味の日本語から推定。品詞の列があればそれを使う）
 * ・正解の位置（1〜4）は均等になるように配置する
 * ・例文は一語も書き換えない（空所にする語だけを抜く）。例文中の語形（過去形など）はそのまま解答にする
 */

const WL_ROLES = [['skip', '使わない'], ['no', '番号'], ['word', '英単語'], ['meaning', '意味'], ['ex', '例文（英語）'],
  ['exja', '例文の訳'], ['def', '英英定義'], ['pos', '品詞']];
const JA = /[぀-ヿ㐀-鿿]/;
const LATIN = /[A-Za-z]/;

// 不規則動詞（原形: [過去形, 過去分詞]）。誤答の語形を例文に合わせるときに使う
const IRREGULAR = Object.fromEntries(('arise arose arisen,bear bore born,beat beat beaten,become became become,begin began begun,bend bent bent,' +
  'bind bound bound,bite bit bitten,blow blew blown,break broke broken,bring brought brought,build built built,buy bought bought,' +
  'catch caught caught,choose chose chosen,come came come,cost cost cost,cut cut cut,deal dealt dealt,dig dug dug,do did done,' +
  'draw drew drawn,drink drank drunk,drive drove driven,eat ate eaten,fall fell fallen,feed fed fed,feel felt felt,fight fought fought,' +
  'find found found,fly flew flown,forbid forbade forbidden,forget forgot forgotten,forgive forgave forgiven,freeze froze frozen,' +
  'get got gotten,give gave given,go went gone,grow grew grown,hang hung hung,have had had,hear heard heard,hide hid hidden,hit hit hit,' +
  'hold held held,hurt hurt hurt,keep kept kept,know knew known,lay laid laid,lead led led,leave left left,lend lent lent,let let let,' +
  'lie lay lain,lose lost lost,make made made,mean meant meant,meet met met,overcome overcame overcome,pay paid paid,put put put,' +
  'quit quit quit,read read read,ride rode ridden,ring rang rung,rise rose risen,run ran run,say said said,see saw seen,seek sought sought,' +
  'sell sold sold,send sent sent,set set set,shake shook shaken,shine shone shone,shoot shot shot,show showed shown,shut shut shut,' +
  'sing sang sung,sink sank sunk,sit sat sat,sleep slept slept,speak spoke spoken,spend spent spent,spread spread spread,stand stood stood,' +
  'steal stole stolen,stick stuck stuck,strike struck struck,swim swam swum,take took taken,teach taught taught,tear tore torn,' +
  'tell told told,think thought thought,throw threw thrown,understand understood understood,undertake undertook undertaken,' +
  'wake woke woken,wear wore worn,win won won,withdraw withdrew withdrawn,write wrote written').split(',').map(x => { const [b, p, pp] = x.split(' '); return [b, [p, pp]]; }));

// ================================================================ 読み取り

/** 行と列に分ける（タブ → Wordの表「 | 」 → 区切りなしの順に試す） */
function wlSplit(text) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() && !/^\[(TABLE|TEXTBOX)/.test(l.trim()));
  if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t').map(c => c.trim()));
  if (lines.some(l => l.includes(' | '))) return lines.map(l => l.split(' | ').map(c => c.trim()));
  return lines.map(l => {
    const m = l.match(/^\s*(?:No\.?\s*)?(\d+)?[.)．、:：\s]*([A-Za-z][A-Za-z'’\-~.\s]*?[A-Za-z.~])\s+(.*)$/);
    return m && JA.test(m[3]) ? [m[1] || '', m[2].trim(), m[3].trim()] : null;
  }).filter(Boolean);
}

const HEADER_RE = [['no', /^(no\.?|番号|#|通し)$/i], ['word', /^(英?単語|word|見出し語?|english|語)$/i], ['meaning', /^(意味|訳|和訳|日本語|meaning)$/i],
  ['exja', /(例文.*(訳|日本語)|和訳例文)/], ['ex', /^(例文|example|用例|英文)/i], ['def', /(定義|英英|definition)/i], ['pos', /^(品詞|pos)$/i]];

/** 列の役割を推定する。見出し行があれば見出しから、なければ中身から */
function wlGuessRoles(rows) {
  const width = Math.max(0, ...rows.map(r => r.length));
  const head = rows[0] || [];
  const byHead = head.map(c => (HEADER_RE.find(([, re]) => re.test(c.trim())) || [])[0] || null);
  if (byHead.filter(Boolean).length >= 2 && byHead.includes('word')) return { roles: [...Array(width)].map((_, i) => byHead[i] || 'skip'), header: true };
  const sample = rows.slice(0, 40);
  const roles = [];
  const ratio = (i, fn) => { const cells = sample.map(r => r[i] || '').filter(Boolean); return cells.length ? cells.filter(fn).length / cells.length : 0; };
  for (let i = 0; i < width; i++) {
    const words = c => c.split(/\s+/).length;
    if (ratio(i, c => /^(No\.?\s*)?\d+$/i.test(c)) > .8) roles.push('no');
    else if (ratio(i, c => /^(名|動|形|副|前|接|代|助|自|他|n|v|adj|adv|prep|conj)[.詞]?$/i.test(c)) > .6) roles.push('pos');
    else if (ratio(i, c => JA.test(c)) > .6) roles.push(roles.includes('meaning') ? 'exja' : 'meaning');
    else if (ratio(i, c => LATIN.test(c) && !JA.test(c) && words(c) <= 3) > .6 && !roles.includes('word')) roles.push('word');
    else if (ratio(i, c => LATIN.test(c) && !JA.test(c) && words(c) >= 3) > .5) roles.push(roles.includes('ex') || ratio(i, c => !/[.!?]$/.test(c)) > .6 ? 'def' : 'ex');
    else roles.push('skip');
  }
  return { roles, header: false };
}

/** 行 → 単語データ */
function wlItems(rows, roles, header) {
  const items = [];
  rows.slice(header ? 1 : 0).forEach((r, k) => {
    const it = { no: '', word: '', meaning: '', ex: '', exja: '', def: '', pos: '' };
    roles.forEach((role, i) => { if (role !== 'skip' && r[i] != null && !it[role]) it[role] = r[i].trim(); });
    it.word = it.word.replace(/\s+/g, ' ').trim();
    if (!it.word || !LATIN.test(it.word) || !it.meaning) return;
    it.no = it.no.replace(/^No\.?\s*/i, '') || String(k + 1);
    it.pos = wlPos(it);
    items.push(it);
  });
  return items;
}

/** 意味をいくつかの訳語に分ける（重なりのチェック用） */
function wlSenses(m) { return String(m).split(/[；;、,，・／/]/).map(x => x.replace(/[（(][^）)]*[）)]/g, '').trim()).filter(Boolean); }

/** 品詞の推定。品詞の列 → 英語の語尾 → 意味の日本語 の順に判断 */
function wlPos(it) {
  const p = (it.pos || '').toLowerCase();
  if (/^(動|v|自|他)/.test(p)) return 'verb';
  if (/^(形|adj)/.test(p)) return 'adj';
  if (/^(副|adv)/.test(p)) return 'adv';
  if (/^(名|n)/.test(p)) return 'noun';
  const w = it.word.toLowerCase();
  const m = wlSenses(it.meaning)[0] || it.meaning;
  if (w.includes(' ')) return /^(を|に|と|が|から)|する$/.test(m) ? 'verb' : 'phrase';
  if (/^[をにとが]/.test(m) || /(する|させる|される)$/.test(m)) return 'verb';
  if (/(ている|した|された|的)$/.test(m)) return 'adj';
  if (/(tion|sion|ment|ness|ity|ance|ence|ship|ism|ist)$/.test(w)) return 'noun';
  if (/ly$/.test(w) && /[にく]$/.test(m)) return 'adv';
  if (/(ous|ful|ive|able|ible|al|ic|less)$/.test(w) && /(な|の|い|的な)$/.test(m)) return 'adj';
  if (/(な|的な|しい|の)$/.test(m) || /い$/.test(m) && !/(違い|思い|扱い|戦い|争い)$/.test(m)) return 'adj';
  if (/[^aeiou]ly$/.test(w) && w.length > 4 && !/(apply|reply|supply|family|rely|july|assembly)$/.test(w)) return 'adv';
  if (/(に|く|て|と)$/.test(m) && m.length <= 6) return 'adv';
  if (/[うくぐすつぬぶむる]$/.test(m)) return 'verb';
  return 'noun';
}

// ================================================================ 語形

function wlInflect(b, kind) {
  const w = b.toLowerCase();
  const cvc = /^[^aeiou]*[aeiou][bdgklmnprt]$/.test(w);
  if (kind === 'past' || kind === 'pp') {
    if (IRREGULAR[w]) return IRREGULAR[w][kind === 'pp' ? 1 : 0];
    if (w.endsWith('e')) return w + 'd';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ied';
    return cvc ? w + w.slice(-1) + 'ed' : w + 'ed';
  }
  if (kind === 's') {
    if (/(s|x|z|ch|sh|o)$/.test(w)) return w + 'es';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
    return w + 's';
  }
  if (kind === 'ing') {
    if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
    if (/[^e]e$/.test(w)) return w.slice(0, -1) + 'ing';
    return cvc ? w + w.slice(-1) + 'ing' : w + 'ing';
  }
  return w;
}

/** 句（look after など）は最初の語だけ変化させる */
function wlInflectPhrase(word, kind) {
  const [first, ...rest] = word.split(/\s+/);
  return [wlInflect(first, kind), ...rest].join(' ');
}

/** 例文の中で見出し語が使われている場所と語形を探す */
function wlFind(word, sentence) {
  const clean = word.replace(/[~〜…]|\.\.\.|\bone's\b|\bA\b|\bB\b|\bsb\b|\bsth\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const kinds = ['base', 's', 'past', 'pp', 'ing'];
  for (const kind of kinds) {
    const form = wlInflectPhrase(clean, kind);
    const re = new RegExp(`(^|[^A-Za-z])(${esc(form).replace(/\s+/g, '\\s+')})(?![A-Za-z])`, 'i');
    const m = sentence.match(re);
    if (m) { const s = m.index + m[1].length; return { s, e: s + m[2].length, form: m[2], kind }; }
  }
  if (!clean.includes(' ') && clean.length >= 5) {
    // 不規則な語形は、語頭が長く一致する語を候補にする（語形は推測しない）
    const re = /[A-Za-z]+/g;
    let m, best = null;
    while ((m = re.exec(sentence))) {
      let k = 0;
      while (k < m[0].length && k < clean.length && m[0][k].toLowerCase() === clean[k].toLowerCase()) k++;
      if (k >= clean.length - 2 && (!best || k > best.k)) best = { k, s: m.index, e: m.index + m[0].length, form: m[0], kind: 'other' };
    }
    if (best) return best;
  }
  return null;
}

// ================================================================ 作問

function wlShuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** 正解の位置を均等に（0〜k-1 を繰り返してシャッフル） */
function wlPositions(n, k) { return wlShuffle([...Array(n)].map((_, i) => i % k)); }

/** 誤答を3つ選ぶ。同じ品詞を優先し、意味（訳語）が重なる語は除く */
function wlDistractors(target, pool, n = 3) {
  const ts = new Set(wlSenses(target.meaning));
  const ok = pool.filter(x => x !== target && x.word.toLowerCase() !== target.word.toLowerCase()
    && !wlSenses(x.meaning).some(s => ts.has(s)));
  const same = wlShuffle(ok.filter(x => x.pos === target.pos));
  const other = wlShuffle(ok.filter(x => x.pos !== target.pos));
  return [...same, ...other].slice(0, n);
}

function wlQuestion(type, it, listName, extra = {}) {
  return {
    body: '', answer: '', source_ref: `${listName} No.${it.no}`, focus: it.word, kind: type, number: 0,
    alt_answer_risk: '【自動生成】誤答は同じリストの' + (it.pos === 'noun' ? '名詞' : it.pos === 'verb' ? '動詞' : it.pos === 'adj' ? '形容詞' : it.pos === 'adv' ? '副詞' : '語') + 'から選択。訳語の重なりは除外済み（最終確認は教員）',
    ...extra,
  };
}

/**
 * 問題を作る。戻り値 {questions, bank, skipped, warns}
 * opt: {type, items(出題する語), pool(誤答の候補), listName, style, hint, bankSize}
 */
function wlGenerate(opt) {
  const { type, items, pool, listName, style } = opt;
  const out = { questions: [], bank: null, skipped: [], warns: [] };
  const choiceQ = (it, text, choices, correct, extra = {}) => {
    const q = wlQuestion(type, it, listName, { body: text, choices, correct, ...extra });
    q.answer = markOf(style, correct); q.answer_slots = [q.answer];
    return q;
  };
  if (type === 'definition') {
    const usable = items.filter(it => it.def);
    items.filter(it => !it.def).forEach(it => out.skipped.push(`${it.word}（英英定義がない）`));
    const size = Math.max(usable.length, Math.min(opt.bankSize || 10, 30));
    const fillers = wlShuffle(pool.filter(x => !usable.includes(x) && !usable.some(u => u.word.toLowerCase() === x.word.toLowerCase())))
      .slice(0, Math.max(0, size - usable.length));
    const bank = wlShuffle([...usable, ...fillers]);
    out.bank = bank.map(x => x.word);
    usable.forEach(it => {
      const q = wlQuestion(type, it, listName, { body: it.def });
      q.answer = markOf(opt.bankStyle || style, bank.indexOf(it)); q.answer_slots = [q.answer];
      out.questions.push(q);
    });
    return out;
  }
  const pos = wlPositions(items.length, 4);
  items.forEach((it, k) => {
    if (type === 'listen_meaning' || type === 'vocab_meaning') {
      const ds = wlDistractors(it, pool);
      if (ds.length < 3) return out.skipped.push(`${it.word}（誤答にできる語が足りない）`);
      const choices = ds.map(d => wlSenses(d.meaning).slice(0, 2).join('；'));
      choices.splice(pos[k], 0, wlSenses(it.meaning).slice(0, 2).join('；'));
      out.questions.push(type === 'listen_meaning'
        ? choiceQ(it, '', choices, pos[k], { script: it.word })
        : choiceQ(it, it.word, choices, pos[k]));
    } else if (type === 'vocab_word') {
      const ds = wlDistractors(it, pool);
      if (ds.length < 3) return out.skipped.push(`${it.word}（誤答にできる語が足りない）`);
      const choices = ds.map(d => d.word);
      choices.splice(pos[k], 0, it.word);
      out.questions.push(choiceQ(it, it.meaning, choices, pos[k]));
    } else if (type === 'vocab_context' || type === 'vocab_spelling') {
      if (!it.ex) return out.skipped.push(`${it.word}（例文がない）`);
      const f = wlFind(it.word, it.ex);
      if (!f) return out.skipped.push(`${it.word}（例文の中に見つからない）`);
      const lead = it.exja ? it.exja + '\n' : '';
      if (type === 'vocab_spelling') {
        const blank = opt.hint === false ? '（　　　　　）'
          : f.form.split(/\s+/).map((w, i) => i === 0 || opt.hintAll ? `（ ${w[0].toLowerCase()}　　　　 ）` : '（　　　　　）').join(' ');
        const q = wlQuestion(type, it, listName, { body: lead + it.ex.slice(0, f.s) + blank + it.ex.slice(f.e), answer: f.form, answer_slots: [f.form] });
        if (f.kind !== 'base') q.alt_answer_risk += ` ／ 解答は例文の語形「${f.form}」（見出し語 ${it.word}）`;
        return out.questions.push(q);
      }
      const ds = wlDistractors(it, pool);
      if (ds.length < 3) return out.skipped.push(`${it.word}（誤答にできる語が足りない）`);
      // 誤答の語形を例文の語形（過去形・三単現など）にそろえる
      const prev = (it.ex.slice(0, f.s).match(/([A-Za-z]+)\s*$/) || [])[1]?.toLowerCase() || '';
      const kind = f.kind === 'past' && /^(has|have|had|been|be|is|are|was|were|being|get|got)$/.test(prev) ? 'pp' : f.kind;
      const shape = d => kind === 'base' || kind === 'other' || (d.pos !== it.pos && d.pos !== 'phrase') ? d.word : wlInflectPhrase(d.word, kind);
      const choices = ds.map(shape);
      // 文頭で大文字になっていても、選択肢は小文字でそろえる（固有名詞は見出し語が大文字なのでそのまま）
      const answerForm = /^[A-Z]/.test(it.word) ? f.form : f.form.replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase());
      choices.splice(pos[k], 0, answerForm);
      const q = choiceQ(it, lead + it.ex.slice(0, f.s) + '（　　）' + it.ex.slice(f.e), choices, pos[k]);
      if (kind !== 'base') q.alt_answer_risk += ` ／ 誤答の語形は例文に合わせて自動変化（${kind === 'other' ? '変化形を推測できないため原形のまま。要確認' : kind}）`;
      out.questions.push(q);
    }
  });
  return out;
}

// ================================================================ 画面

function openWordList(si) {
  const p = S.project, s = p.sections[si];
  const mats = p.materials.filter(m => m.sid === s.sid || !m.sid);
  const others = p.materials.filter(m => m.sid && m.sid !== s.sid);
  const cands = [...mats, ...others];
  const first = cands.find(m => /^単語リスト/.test(m.name)) || mats[0] || cands[0];  // 単語リストの素材を優先
  const listName = m => (m?.name || '').replace(/^単語リスト：/, '').replace(/\.\w+$/, '');
  const W = {
    src: first ? 'mat' : 'paste', matId: first?.id || '', paste: '', name: listName(first),
    rows: [], roles: [], header: false, items: [],
    type: VOCAB_TYPES.has(s.type) ? s.type : 'vocab_meaning',
    from: '', to: '', count: Math.max(1, (s.count || 10) - s.questions.length) || s.count || 10,
    order: 'random', mode: s.questions.length ? 'append' : 'replace', hint: true, bankSize: 10,
    result: null, saveMat: true,
  };
  const left = h('div', { class: 'qk-left' });
  const right = h('div', { class: 'qk-right' });

  const loadText = async () => {
    if (W.src === 'paste') return W.paste;
    if (!W.matId) return '';
    if (S.materialText[W.matId] == null) {
      try { S.materialText[W.matId] = (await api('GET', `projects/${p.id}/materials/${W.matId}`)).text; }
      catch (e) { toast(e.message, 'error'); return ''; }
    }
    return S.materialText[W.matId];
  };
  const parse = async (keepRoles = false) => {
    W.rows = wlSplit(await loadText());
    if (!keepRoles || W.roles.length !== Math.max(0, ...W.rows.map(r => r.length))) {
      const g = wlGuessRoles(W.rows); W.roles = g.roles; W.header = g.header;
    }
    W.items = wlItems(W.rows, W.roles, W.header);
    regenerate();
  };
  const picked = () => {
    const num = x => parseInt(x, 10);
    let list = W.items.filter(it => (!W.from || num(it.no) >= num(W.from)) && (!W.to || num(it.no) <= num(W.to)));
    if (W.order === 'random') list = wlShuffle(list);
    return list.slice(0, W.type === 'definition' ? Math.min(W.count, 30) : W.count);
  };
  const regenerate = () => {
    const items = picked();
    W.result = items.length ? wlGenerate({ type: W.type, items, pool: W.items, listName: W.name.trim() || '単語リスト',
      style: s.choice_style || '1', bankStyle: s.bank_style || '', hint: W.hint, bankSize: W.bankSize }) : null;
    draw();
  };

  const draw = () => {
    const stats = W.items.length
      ? `${W.items.length}語を読み取りました（例文あり ${W.items.filter(x => x.ex).length}・訳あり ${W.items.filter(x => x.exja).length}・英英定義あり ${W.items.filter(x => x.def).length}）`
      : '単語を読み取れていません。下の例のように、Excelの表をそのままコピーして貼り付けてください。';
    const width = Math.max(0, ...W.rows.map(r => r.length));
    const preview = W.rows.slice(0, 6);
    setChildren(left,
      h('div', { class: 'fld' }, h('span', {}, '1. 単語リスト'),
        segmented([['mat', 'この試験の素材から'], ['paste', '貼り付ける']], W.src, v => {
          W.src = v;
          if (v === 'mat' && !W.matId && first) { W.matId = first.id; W.name = listName(first); }
          parse();
        })),
      W.src === 'mat'
        ? (mats.length || others.length
          ? select(cands.map(m => [m.id, m.name]), W.matId, v => { W.matId = v; W.name = listName(p.materials.find(m => m.id === v)); parse(); })
          : h('div', { class: 'warn-box info' }, icon('alert', 14), 'この大問に素材がありません。「貼り付ける」を選んでください。'))
        : textarea({ value: W.paste, rows: 6, cls: 'inp prompt-box', placeholder: '例（Excelから範囲をコピーして貼り付け）:\n番号\t単語\t意味\t例文\t例文の訳\n1\tnotice\tに気づく\tShe noticed a change.\t彼女は変化に気づいた。\n2\tcolony\t植民地\t…',
          oninput: v => { W.paste = v; clearTimeout(W.t); W.t = setTimeout(() => parse(), 300); } }),
      h('div', { class: 'grid-2' },
        field('単語リストの名前（出典として記録）', input({ value: W.name, placeholder: '例: ターゲット1900 Section3', oninput: v => { W.name = v; } })),
        W.src === 'paste' ? h('label', { class: 'check small', style: { alignSelf: 'end' } }, h('input', { type: 'checkbox', checked: W.saveMat, onchange: e => { W.saveMat = e.target.checked; } }), '貼り付けたリストを素材として保存（全大問で共通）') : h('span')),
      h('div', { class: 'hint' }, icon('check', 14), h('span', {}, stats)),
      width ? h('div', { class: 'wl-table-wrap' }, h('table', { class: 'wl-table' },
        h('tr', {}, [...Array(width)].map((_, i) => h('th', {}, select(WL_ROLES, W.roles[i] || 'skip', v => { W.roles[i] = v; W.items = wlItems(W.rows, W.roles, W.header); regenerate(); }, 'inp mini')))),
        preview.map((r, k) => h('tr', { class: k === 0 && W.header ? 'hd' : '' }, [...Array(width)].map((_, i) => h('td', {}, (r[i] || '').slice(0, 40))))))) : null,
      width ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: W.header, onchange: e => { W.header = e.target.checked; W.items = wlItems(W.rows, W.roles, W.header); regenerate(); } }), '1行目は見出し（単語・意味など）') : null,
      h('div', { class: 'fld' }, h('span', {}, '2. 作る問題'),
        groupedSelect([['英単語テスト', TYPE_GROUPS.find(g => g[0] === '英単語テスト')[1]]], W.type, v => { W.type = v; regenerate(); })),
      h('div', { class: 'grid-3' },
        field('番号の範囲（から）', input({ type: 'number', value: W.from, placeholder: '最初', oninput: v => { W.from = v; regenerate(); } })),
        field('（まで）', input({ type: 'number', value: W.to, placeholder: '最後', oninput: v => { W.to = v; regenerate(); } })),
        field('問題数', input({ type: 'number', min: 1, value: W.count, oninput: v => { W.count = toInt(v, 1); regenerate(); } }))),
      h('div', { class: 'ctrl-row' },
        segmented([['random', 'ランダムに選ぶ'], ['list', 'リストの順']], W.order, v => { W.order = v; regenerate(); }),
        W.type === 'vocab_spelling' ? h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: W.hint, onchange: e => { W.hint = e.target.checked; regenerate(); } }), '頭文字ヒントを付ける') : null,
        W.type === 'definition' ? h('span', { class: 'row' }, '語群の数', input({ type: 'number', min: 2, value: W.bankSize, cls: 'inp num', oninput: v => { W.bankSize = toInt(v, 10); regenerate(); } })) : null),
      s.questions.length ? h('div', { class: 'ctrl-row' }, h('span', {}, `この大問の既存の${s.questions.length}問を`),
        segmented([['append', '残して末尾に追加'], ['replace', '置き換える']], W.mode, v => { W.mode = v; })) : null);
    right.replaceChildren(resultView());
  };

  const resultView = () => {
    const r = W.result;
    if (!r) return h('div', { class: 'qk-card' }, h('div', { class: 'warn-box info' }, icon('list', 14), '単語リストを読み取ると、ここに問題のプレビューが出ます。'));
    const sec = { ...s, questions: r.questions, bank: r.bank || s.bank };
    const counts = answerBalance(sec);
    return h('div', { class: 'qk-card' },
      h('div', { class: 'qk-label' }, `プレビュー（${r.questions.length}問${r.skipped.length ? `・${r.skipped.length}語は除外` : ''}）`),
      h('div', { class: 'mini-paper wl-paper' },
        r.bank ? h('div', { class: 'wl-bank' }, '【語群】 ', choiceLine(s.bank_style || s.choice_style, r.bank).join('　')) : null,
        r.questions.slice(0, 8).map((q, i) => h('div', { class: 'wl-q qrow' }, h('span', { class: 'num' }, `(${i + 1})`), h('div', { class: 'grow' }, questionLook(s, q, null)))),
        r.questions.length > 8 ? h('div', { class: 'muted' }, `…ほか${r.questions.length - 8}問`) : null),
      Object.keys(counts).length > 1 ? h('div', { class: 'hint' }, icon('check', 14), '正解の分布: ' + Object.keys(counts).sort().map(k => `${k}が${counts[k]}問`).join('・')) : null,
      r.skipped.length ? h('div', { class: 'warn-box warn' }, icon('alert', 14), h('div', {}, '作れなかった語: ', r.skipped.slice(0, 12).join('、'), r.skipped.length > 12 ? ` ほか${r.skipped.length - 12}語` : '')) : null,
      h('div', { class: 'warn-box info' }, icon('shield', 14), '誤答は同じ単語リストの同じ品詞の語から選び、意味が重なる語は除いています。品詞の推定は完全ではないので、配布前に必ず確認してください。'),
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('button', { class: 'btn ghost', onclick: regenerate }, icon('shuffle'), '作り直す'),
        h('button', { class: 'btn primary', disabled: !r.questions.length, onclick: commit }, icon('plus'), `${s.label}に${r.questions.length}問を入れる`)));
  };

  const commit = async () => {
    const r = W.result;
    if (!r?.questions.length) return;
    if (W.src === 'paste' && W.saveMat && W.paste.trim()) {
      try {
        // 単語リストは全大問で使うので「共通」の素材にする
        const res = await api('POST', `projects/${p.id}/materials`, { name: `単語リスト：${W.name.trim() || '単語リスト'}`, text: W.paste, sid: '' });
        addMaterialLocal(res, s.sid);
      } catch (e) { toast('単語リストを素材として保存できませんでした: ' + e.message, 'error'); }
    }
    if (W.mode === 'replace' || r.bank) {
      if (s.questions.length && W.mode !== 'replace' && r.bank) {
        if (!await confirmBox('英英定義は語群ごと作り直すため、この大問の既存の問題を置き換えます。よろしいですか？', { ok: '置き換える' })) return;
      }
      s.questions = [];
    }
    if (r.bank) s.bank = r.bank;
    s.questions.push(...r.questions);
    const grew = s.questions.length > s.count;
    if (grew) s.count = s.questions.length;
    renumber(); markDirty(); close();
    S.issues = null;
    render({ keepScroll: true });
    toast(`${s.label}に${r.questions.length}問を入れました` + (grew ? `（問数を${s.count}問に増やしました。配点を確認してください）` : ''), 'ok');
  };

  const close = openModal({ title: `単語リストから作成 — ${s.label}（${TYPE_LABEL[s.type] || s.type}）`, body: h('div', { class: 'qk wl' }, left, right), size: 'xl' });
  parse();
}
