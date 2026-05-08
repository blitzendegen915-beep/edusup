# CLAUDE.md — teacher-automation-lab

## What this project is

A toolbox of automation scripts for a Japanese high school English teacher. Tools handle routine tasks: generating Google Forms quizzes, managing worksheets, and eventually video editing and web utilities.

See `AGENTS.md` for the behavioural rules all AI agents must follow when working in this repo. This file covers the technical structure and workflow mechanics.

## Classroom-hub integration

This repo is part of the **classroom-hub** ecosystem — a collection of tools managed by the same teacher.

- **classroom-hub** is the parent repository that links all classroom tools (including vocab-battle and the tools in this repo) in one place.
- When a new tool is completed here, add a corresponding entry or link in classroom-hub so teachers can discover and launch it from the central hub.
- Shared conventions (dummy data policy, Japanese UI text, GAS deployment patterns) apply across all classroom-hub tools.
- To push a completed tool to the hub: finish implementation here first, then update classroom-hub's index/link list.

## Repository layout

```
gas/          Google Apps Script files (.gs)
vba/          Excel/Word VBA macros (.bas, .vba)
web/          Standalone web tools (HTML/JS/CSS)
aviutl/       AviUtl scripts and plugins
samples/      Sample data files (always dummy data, never real student data)
docs/         Usage documentation per tool
tasks/
  todo/       Task briefs not yet started
  doing/      Task currently in progress (move here when you pick it up)
  done/       Completed tasks (move here when implementation is done)
```

Directories with only a `.gitkeep` are reserved for future tools.

## Task workflow

Tasks are markdown files in `tasks/`. The filename format is `NNN-short-description.md`.

1. Pull a task from `tasks/todo/` → move it to `tasks/doing/` when starting work.
2. Implement the tool in the appropriate subdirectory.
3. Write or update the usage doc in `docs/`.
4. Move the task file to `tasks/done/`.
5. Update `README.md` with a one-line entry under the relevant tool category.

Never leave a task stuck in `tasks/doing/` — either finish it or return it to `tasks/todo/` with a note explaining what blocked you.

## Implemented tools

### Google Forms Quiz Generator (`gas/form_generator.gs`)

Reads questions from a Google Sheet named **「問題」** and creates a Google Forms quiz automatically.

**Sheet column layout (starting row 2):**

| Col | Content |
|-----|---------|
| A | 問題文 (question text) |
| B–E | 選択肢1–4 (choice 1–4) |
| F | 正解番号 1–4 (correct answer index) |
| G | 解説 (explanation / feedback) |

Row 1 is a header and is skipped. Blank rows are skipped. Partially filled rows throw a descriptive error.

**Entry point:** `createGrammarQuizForm()` — triggered from the "フォーム作成" menu added by `onOpen()`.

**Internal helpers (trailing underscore = private):**
- `readQuestionsFromSheet_()` — reads and validates rows, returns question array
- `validateQuestionRow_()` — throws on missing fields or out-of-range answer index
- `buildQuizForm_()` — creates the Form, adds multiple-choice items with correct answers and feedback

**Deployment:** paste the entire `.gs` file into Apps Script editor of the target Google Sheet, save, reload the sheet.

**Docs:** `docs/google_forms_generator.md`

## Coding conventions (all tool types)

### Google Apps Script

- Trigger-based menus for discoverability (`onOpen`); show results/errors via `ui.alert`.
- Private helper functions use a trailing underscore suffix (`helperName_`).
- All `SpreadsheetApp` / `FormApp` calls inside a single function should be batched — avoid repeated `getRange` / `getValue` calls in loops.
- Error messages must be in Japanese and specific enough for a non-technical user to understand what to fix.
- Use `const` and `function` declarations; avoid `var`.
- No external libraries unless unavoidable.

### VBA

- Prefer late binding (no `Set ref = CreateObject(...)` style) to avoid reference configuration requirements.
- All public procedures must have an error handler (`On Error GoTo ErrHandler`).
- Use named constants instead of magic numbers/strings.

### Web tools

- Plain HTML + vanilla JS; no frameworks or bundlers unless the task explicitly calls for one.
- All user-facing text in Japanese; code identifiers in English.
- Escape all user-derived content before inserting into innerHTML.

### General

- **Never use real student data** in samples, tests, or documentation — always dummy data.
- Add a comment block at the top of each file explaining its purpose, inputs, and outputs.
- Keep functions focused; extract helpers when a function exceeds ~40 lines.
- Report completion in the format specified in `AGENTS.md` § "納品時に報告すること".

## Testing approach

GAS and VBA cannot be unit tested easily. Instead:

1. Create a test Google Sheet with dummy data matching the expected format.
2. Run the script and verify the output matches the stated requirements.
3. Test edge cases: empty sheet, partial rows, invalid answer numbers.
4. Document the test steps in the task's done file under "テスト方法".

For web tools: open in a browser, exercise the UI manually with both valid and invalid inputs.

## Documentation standard

Each tool gets a doc file in `docs/<tool-name>.md` containing:
- Prerequisites (what the user needs to set up beforehand)
- Setup steps (numbered, copy-paste ready)
- Usage steps (numbered)
- Example input/output
- Verification checklist
- Caveats and known limitations
