"""作問エンジン。索引化=Haiku、作問・検証=Sonnet。

skills/ の再発防止ルールをプロンプトに焼き込んである:
- 教材にない文の創作禁止、全問に出典必須
- 本文（パッセージ）の改変禁止
- 別解の自己チェック（並び替えは文頭移動・副詞位置を必ず検討）
- 頭文字ヒント等の別解防止テクニック
"""
import json

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
                "（API抜き運用なら --no-api を付けてください）")
        _client = anthropic.Anthropic(max_retries=4)
    return _client

# 累計コスト（$/1Mトークン: Haiku 1/5, Sonnet 3/15）
_PRICES = {HAIKU: (1.0, 5.0), SONNET: (3.0, 15.0)}
usage_total = {"cost_usd": 0.0, "input": 0, "output": 0}


def _track(model: str, usage):
    pin, pout = _PRICES[model]
    usage_total["input"] += usage.input_tokens
    usage_total["output"] += usage.output_tokens
    usage_total["cost_usd"] += (usage.input_tokens * pin
                                + usage.output_tokens * pout) / 1_000_000


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
    resp = client_or_die().messages.create(
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
    resp = client_or_die().messages.create(
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
    resp = client_or_die().messages.create(
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
    resp = client_or_die().messages.create(
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
    resp = client_or_die().messages.create(
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
