"""作問エンジン。索引化=Haiku、作問・検証=Sonnet。

skills/ の再発防止ルールをプロンプトに焼き込んである:
- 教材にない文の創作禁止、全問に出典必須
- 本文（パッセージ）の改変禁止
- 別解の自己チェック（並び替えは文頭移動・副詞位置を必ず検討）
- 頭文字ヒント等の別解防止テクニック
"""
import importlib.util
import json
import os
import urllib.error
import urllib.request
from types import SimpleNamespace

HAIKU = "claude-haiku-4-5"
SONNET = "claude-sonnet-5"

_client = None


def client_or_die():
    """anthropicを遅延インポートする。--no-api 系機能（FORMAT_HINTS等）は
    パッケージ未インストールでも使えるようにするため。"""
    global _client
    if _client is None:
        try:
            import anthropic
        except ImportError:
            raise SystemExit(
                "anthropic パッケージがありません。API機能を使うには "
                "`pip install anthropic` と ANTHROPIC_API_KEY の設定が必要です。"
                "（ChatGPTを使う場合は EXAM_AI_PROVIDER=openai と OPENAI_API_KEY を設定。"
                "API抜き運用なら --no-api を付けてください）")
        _client = anthropic.Anthropic(max_retries=4)
    return _client

# 累計コスト（$/1Mトークン: Haiku 1/5, Sonnet 5 は 2/10。公式料金表 2026-09 時点）
_PRICES = {HAIKU: (1.0, 5.0), SONNET: (2.0, 10.0),
           # ChatGPT（目安。OpenAIの料金表 2026-09 時点）
           "gpt-4.1": (2.0, 8.0), "gpt-4.1-mini": (0.4, 1.6)}
usage_total = {"cost_usd": 0.0, "input": 0, "output": 0}
# 1回ごとのAI呼び出しの記録（画面の「API使用量」に出す）。task は呼び出し側で current_task に入れる
usage_log = []
current_task = {"name": ""}


# ---- AIの提供元の切り替え（Claude / ChatGPT）
# EXAM_AI_PROVIDER=openai で ChatGPT（OpenAI API）を使う。未設定なら Claude。
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_DEFAULT_MODEL = "gpt-4.1"        # 作問・別解チェック用
OPENAI_DEFAULT_FAST = "gpt-4.1-mini"    # 教材の索引化用（安価）


def provider() -> str:
    return "openai" if os.environ.get("EXAM_AI_PROVIDER") == "openai" else "anthropic"


def provider_ready() -> bool:
    if provider() == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    return bool(os.environ.get("ANTHROPIC_API_KEY"))  # 追加の部品は不要（標準ライブラリで直接つなぐ）


def _create(model, max_tokens, messages, output_config, system=None, thinking=None):
    """Claude の messages.create と同じ形で呼べる窓口。ChatGPT選択時は OpenAI に振り替える。"""
    if provider() != "openai":
        return _create_anthropic(model, max_tokens, messages, output_config, system, thinking)
    return _create_openai(model, max_tokens, messages, output_config, system)


ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def _create_anthropic(model, max_tokens, messages, output_config, system=None, thinking=None):
    """Claude（Anthropic API）を標準ライブラリだけで呼ぶ。
    Windows版（exe）に anthropic パッケージを入れなくても動くようにするため。"""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("AnthropicのAPIキーが設定されていません")
    body = {"model": model, "max_tokens": max_tokens, "messages": messages, "output_config": output_config}
    if system:
        body["system"] = system
    if thinking:
        body["thinking"] = thinking
    req = urllib.request.Request(ANTHROPIC_URL, data=json.dumps(body).encode("utf-8"), method="POST", headers={
        "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    data = None
    for attempt in range(4):  # 混雑（429/529）や一時的なエラーは少し待って再試行
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", "")
            except ValueError:
                msg = ""
            if e.code in (429, 500, 502, 503, 529) and attempt < 3:
                import time
                time.sleep(2 ** attempt * 2)
                continue
            if e.code == 401:
                raise SystemExit("Claude のAPIキーが正しくありません。設定からキーを入れ直してください")
            raise SystemExit(f"Claude（Anthropic）でエラーが発生しました（{e.code}）: {msg}")
        except urllib.error.URLError as e:
            raise SystemExit(f"Anthropicに接続できません（インターネット接続を確認してください）: {e.reason}")
    blocks = [SimpleNamespace(type=b.get("type"), text=b.get("text", "")) for b in data.get("content", [])]
    if not any(b.type == "text" for b in blocks):
        raise SystemExit("Claude から回答が得られませんでした（stop_reason: %s）" % data.get("stop_reason"))
    u = data.get("usage", {})
    return SimpleNamespace(content=blocks, usage=SimpleNamespace(
        input_tokens=u.get("input_tokens", 0), output_tokens=u.get("output_tokens", 0), model=model))


def _create_openai(model, max_tokens, messages, output_config, system):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit("OpenAIのAPIキーが設定されていません")
    name = (os.environ.get("OPENAI_MODEL_FAST") or OPENAI_DEFAULT_FAST) if model == HAIKU \
        else (os.environ.get("OPENAI_MODEL") or OPENAI_DEFAULT_MODEL)
    msgs = ([{"role": "system", "content": system}] if system else []) + messages
    body = {
        "model": name, "messages": msgs, "max_completion_tokens": max_tokens,
        "response_format": {"type": "json_schema", "json_schema": {
            "name": "result", "strict": True, "schema": output_config["format"]["schema"]}},
    }
    req = urllib.request.Request(OPENAI_URL, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        raise SystemExit(f"ChatGPT（OpenAI）でエラーが発生しました（{e.code}）: {msg}")
    except urllib.error.URLError as e:
        raise SystemExit(f"OpenAIに接続できません: {e.reason}")
    choice = data["choices"][0]["message"]
    if choice.get("refusal"):
        raise SystemExit("ChatGPTが回答を断りました: " + choice["refusal"])
    u = data.get("usage", {})
    usage = SimpleNamespace(input_tokens=u.get("prompt_tokens", 0), output_tokens=u.get("completion_tokens", 0), model=name)
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=choice["content"])], usage=usage)


def _track(model: str, usage):
    if usage is None:
        return
    name = getattr(usage, "model", None) or model
    pin, pout = _PRICES.get(name, _PRICES.get(model, (0.0, 0.0)))
    cost = (usage.input_tokens * pin + usage.output_tokens * pout) / 1_000_000
    usage_total["input"] += usage.input_tokens
    usage_total["output"] += usage.output_tokens
    usage_total["cost_usd"] += cost
    usage_total["provider"] = provider()
    usage_log.append({"task": current_task["name"] or "AI", "model": name, "input": usage.input_tokens,
                      "output": usage.output_tokens, "cost_usd": round(cost, 6)})


def cost_report() -> str:
    return (f"APIコスト: 約${usage_total['cost_usd']:.3f} "
            f"(入力{usage_total['input']:,}tok / 出力{usage_total['output']:,}tok)")

INDEX_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "usable_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "description": "例: 空所補充/例文/本文パッセージ/文法"},
                    "ref": {"type": "string", "description": "教材内の位置 (例: L3 Part1①(5), 例文54)"},
                    "text": {"type": "string"},
                },
                "required": ["kind", "ref", "text"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "usable_items"],
    "additionalProperties": False,
}

QUESTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "number": {"type": "integer"},
                    "body": {"type": "string", "description": "問題文（生徒に見せる形）"},
                    "answer": {"type": "string"},
                    "source_ref": {"type": "string", "description": "出典。教材内の位置。空欄禁止"},
                    "alt_answer_risk": {"type": "string", "description": "別解リスクの自己評価と対策"},
                },
                "required": ["number", "body", "answer", "source_ref", "alt_answer_risk"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["questions"],
    "additionalProperties": False,
}

RULES = """作問ルール（違反禁止）:
1. 教材テキストに実在する文・語句のみ使う。創作禁止。source_refに教材内の正確な位置を書く。
2. 本文パッセージを出題に使う場合、一語も改変しない（削除・置換・要約禁止）。
3. 正解は一意にする。別解が出うる場合:
   - 空所補充: 頭文字ヒント（例: ( u　) → universal）を付ける
   - 並び替え: 移動可能な句（不定詞句・副詞句）はチャンク化して1選択肢にする。
     文頭移動・副詞の位置・等位要素の入れ替えによる別解を必ず検討し、
     alt_answer_risk に検討結果を書く。
   - 語句挿入: 挿入位置が本文中で一意か全位置を列挙して確認する
4. 解答用紙は1枠1語の前提で作る（複数語の解答は語数を明記）。
5. 選択肢問題は正解番号が偏らないようにする。"""


def index_material(doc_id: str, text: str) -> dict:
    """Haikuで教材を出題可能アイテムに索引化する。"""
    resp = _create(
        model=HAIKU,
        max_tokens=8000,
        system="あなたは英語教材の索引作成係です。教材テキストから出題に使える"
               "アイテム（例文・空所補充問題・本文パッセージ・文法事項）を漏れなく"
               "列挙してください。テキストを一切改変せず、原文のまま抜き出すこと。",
        messages=[{"role": "user", "content": f"教材ID: {doc_id}\n\n{text[:60000]}"}],
        output_config={"format": {"type": "json_schema", "schema": INDEX_SCHEMA}},
    )
    _track(HAIKU, resp.usage)
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)


def _pinpoint_block(section: dict) -> str:
    """オーダーの pinpoint 指定（教員が「この文のここを聞きたい」）を
    プロンプト化する。指定された問題は必ずその文・その狙いで作る。"""
    pins = section.get("pinpoint") or []
    if not pins:
        return ""
    lines = ["\n教員からのピンポイント指定（最優先。必ずこの文・この狙いで作問する）:"]
    for i, p in enumerate(pins, 1):
        lines.append(f"{i}. 対象文: {p['text']}")
        if p.get("focus"):
            lines.append(f"   問いたい点: {p['focus']}（この文法事項・語句が解答の核になるように）")
        if p.get("note"):
            lines.append(f"   補足: {p['note']}")
    lines.append("指定より問数が多い場合、残りは教材アイテムから作る。")
    return "\n".join(lines)


def make_section(section: dict, material_items: list, exam_context: str) -> dict:
    """Sonnetで大問1つ分を作問する。"""
    items_json = json.dumps(material_items, ensure_ascii=False)
    prompt = f"""{RULES}

試験情報: {exam_context}

大問{section['no']}を作成してください。
- 形式: {section['type']}
- 問数: {section['count']}問 × {section['points_each']}点
- 追加指示: {section.get('instructions', 'なし')}
{_pinpoint_block(section)}

使用可能な教材アイテム（この中からのみ出題）:
{items_json}"""
    resp = _create(
        model=SONNET,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system="あなたは高校英語の定期考査の作問者です。ルールを厳守してください。",
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": QUESTIONS_SCHEMA}},
    )
    _track(SONNET, resp.usage)
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)


VERDICT_SCHEMA = {
    "type": "object",
    "properties": {
        "has_alternate_answer": {"type": "boolean"},
        "explanation": {"type": "string"},
        "suggested_fix": {"type": "string"},
    },
    "required": ["has_alternate_answer", "explanation", "suggested_fix"],
    "additionalProperties": False,
}


def adversarial_verify(question: dict, qtype: str) -> dict:
    """Sonnetで別解を敵対的に探す。見つける前提で攻める。"""
    prompt = f"""以下の試験問題に別解（模範解答以外の正解）が存在しないか、
全力で反証を試みてください。特に:
- 並び替え: 不定詞句/副詞句の文頭移動、副詞の位置、等位要素の入れ替え
- 空所補充: 同品詞の類義語、文法的に成立する他の語
- 語句挿入: 他の挿入可能位置

問題形式: {qtype}
問題: {question['body']}
模範解答: {question['answer']}

疑わしい場合は has_alternate_answer=true としてください。"""
    resp = _create(
        model=SONNET,
        max_tokens=4000,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": VERDICT_SCHEMA}},
    )
    _track(SONNET, resp.usage)
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)


FORMAT_HINTS = {
    "fill_blank": "空所補充。問いたい語句を（　）にし、日本語文を添える。別解が出るなら頭文字ヒント",
    "reorder_2nd_5th": "並び替え。語群を（ ）内に列挙し2番目と5番目を答えさせる。文頭固定語は外に出す。移動可能句はチャンク化",
    "reorder_4th_8th": "並び替え。4番目と8番目を答えさせる（それ以外は reorder_2nd_5th と同じ注意）",
    "underline_grammar": "下線部の文法説明・書き換え問題。問いたい箇所に下線を引く",
    "choice_4": "4択問題。ひっかけ選択肢は文法・語彙的に近い語で作り、正解は一意",
    "translation": "下線部和訳または全文和訳",
    "word_form": "語形変化。（　）内に原形を与えて適切な形に直させる",
    "error_correction": "誤文訂正。英文の3か所に下線ア・イ・ウを引き、1か所だけ誤りにする（誤りは本文の語を最小限だけ変えて作る）。"
                        "答えは「記号 / 正しい形」。誤りでない2か所が確実に正しいこと",
    "paraphrase": "書き換え。対象文とほぼ同じ意味になる英文を別の構文で示し、空所に入る語を答えさせる。空所1つにつき1語",
    "vocab_context": "例文の空所に入る語を4択で選ばせる（英単語テスト）。誤答は同じ品詞・同じ単語リストの語から選ぶ",
    "vocab_spelling": "例文の空所に入る語を綴らせる（英単語テスト）。頭文字を与える。時制・単複による語形変化に注意",
    "definition": "英英定義。単語の英語の定義文を示し、語群から選ばせる",
}


def make_pinpoint(text: str, qformat: str, focus: str = "", note: str = "") -> dict:
    """教員指定の1文から、指定形式で1問だけ作る（askコマンド用）。"""
    hint = FORMAT_HINTS.get(qformat, qformat)
    prompt = f"""{RULES}

教員から次のピンポイント作問依頼がありました。指定文をそのまま使い、
指定形式で1問だけ作ってください（questions配列は1要素）。

- 対象文（無改変で使う。出典もこの文）: {text}
- 形式: {qformat} — {hint}
- 問いたい点: {focus or '指定なし（文の中心的な文法事項を問う）'}
- 補足: {note or 'なし'}

問いたい点が解答の核になるように設計すること。
（例: 関係代名詞を問いたいなら、関係代名詞が空所/並び替えの答えの位置に来るように）
別解の検討結果を alt_answer_risk に必ず書くこと。"""
    resp = _create(
        model=SONNET,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        system="あなたは高校英語の定期考査の作問者です。ルールを厳守してください。",
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": QUESTIONS_SCHEMA}},
    )
    _track(SONNET, resp.usage)
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)["questions"][0]


def regenerate_question(section: dict, bad_question: dict, verdict: dict,
                        material_items: list, used_refs: list,
                        exam_context: str) -> dict:
    """別解が見つかった1問を、同じ教材から別のアイテムで差し替える。

    skills/exam-provenance: 差し替え内容は呼び出し側でユーザーに明示すること。
    """
    items_json = json.dumps(material_items, ensure_ascii=False)
    prompt = f"""{RULES}

試験情報: {exam_context}

以下の問題に別解が見つかったため、1問だけ差し替えてください。
- 元の問題: {bad_question['body']}
- 元の解答: {bad_question['answer']}
- 別解の内容: {verdict['explanation']}
- 修正案: {verdict['suggested_fix']}

差し替え方針（優先順）:
1. まず修正案の通り、同じ文のままチャンク化や頭文字ヒントで別解を潰せるか検討
2. 潰せなければ、教材アイテムから別の文で新しい問題を作る
   （既に使用済みの出典は使わない: {used_refs}）

形式: {section['type']} / 問題番号: {bad_question['number']}
questions配列には差し替え後の1問だけを入れてください。

使用可能な教材アイテム:
{items_json}"""
    resp = _create(
        model=SONNET,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        system="あなたは高校英語の定期考査の作問者です。ルールを厳守してください。",
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": QUESTIONS_SCHEMA}},
    )
    _track(SONNET, resp.usage)
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)["questions"][0]


# ---------------------------------------------------------------- 自然言語で注文して作問

KINDS = {
    "content_match": "内容一致（本文の内容と一致する／しない選択肢を選ぶ）",
    "synonym": "同意語選択（本文中の語句と最も近い意味の語句を選ぶ）",
    "fill_blank": "空所補充", "choice_4": "選択問題", "translation": "和訳", "referent": "指示語の内容",
    "reorder_2nd_5th": "並び替え", "underline_grammar": "下線部の文法・書き換え", "qa": "英問英答",
    "writing": "英作文", "word_form": "語形変化", "table_fill": "表の穴埋め", "insertion": "語句挿入位置",
    "reading_misfit": "不要文の指摘", "paraphrase": "同意文の空所補充", "other": "その他",
}

ORDER_SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "enum": list(KINDS)},
            "instructions": {"type": "string", "description": "この種類の設問の指示文（例: 本文の内容と一致するものを1つ選びなさい。）"},
            "body": {"type": "string", "description": "問題文（生徒に見せる形。改行は\\n）"},
            "choices": {"type": "array", "items": {"type": "string"}, "description": "選択肢（記号なし）。記述式なら空配列"},
            "correct": {"type": "integer", "description": "正解の選択肢の番号（0始まり）。記述式は -1"},
            "answer": {"type": "string", "description": "模範解答（選択式は正解の選択肢の本文）"},
            "focus": {"type": "string", "description": "この問題が問う要素（例: 第2段落の筆者の主張／関係代名詞which）"},
            "source_ref": {"type": "string", "description": "根拠となる本文・教材の位置。空欄禁止"},
            "alt_answer_risk": {"type": "string", "description": "別解の自己チェックの結果"},
        },
        "required": ["kind", "instructions", "body", "choices", "correct", "answer", "focus", "source_ref", "alt_answer_risk"],
        "additionalProperties": False}}},
    "required": ["questions"], "additionalProperties": False,
}

ORDER_RULES = RULES + """
6. 内容一致・同意語選択などの選択肢の文はあなたが書いてよいが、根拠は必ず本文にあること。
   正解はちょうど1つ（「一致しないもの」を問う場合も1つ）。誤りの選択肢は本文のどこと食い違うかを alt_answer_risk に書く。
7. 同じ要素（同じ文・同じ語句・同じ文法事項）を2問以上で問わない。focus にその問題が問う要素を書く。
8. 教員の注文にある種類と問数を必ず守る。注文にない種類は作らない。"""


def order_prompt(order: str, passage: str, material: str, context: str = "") -> str:
    kinds = "\n".join(f"- {k}: {v}" for k, v in KINDS.items())
    return f"""{ORDER_RULES}

試験: {context or '高校英語の定期考査'}

■ 教員の注文（この通りに作る）
{order}

■ 本文（問題用紙に載っている英文。一語も改変しない）
{passage or '（本文の指定なし。下の教材から出題する）'}

■ 教材（出典として使える範囲）
{material[:40000] or '（なし）'}

■ 使える問題の種類（kind）
{kinds}

■ 出力: 次の形のJSONだけを返す（説明文は不要）
{{"questions": [{{"kind": "content_match", "instructions": "...", "body": "...", "choices": ["..."], "correct": 0,
  "answer": "...", "focus": "...", "source_ref": "...", "alt_answer_risk": "..."}}]}}"""


def make_order(order: str, passage: str, material: str, context: str = "") -> list:
    """教員が自然言語で書いた注文（例: 内容一致を2問、同意語選択を1問）から複数の種類の問題を作る。"""
    current_task["name"] = "注文で作問"
    resp = _create(model=SONNET, max_tokens=16000, thinking={"type": "adaptive"},
                   system="あなたは高校英語の定期考査の作問者です。ルールを厳守してください。",
                   messages=[{"role": "user", "content": order_prompt(order, passage, material, context)}],
                   output_config={"format": {"type": "json_schema", "schema": ORDER_SCHEMA}})
    _track(SONNET, resp.usage)
    return json.loads(next(b.text for b in resp.content if b.type == "text"))["questions"]


# ---------------------------------------------------------------- 仮想の生徒

SOLVE_SCHEMA = {
    "type": "object",
    "properties": {"answers": {"type": "array", "items": {
        "type": "object",
        "properties": {"id": {"type": "string"}, "answer": {"type": "string"},
                       "confidence": {"type": "string", "enum": ["high", "mid", "low"]},
                       "trouble": {"type": "string", "description": "迷った点・問題文の分かりにくさ（なければ空）"}},
        "required": ["id", "answer", "confidence", "trouble"], "additionalProperties": False}}},
    "required": ["answers"], "additionalProperties": False,
}

JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "results": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "correct": {"type": "boolean", "description": "生徒の答えが模範解答と同じ意味で正しいか"},
                "alternate_ok": {"type": "boolean", "description": "生徒の答えは模範解答と違うが、それも正解として成立する（＝別解）"},
                "problem": {"type": "string", "description": "問題の欠陥（別解・曖昧さ・本文と矛盾・解答不能など）。なければ空"},
                "fix": {"type": "string", "description": "直し方の提案。なければ空"},
                "focus": {"type": "string", "description": "この問題が問うている要素"},
            },
            "required": ["id", "correct", "alternate_ok", "problem", "fix", "focus"], "additionalProperties": False}},
        "duplicates": {"type": "array", "items": {
            "type": "object",
            "properties": {"ids": {"type": "array", "items": {"type": "string"}}, "reason": {"type": "string"}},
            "required": ["ids", "reason"], "additionalProperties": False}},
        "summary": {"type": "string"},
    },
    "required": ["results", "duplicates", "summary"], "additionalProperties": False,
}


def _student_sheet(items: list, with_key: bool) -> str:
    out = []
    for it in items:
        if it.get("passage"):
            out.append(f"\n【{it['group']} の本文】\n{it['passage']}")
        lines = [f"[{it['id']}] （{it['instructions']}）", it["body"]]
        if it.get("choices"):
            lines.append("選択肢: " + " / ".join(it["choices"]))
        if with_key:
            lines.append(f"模範解答: {it['answer']}")
        out.append("\n".join(lines))
    return "\n\n".join(out)


def student_prompt(items: list, level: str = "") -> str:
    return f"""あなたは{level or '日本の高校生（平均的な学力）'}です。次の英語の試験を、模範解答を見ずに解いてください。
各問に答え（選択式は選択肢の本文）、自信の度合い、迷った点・問題文の分かりにくさを書きます。

{_student_sheet(items, with_key=False)}"""


def judge_prompt(items: list, answers: list) -> str:
    ans = "\n".join(f"[{a['id']}] 生徒の答え: {a['answer']}（自信: {a['confidence']}）{' 迷った点: ' + a['trouble'] if a['trouble'] else ''}"
                    for a in answers)
    return f"""あなたは高校英語の試験の検証者です。仮想の生徒が次の試験を解きました。
1. 生徒の答えを模範解答と照合する（correct）。
2. 生徒の答えが模範解答と違っても正解として成立するなら alternate_ok=true（＝別解があるので問題の欠陥）。
3. 生徒が迷った点・本文との矛盾・正解が2つ以上ある選択肢・解答不能などを problem に書き、fix に直し方を書く。
4. 同じ要素（同じ文・語句・文法事項・本文の同じ箇所）を問う問題の組を duplicates に挙げる。
5. summary に全体の講評（難易度・偏り・直すべき問題）を日本語で3文以内で書く。

■ 試験（模範解答つき）
{_student_sheet(items, with_key=True)}

■ 生徒の答え
{ans}"""


def virtual_student(items: list, level: str = "") -> dict:
    """仮想の生徒（Haiku）が解き、検証者（Sonnet）が照合・別解・重複をチェックする。"""
    current_task["name"] = "仮想の生徒が解答"
    r1 = _create(model=HAIKU, max_tokens=8000, messages=[{"role": "user", "content": student_prompt(items, level)}],
                 output_config={"format": {"type": "json_schema", "schema": SOLVE_SCHEMA}})
    _track(HAIKU, r1.usage)
    answers = json.loads(next(b.text for b in r1.content if b.type == "text"))["answers"]
    current_task["name"] = "仮想の生徒の採点・検証"
    r2 = _create(model=SONNET, max_tokens=12000, thinking={"type": "adaptive"},
                 messages=[{"role": "user", "content": judge_prompt(items, answers)}],
                 output_config={"format": {"type": "json_schema", "schema": JUDGE_SCHEMA}})
    _track(SONNET, r2.usage)
    judged = json.loads(next(b.text for b in r2.content if b.type == "text"))
    by_id = {a["id"]: a for a in answers}
    for r in judged["results"]:
        a = by_id.get(r["id"], {})
        r["student_answer"] = a.get("answer", "")
        r["confidence"] = a.get("confidence", "")
        r["trouble"] = a.get("trouble", "")
    return judged
