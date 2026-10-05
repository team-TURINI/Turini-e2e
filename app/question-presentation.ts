const OX_INSTRUCTION = /^다음 설명이 맞으면 O, 틀리면 X를 선택하세요\.\s*/u;
const BLANK_INSTRUCTION = /^다음 (?:질문|문장)의 빈칸에 들어갈 알맞은 답을 고르세요\.\s*/u;
const TRAILING_BLANK = /\s*선택:\s*_+\s*$/u;
const BLANK = "_____";

type BlankQuestion = {
  id: string;
  base_id: string;
  category: string;
  difficulty: string;
  type: string;
  question: string;
  choices: string[];
  answer: string;
  accepted_answers?: string[];
  answer_mode?: string;
  weakness_tag?: string;
  parent_tag?: string;
};

type ClozeOverride = Pick<BlankQuestion, "question" | "choices" | "answer">;

/** 사람이 검토한 대표 문항. 나머지 문항도 아래의 공통 변환 규칙을 적용합니다. */
const CLOZE_OVERRIDES: Readonly<Record<string, ClozeOverride>> = {
  STK_B_005: {
    question: `한국 유가증권시장의 대표 지수는 ${BLANK}이다.`,
    choices: ["KOSPI", "KOSDAQ", "NASDAQ", "S&P 500"],
    answer: "KOSPI",
  },
};

function stripInstructions(value: string) {
  return value
    .replace(OX_INSTRUCTION, "")
    .replace(BLANK_INSTRUCTION, "")
    .replace(TRAILING_BLANK, "")
    .trim();
}

function topicParticle(value: string) {
  const trimmed = value.trim();
  const last = trimmed.codePointAt(trimmed.length - 1);
  if (!last || last < 0xac00 || last > 0xd7a3) return "은";
  return (last - 0xac00) % 28 === 0 ? "는" : "은";
}

/** 직접 입력용 질문을 답 자체가 문장 안에서 빠진 실제 빈칸 문장으로 바꿉니다. */
export function toClozePrompt(value: string, answer = "") {
  const prompt = stripInstructions(value).replace(/\s+/gu, " ");

  const inputMatch = prompt.match(/^(.+)(?:을|를)(?:\s+([^.!?]+?))?\s*입력하세요[.]?$/u);
  if (inputMatch) {
    const subject = inputMatch[1].trim();
    const qualifier = inputMatch[2]?.trim();
    if (qualifier === "하나") return `${subject} 하나는 ${BLANK}이다.`;
    return `${subject}${topicParticle(subject)}${qualifier ? ` ${qualifier}` : ""} ${BLANK}이다.`;
  }

  const replacements: Array<[RegExp, string]> = [
    [/무엇이라고 하나요[?]?$/u, `${BLANK}이라고 한다.`],
    [/무엇이라고 부를 수 있나요[?]?$/u, `${BLANK}이라고 부른다.`],
    [/무엇인가요[?]?$/u, `${BLANK}이다.`],
    [/어디인가요[?]?$/u, `${BLANK}이다.`],
    [/누구인가요[?]?$/u, `${BLANK}이다.`],
    [/어느 쪽인가요[?]?$/u, `${BLANK}이다.`],
    [/어느 것인가요[?]?$/u, `${BLANK}이다.`],
    [/몇\s*[^?\s]*인가요[?]?$/u, `${BLANK}이다.`],
    [/얼마인가요[?]?$/u, `${BLANK}이다.`],
    [/얼마가 되나요[?]?$/u, `${BLANK}이 된다.`],
    [/얼마 남나요[?]?$/u, `${BLANK}이 남는다.`],
    [/얼마나 변하나요[?]?$/u, `${BLANK}만큼 변한다.`],
    [/몇 % 상승해야 하나요[?]?$/u, `${BLANK}% 상승해야 한다.`],
    [/무엇의 반환인가요[?]?$/u, `${BLANK}의 반환이다.`],
    [/무엇을 우선 의심해야 하나요[?]?$/u, `우선 의심해야 할 대상은 ${BLANK}이다.`],
    [/무슨 ([^?]+)이라고 하나요[?]?$/u, `${BLANK} $1이라고 한다.`],
    [/무슨 ([^?]+)인가요[?]?$/u, `${BLANK} $1이다.`],
    [/어떤 기준의 수익률이 높아질 수 있나요[?]?$/u, `높아질 수 있는 수익률 기준은 ${BLANK}이다.`],
    [/어느 수준인가요[?]?$/u, `${BLANK}.`],
    [/비중이 어떠한 자산에 배정해야 하나요[?]?$/u, `비중이 ${BLANK}인 자산에 배정해야 한다.`],
    [/커지나요, 작아지나요[?]?$/u, `${BLANK}.`],
    [/어떻게 되나요[?]?$/u, /(?:한다|된다|진다|없다|같다)$/u.test(answer.trim()) ? `${BLANK}.` : `${BLANK}한다.`],
    [/어떻게 변하나요[?]?$/u, /(?:한다|된다|진다|없다|같다)$/u.test(answer.trim()) ? `${BLANK}.` : `${BLANK}한다.`],
    [/있나요[?]?$/u, `있는지에 대한 판단은 ${BLANK}이다.`],
    [/대상인가요[?]?$/u, `대상인지에 대한 판단은 ${BLANK}이다.`],
    [/적신호인가요[?]?$/u, `적신호인지에 대한 판단은 ${BLANK}이다.`],
    [/특징인가요[?]?$/u, `특징인지에 대한 판단은 ${BLANK}이다.`],
    [/보장되나요[?]?$/u, `보장되는지에 대한 판단은 ${BLANK}이다.`],
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(prompt)) return prompt.replace(pattern, replacement);
  }

  const withoutEnding = prompt.replace(/[?.]+$/u, "");
  if (/[은는이가]$/u.test(withoutEnding)) return `${withoutEnding} ${BLANK}이다.`;
  return `${withoutEnding}의 답은 ${BLANK}이다.`;
}

function normalizedAnswer(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\s·,()\-+/%]/gu, "");
}

function answerKind(value: string) {
  if (/%p?$/iu.test(value)) return "percent";
  if (/(?:원|만원|억원)$/u.test(value)) return "money";
  if (/(?:년|개월|일)$/u.test(value)) return "duration";
  if (/^T\+\d+$/iu.test(value)) return "settlement";
  if (/^[A-Z][A-Z0-9+&/ .-]*$/u.test(value)) return "acronym";
  if (/\d/u.test(value)) return "number";
  return value.length <= 10 ? "term" : "phrase";
}

function stableHash(value: string) {
  let result = 0;
  for (const character of value) result = (result * 31 + (character.codePointAt(0) || 0)) >>> 0;
  return result;
}

function buildChoices(question: BlankQuestion, source: BlankQuestion, inputs: BlankQuestion[]) {
  const answer = source.answer.trim();
  if (answer === "그렇다" || answer === "아니다") {
    return ["그렇다", "아니다", "경우에 따라 다르다", "확인할 수 없다"];
  }
  const aliases = new Set([answer, ...(source.accepted_answers || [])].map(normalizedAnswer));
  const kind = answerKind(answer);
  const candidates = inputs
    .filter((candidate) => candidate.base_id !== question.base_id && candidate.category === question.category)
    .filter((candidate) => !aliases.has(normalizedAnswer(candidate.answer)))
    .filter((candidate) => candidate.answer !== "그렇다" && candidate.answer !== "아니다")
    .map((candidate) => ({
      answer: candidate.answer.trim(),
      score:
        (answerKind(candidate.answer) === kind ? 100 : 0)
        + (candidate.difficulty === question.difficulty ? 30 : 0)
        + (candidate.parent_tag && candidate.parent_tag === question.parent_tag ? 20 : 0)
        + (candidate.weakness_tag && candidate.weakness_tag === question.weakness_tag ? 10 : 0)
        - Math.abs(candidate.answer.length - answer.length),
      tie: stableHash(`${question.id}:${candidate.id}`),
    }))
    .sort((a, b) => b.score - a.score || a.tie - b.tie);

  const distractors: string[] = [];
  const used = new Set(aliases);
  for (const candidate of candidates) {
    const normalized = normalizedAnswer(candidate.answer);
    if (used.has(normalized)) continue;
    distractors.push(candidate.answer);
    used.add(normalized);
    if (distractors.length === 3) break;
  }

  const choices = distractors.slice(0, 3);
  choices.splice(stableHash(question.id) % 4, 0, answer);
  return choices;
}

/**
 * 복제된 사지선다형 빈칸 문항을 같은 개념의 직접 입력 문항을 바탕으로 다시 만듭니다.
 * 질문에는 빈칸이 실제 문장 성분으로 들어가며, 선택지는 짧은 용어·수치가 됩니다.
 */
export function normalizeBlankChoiceQuestions<T extends BlankQuestion>(items: T[]): T[] {
  const inputs = items.filter((item) => item.type === "빈칸직접입력");
  const inputByBaseId = new Map(inputs.map((item) => [item.base_id, item]));

  return items.map((item) => {
    if (item.type !== "빈칸선택") return item;

    const override = CLOZE_OVERRIDES[item.base_id];
    if (override) return { ...item, ...override };

    const source = inputByBaseId.get(item.base_id);
    if (!source) return { ...item, question: toClozePrompt(item.question) };
    return {
      ...item,
      question: toClozePrompt(source.question, source.answer),
      choices: buildChoices(item, source, inputs),
      answer: source.answer,
      accepted_answers: source.accepted_answers,
      answer_mode: source.answer_mode,
    };
  });
}

/** 화면에서 문항 유형이 분명히 드러나도록 문제 문장을 정리합니다. */
export function formatQuestionPrompt(type: string, value: string) {
  const prompt = stripInstructions(value);
  if (type !== "빈칸선택" || /_+/u.test(prompt)) return prompt;
  return toClozePrompt(prompt);
}

