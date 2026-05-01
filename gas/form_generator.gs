/**
 * Google Sheets の「問題」シートから Google Forms の小テストを作成します。
 *
 * 入力列:
 * A: 問題文, B-E: 選択肢1-4, F: 正解番号, G: 解説
 */
const QUESTION_SHEET_NAME = '問題';
const FORM_TITLE = '文法小テスト';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('フォーム作成')
    .addItem('小テストを作成する', 'createGrammarQuizForm')
    .addToUi();
}

function createGrammarQuizForm() {
  const ui = SpreadsheetApp.getUi();

  try {
    const questions = readQuestionsFromSheet_();
    const form = buildQuizForm_(questions);

    ui.alert(
      'フォームを作成しました',
      '編集用URL:\n' + form.getEditUrl() + '\n\n回答用URL:\n' + form.getPublishedUrl(),
      ui.ButtonSet.OK
    );
  } catch (error) {
    ui.alert('フォームを作成できませんでした', error.message, ui.ButtonSet.OK);
  }
}

function readQuestionsFromSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(QUESTION_SHEET_NAME);

  if (!sheet) {
    throw new Error('「' + QUESTION_SHEET_NAME + '」シートが見つかりません。');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('2行目以降に問題を入力してください。');
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const questions = [];

  rows.forEach(function(row, index) {
    const rowNumber = index + 2;
    const questionText = String(row[0]).trim();
    const options = row.slice(1, 5).map(function(option) {
      return String(option).trim();
    });
    const answerNumber = Number(row[5]);
    const explanation = String(row[6]).trim();

    if (!questionText && options.every(function(option) { return !option; }) && !row[5] && !explanation) {
      return;
    }

    validateQuestionRow_(rowNumber, questionText, options, answerNumber);

    questions.push({
      questionText: questionText,
      options: options,
      answerNumber: answerNumber,
      explanation: explanation
    });
  });

  if (questions.length === 0) {
    throw new Error('読み込める問題がありません。2行目以降に問題を入力してください。');
  }

  return questions;
}

function validateQuestionRow_(rowNumber, questionText, options, answerNumber) {
  if (!questionText) {
    throw new Error(rowNumber + '行目の問題文が空です。');
  }

  options.forEach(function(option, index) {
    if (!option) {
      throw new Error(rowNumber + '行目の選択肢' + (index + 1) + 'が空です。');
    }
  });

  if (!Number.isInteger(answerNumber) || answerNumber < 1 || answerNumber > 4) {
    throw new Error(rowNumber + '行目の正解番号は 1 から 4 の整数で入力してください。');
  }
}

function buildQuizForm_(questions) {
  const form = FormApp.create(FORM_TITLE);
  form.setIsQuiz(true);
  form.setDescription('Googleスプレッドシートから自動作成した文法小テストです。');

  questions.forEach(function(question, index) {
    const item = form.addMultipleChoiceItem();
    const choices = question.options.map(function(option, optionIndex) {
      return item.createChoice(option, optionIndex + 1 === question.answerNumber);
    });

    item.setTitle((index + 1) + '. ' + question.questionText)
      .setChoices(choices)
      .setPoints(1)
      .setRequired(true);

    if (question.explanation) {
      const feedback = FormApp.createFeedback()
        .setText(question.explanation)
        .build();
      item.setFeedbackForCorrect(feedback);
      item.setFeedbackForIncorrect(feedback);
    }
  });

  return form;
}
