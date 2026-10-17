# 定期考査作成スキル集

Claude Code・Codex 等のAIエージェントが定期考査を作成・精査する際に読むスキル集。
**全て過去のセッションで実際に起きた問題の再発防止策**を含む。

## スキル一覧

| スキル | 用途 | 使うタイミング |
|---|---|---|
| [exam-verify](exam-verify/SKILL.md) | 最終精査（別解・配点・隠しデータ・表の見落とし） | 配布前に必ず |
| [exam-provenance](exam-provenance/SKILL.md) | 全設問の出典記録・管理 | 作問・差し替えの度 |
| [exam-unique-answer](exam-unique-answer/SKILL.md) | 別解の検出と潰し方（チャンク化・頭文字ヒント等） | 作問時と精査時 |
| [exam-docx](exam-docx/SKILL.md) | python-docx実証済みパターン（表XML・白文字・検査法） | docx生成・検査時 |
| [exam-answersheet](exam-answersheet/SKILL.md) | 解答用紙・模範解答の生成ワークフロー | 解答用紙作成時 |

作問のスタイルガイド（科目別の大問構成・配点）は `.claude/commands/exam.md` を参照。

## 鉄則（全スキル共通）

1. **本文を勝手に改変しない。** 削除・置換・要約はユーザー承認必須。
2. **文を創作しない。** 全て出典教材から取り、出典を記録する。
3. **docxは段落・表・XMLの3層で読む。** 段落だけ見ると見落とす。
4. **模範解答は解き直して検証する。** 前のデータをコピーしない。
5. **差し替えはユーザーに明示する。** 黙って変えない。
6. **受領した教材・docxは即 `materials/` にコミット。** アップロード領域は消える。

## 過去に実際に起きた問題（教訓リスト）

| 問題 | 原因 | 対策スキル |
|---|---|---|
| 並び替え問4に別解（To get...を文頭化） | 順列検証不足 | exam-unique-answer |
| 副詞onceが複数箇所に挿入可能 | 挿入位置の全列挙不足 | exam-unique-answer |
| 大問6の模範解答が5問全部誤り | 旧データを未検証でコピー | exam-answersheet |
| 「大問1の出典どこ？」に即答できず | 出典記録なし | exam-provenance |
| 本文から"as shown in the pie charts"を勝手に削除 | 本文改変禁止の不徹底 | exam-verify 鉄則1 |
| 語群リストを「無い」と誤報告 | 表を見ず段落だけ検査 | exam-docx 読み方 |
| 白文字"niversal"を「解答漏れ」と誤報告 | run色の未確認 | exam-docx 白文字 |
| 解答用紙の枠数が語数と不一致 | 1枠1語ルール不知 | exam-answersheet |
