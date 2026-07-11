"""作問エンジン。索引化=Haiku、作問・検証=Sonnet。

skills/ の再発防止ルールをプロンプトに焼き込んである:
- 教材にない文の創作禁止、全問に出典必須
- 本文（パッセージ）の改変禁止
- 別解の自己チェック（並び替えは文頭移動・副詞位置を必ず検討）
- 頭文字ヒント等の別解防止テクニック
"""
import json

import anthropic

HAIKU = "claude-haiku-4-5"
SONNET = "claude-sonnet-5"

client = anthropic.Anthropic()

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
    resp = client.messages.create(
        model=HAIKU,
        max_tokens=8000,
        system="あなたは英語教材の索引作成係です。教材テキストから出題に使える"
               "アイテム（例文・空所補充問題・本文パッセージ・文法事項）を漏れなく"
               "列挙してください。テキストを一切改変せず、原文のまま抜き出すこと。",
        messages=[{"role": "user", "content": f"教材ID: {doc_id}\n\n{text[:60000]}"}],
        output_config={"format": {"type": "json_schema", "schema": INDEX_SCHEMA}},
    )
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)


def make_section(section: dict, material_items: list, exam_context: str) -> dict:
    """Sonnetで大問1つ分を作問する。"""
    items_json = json.dumps(material_items, ensure_ascii=False)
    prompt = f"""{RULES}

試験情報: {exam_context}

大問{section['no']}を作成してください。
- 形式: {section['type']}
- 問数: {section['count']}問 × {section['points_each']}点
- 追加指示: {section.get('instructions', 'なし')}

使用可能な教材アイテム（この中からのみ出題）:
{items_json}"""
    resp = client.messages.create(
        model=SONNET,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system="あなたは高校英語の定期考査の作問者です。ルールを厳守してください。",
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": QUESTIONS_SCHEMA}},
    )
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
    resp = client.messages.create(
        model=SONNET,
        max_tokens=4000,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
        output_config={"format": {"type": "json_schema", "schema": VERDICT_SCHEMA}},
    )
    text_out = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text_out)
