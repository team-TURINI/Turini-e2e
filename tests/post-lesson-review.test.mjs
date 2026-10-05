import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  conceptKey,
  createRetryQuestion,
  planSessionQuestions,
  recordConceptReview,
} from "../app/quiz-scheduler.ts";
import {
  categoryLessonPool,
} from "../app/category-progress.ts";

const questions = JSON.parse(
  await readFile(new URL("../public/data/quizData_864_FINAL.json", import.meta.url), "utf8"),
);
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const characterCss = await readFile(new URL("../app/turini-character.css", import.meta.url), "utf8");

test("오답은 기본 문제를 교체하지 않고 다른 유형의 복습 문항으로 따로 만든다", () => {
  const source = questions.find((question) => question.id === "STK_B_001_MCQ");
  const retry = createRetryQuestion(source, questions, 17);
  assert.ok(retry);
  assert.equal(conceptKey(retry), conceptKey(source));
  assert.equal(retry.category, source.category);
  assert.equal(retry.difficulty, source.difficulty);
  assert.notEqual(retry.id, source.id);
  assert.notEqual(retry.type, source.type);
  assert.equal(retry.reviewKind, "retry");
});

test("각 난이도의 네 레슨은 오답 여부와 무관하게 서로 다른 기본 40문항을 완료한다", () => {
  const categories = [...new Set(questions.map((question) => question.category))];
  for (const category of categories) {
    for (const firstLesson of [1, 5, 9]) {
      const pool = categoryLessonPool(questions, category, firstLesson);
      const completedIds = new Set();
      let progress = { studySessions: 0, conceptReviews: {}, pendingRetries: [] };
      for (let stage = 0; stage < 4; stage += 1) {
        const uncompleted = pool.filter((question) => !completedIds.has(question.id));
        const session = planSessionQuestions(
          uncompleted,
          10,
          701 + firstLesson * 53 + stage * 997,
          progress.conceptReviews,
          progress.studySessions,
          [],
          { completedIds: [...completedIds], recentIds: [...completedIds].slice(-30) },
        );
        assert.equal(session.length, 10, `${category} ${firstLesson}단계 ${stage + 1}회`);
        assert.equal(session.some((question) => question.reviewKind === "retry"), false);
        assert.equal(session.some((question) => completedIds.has(question.id)), false);
        for (const [index, question] of session.entries()) {
          completedIds.add(question.id);
          progress = recordConceptReview(progress, question, index % 3 !== 0);
        }
        progress = { ...progress, studySessions: progress.studySessions + 1 };
      }
      assert.equal(completedIds.size, 40, `${category} · 시작 레슨 ${firstLesson}`);
    }
  }
});

test("기본 10문제 뒤에 안내 화면을 거쳐 오답만 한 번씩 추가 출제한다", () => {
  assert.doesNotMatch(page, /scheduleRetry/);
  assert.match(page, /const uncompletedLessonPool = mode === "lesson"/);
  assert.match(page, /!correct && !isRetry && session\.mode !== "diagnosis"/);
  assert.match(page, /기본 \{session\.baseQuestionCount\}문제 완료/);
  assert.match(page, /이제 오답 복습을 시작해요/);
  assert.match(page, /틀린 \{session\.retryQuestions\.length\}문제를 다른 유형으로 한 번씩 다시 풀어요/);
  assert.match(page, /questions: \[\.\.\.session\.questions\.slice\(0, session\.baseQuestionCount\), \.\.\.session\.retryQuestions\]/);
  assert.match(page, /finished\.questions\.slice\(0, finished\.baseQuestionCount\)/);
});

test("완료 화면은 다이아몬드 장식을 없애고 캐릭터와 완료 문구 사이를 띄운다", () => {
  assert.doesNotMatch(page, /className="confetti"/);
  assert.match(characterCss, /\.turini-lesson-result \{ width: 190px; margin: -32px auto 16px; \}/);
});

