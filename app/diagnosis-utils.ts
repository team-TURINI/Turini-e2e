export type FinanceLevel = "초급" | "중급" | "고급";
export type InvestmentTendency = "안정형" | "중립형" | "공격형";

export function financeLevelForRawScore(rawScore: number): FinanceLevel {
  if (rawScore <= 21) return "초급";
  if (rawScore <= 38) return "중급";
  return "고급";
}

export function tendencyForProfileScore(score: number, minimum: number, maximum: number): InvestmentTendency {
  const range = maximum - minimum;
  const position = range > 0 ? (score - minimum) / range : 0;
  // Preserve the old three-band profile proportions across the new weighted score range.
  if (position <= 1 / 6) return "안정형";
  if (position <= 2 / 3) return "중립형";
  return "공격형";
}
