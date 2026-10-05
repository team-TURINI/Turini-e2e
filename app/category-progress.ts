export const QUESTIONS_PER_CATEGORY_LEVEL = 10;
export const MAX_CATEGORY_LEVEL = 12;
export const QUESTIONS_PER_CATEGORY = QUESTIONS_PER_CATEGORY_LEVEL * MAX_CATEGORY_LEVEL;

/** 과거 진단 기록과 중복 id를 학습 진도에서 제외합니다. */
export function learningCompletedIds(saved: unknown, questions: Array<{ id: string }>) {
  const valid = new Set(questions.map((question) => question.id));
  return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === "string" && valid.has(id)))] : [];
}

export function difficultySolvedCount(
  questions: Array<{ id: string; category: string; difficulty: string }>,
  completedIds: Set<string>, category: string, difficulty: string,
) {
  return new Set(questions.filter((question) => question.category === category
    && question.difficulty === difficulty && completedIds.has(question.id)).map((question) => question.id)).size;
}

/**
 * 예전 버전에서 오답 복습이 기본 10문제를 밀어내어 적게 저장된 진도를 복구합니다.
 * 완료한 레슨은 레슨당 10문제를 끝낸 것으로 보되, 실제 저장 문항 수가 더 크면 그 값을 유지합니다.
 */
export function categoryProgressCount(actualSolved: number, completedLesson: number) {
  const solved = Number.isFinite(actualSolved) ? Math.max(0, Math.floor(actualSolved)) : 0;
  const lessons = Number.isFinite(completedLesson)
    ? Math.min(MAX_CATEGORY_LEVEL, Math.max(0, Math.floor(completedLesson)))
    : 0;
  return Math.min(QUESTIONS_PER_CATEGORY, Math.max(solved, lessons * QUESTIONS_PER_CATEGORY_LEVEL));
}

export function categoryLevelForSolved(solved: number) {
  const completed = Number.isFinite(solved) ? Math.max(0, Math.floor(solved)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.floor(completed / QUESTIONS_PER_CATEGORY_LEVEL) + 1);
}

export function completedCategoryLessonsForSolved(solved: number) {
  const completed = Number.isFinite(solved) ? Math.max(0, Math.floor(solved)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.floor(completed / QUESTIONS_PER_CATEGORY_LEVEL));
}

/** 이전 계정의 문항별 진도와 새 레슨 완료 기록 중 더 앞선 위치를 사용합니다. */
export function completedCategoryLessons(solved: number, completedLesson: number) {
  const saved = Number.isFinite(completedLesson) ? Math.max(0, Math.floor(completedLesson)) : 0;
  return Math.min(MAX_CATEGORY_LEVEL, Math.max(completedCategoryLessonsForSolved(solved), saved));
}

export function categoryDifficultyForLesson(lesson: number) {
  const safeLesson = Math.min(MAX_CATEGORY_LEVEL, Math.max(1, Math.floor(lesson)));
  if (safeLesson <= 4) return "초급" as const;
  if (safeLesson <= 8) return "중급" as const;
  return "고급" as const;
}

export function categoryLessonPool<
  T extends { id: string; base_id: string; category: string; difficulty: string },
>(questions: T[], category: string, lesson: number) {
  const difficulty = categoryDifficultyForLesson(lesson);
  const byConcept = new Map<string, T[]>();

  questions
    .filter((question) => question.category === category && question.difficulty === difficulty)
    .forEach((question) => {
      const variants = byConcept.get(question.base_id) || [];
      variants.push(question);
      byConcept.set(question.base_id, variants);
    });

  return [...byConcept.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, variants]) => variants.sort((left, right) => left.id.localeCompare(right.id)));
}

/** 난이도 구간의 첫 레슨 번호 (1-4 초급 · 5-8 중급 · 9-12 고급) */
export const BAND_START: Record<string, number> = { 초급: 1, 중급: 5, 고급: 9 };
export const BAND_SIZE = 4;

/** 완료 레슨 기록을 사용해 각 난이도 구간의 과거 누락 진도를 복구합니다. */
export function difficultyProgressCount(actualSolved: number, completedLesson: number, difficulty: string) {
  const solved = Number.isFinite(actualSolved) ? Math.max(0, Math.floor(actualSolved)) : 0;
  const from = BAND_START[difficulty] ?? 1;
  const completed = Number.isFinite(completedLesson) ? Math.max(0, Math.floor(completedLesson)) : 0;
  const completedInBand = Math.min(BAND_SIZE, Math.max(0, completed - from + 1));
  const total = BAND_SIZE * QUESTIONS_PER_CATEGORY_LEVEL;
  return Math.min(total, Math.max(solved, completedInBand * QUESTIONS_PER_CATEGORY_LEVEL));
}

/**
 * 그 난이도 구간에서 지금 들어가면 좋은 레슨 번호.
 * 이미 지난 레슨은 건너뛰고, 구간을 벗어나지 않습니다.
 */
export function bandEntryLesson(difficulty: string, completedLessons: number, totalLessons = MAX_CATEGORY_LEVEL) {
  const from = BAND_START[difficulty] ?? 1;
  const to = Math.min(totalLessons, from + BAND_SIZE - 1);
  const done = Number.isFinite(completedLessons) ? Math.max(0, Math.floor(completedLessons)) : 0;
  return Math.min(to, Math.max(from, done + 1));
}

