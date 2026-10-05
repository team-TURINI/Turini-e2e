import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isChoiceCorrect } from "../app/answer-utils.ts";
import { answerLinkedExplanation, friendlyizeExplanation } from "../app/explanation-utils.ts";
import {
  formatQuestionPrompt,
  normalizeBlankChoiceQuestions,
} from "../app/question-presentation.ts";

const questions = JSON.parse(
  await readFile(new URL("../public/data/quizData_864_FINAL.json", import.meta.url), "utf8"),
);
const overrides = JSON.parse(
  await readFile(new URL("../public/data/quizData_overrides.json", import.meta.url), "utf8"),
);
for (const question of questions) Object.assign(question, overrides[question.id] || {});
const presentedQuestions = normalizeBlankChoiceQuestions(questions);

test("선택형 문항은 데이터에 지정된 보기 하나만 정답으로 표시한다", () => {
  const choiceQuestions = questions.filter((question) => !question.type.includes("직접입력"));
  for (const question of choiceQuestions) {
    const correctChoices = question.choices.filter((choice) => isChoiceCorrect(choice, question.answer));
    assert.deepEqual(correctChoices, [question.answer], question.id);
  }
});

test("빈칸 선택 216문항은 문장 안에 실제 빈칸과 짧은 선택지를 표시한다", () => {
  const blanks = presentedQuestions.filter((question) => question.type === "빈칸선택");
  assert.equal(blanks.length, 216);
  for (const question of blanks) {
    const prompt = formatQuestionPrompt(question.type, question.question);
    assert.equal(prompt.match(/_____/gu)?.length, 1, `${question.id}: ${prompt}`);
    assert.doesNotMatch(prompt, /^다음 (?:질문|문장)의 빈칸/u, question.id);
    assert.doesNotMatch(prompt, /선택:\s*_+/u, question.id);
    assert.doesNotMatch(prompt, /[?？]/u, `${question.id}: ${prompt}`);
    assert.equal(question.choices.length, 4, question.id);
    assert.ok(question.choices.includes(question.answer), question.id);
    assert.equal(new Set(question.choices).size, 4, question.id);
    assert.ok(question.choices.every((choice) => choice.length <= 20), `${question.id}: ${question.choices.join(" / ")}`);
  }
});

test("KOSPI 빈칸 문항은 핵심 용어를 문장 안에서 묻는다", () => {
  const question = presentedQuestions.find((item) => item.id === "STK_B_005_BLANK_CHOICE");
  assert.equal(question.question, "한국 유가증권시장의 대표 지수는 _____이다.");
  assert.equal(question.answer, "KOSPI");
  assert.deepEqual(question.choices, ["KOSPI", "KOSDAQ", "NASDAQ", "S&P 500"]);
});

test("모든 해설은 현재 문항의 정답이나 OX 판정을 먼저 밝혀 준다", () => {
  for (const question of questions) {
    const rendered = answerLinkedExplanation(question.type, question.answer, question.explanation);
    if (question.type === "OX") {
      assert.ok(
        rendered.startsWith(question.answer === "O" ? "이 문장은 맞아요." : "이 문장은 틀려요."),
        question.id,
      );
    } else {
      assert.ok(rendered.startsWith(`정답은 ‘${question.answer}’예요.`), question.id);
    }
    assert.ok(rendered.endsWith(friendlyizeExplanation(question.explanation)), question.id);
    assert.doesNotMatch(rendered, /다른 보기는.+정답이에요/u, question.id);
  }
});

test("화면에 표시되는 해설은 보기 번호처럼 보이는 번호 나열을 사용하지 않는다", () => {
  for (const question of questions) {
    assert.doesNotMatch(
      question.explanation,
      /[①②③④]|(?:보기|선택지|정답(?:은|이)?)\s*(?:[1-4]|[①②③④])|(?:[1-4]|[①②③④])\s*번/u,
      question.id,
    );
  }
});

test("빈칸에 정답을 넣어도 서술어가 이중으로 붙지 않는다", () => {
  const blanks = presentedQuestions.filter((question) => question.type === "빈칸선택");
  for (const question of blanks) {
    const completed = formatQuestionPrompt(question.type, question.question).replace("_____", question.answer);
    assert.doesNotMatch(completed, /(?:한다|된다|진다|없다|같다)한다/u, `${question.id}: ${completed}`);
    assert.doesNotMatch(completed, /이다이다/u, `${question.id}: ${completed}`);
  }
});

test("각 문항은 앞 문제나 보이지 않는 사례에 의존하지 않는다", () => {
  for (const question of questions) {
    assert.doesNotMatch(question.question, /앞서|앞 문제|이전 문제|제시된 사례/u, question.id);
  }
});

