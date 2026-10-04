const OX_INSTRUCTION = /^다음 설명이 맞으면 O, 틀리면 X를 선택하세요\.\s*/u;
const BLANK_INSTRUCTION = /^다음 (?:질문|문장)의 빈칸에 들어갈 알맞은 답을 고르세요\.\s*/u;
const TRAILING_BLANK = /\s*선택:\s*_+\s*$/u;

function stripInstructions(value: string) {
  return value
    .replace(OX_INSTRUCTION, "")
    .replace(BLANK_INSTRUCTION, "")
    .replace(TRAILING_BLANK, "")
    .trim();
}

/** 화면에서 문항 유형이 분명히 드러나도록 문제 문장을 정리합니다. */
export function formatQuestionPrompt(type: string, value: string) {
  const prompt = stripInstructions(value);
  if (type !== "빈칸선택" || /_+/u.test(prompt)) return prompt;
  return `${prompt}\n정답은 _____예요.`;
}

