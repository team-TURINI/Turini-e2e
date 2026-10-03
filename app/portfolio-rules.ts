/**
 * 포트폴리오 규칙 엔진 v12 — docs/PORTFOLIO_V12_SPEC.md (원본: turini-portfolio-v11/docs/포트폴리오_재건축_v12_최종.md §3)
 *
 * 상수는 전부 ./portfolio-rules.constants.ts 에서 읽는다 (파이썬 레포가 JSON 에서 생성). 숫자를 여기 쓰지 않는다.
 *  · 등급   = 역사적 VaR₉₇.₅ (수익률 행렬 R·w 의 2.5퍼센타일 × √P), 밴드 1/10/20/30/50 — 현행 펀드 위험등급과 같은 산출법
 *  · 범위·fit·게이지·하방 = σ_p = √(wᵀΣw)
 *  · 기간 적합 = 상한 조건 (σ_p ≤ cap). 미달 방향 없음
 *  · 추천     = 성향 범위 ∩ [0, cap]. 성향 하한 ≥ cap 이면 기간 밴드 우선 + 고지 (horizon_capped). 보류 상태 없음
 *  · 강점     = 성향 적합 · 자산 간 분산효과(섞어서 등급 한 단계 이상 하락) · 기간 적합
 */
import * as C from "./portfolio-rules.constants.ts";

export type AssetKey = "domestic" | "overseas" | "bond" | "equityFund" | "cash" | "gold";
export type Allocation = Record<AssetKey, number>;
export type PortfolioType = "안정형" | "중립형" | "공격형";
export type PortfolioTendency = PortfolioType | "진단 전";
export type PortfolioHorizon = "1년 미만" | "1~3년" | "3~10년" | "10년 이상";
export type TraitLevel = "낮음" | "보통" | "높음";
export type SignalKind = "structural" | "caution";
export type RecommendationStatus = "hold" | "recommended" | "horizon_capped" | "no_feasible_target";
export type DiversificationStatus = "valid" | "zero_reference" | "invalid";
export type ModelStatus = "generated_from_rules_json";
export type Range = readonly [number, number];

export type AssetDefinition = { key: AssetKey; label: string; short: string; color: string; icon: string; volatility: number; help: string };
export type PortfolioSignal = { id: number; kind: SignalKind; text: string };
export type StrengthAxis = { axis: "type_fit" | "diversification" | "horizon_fit"; sentence: string };

export type TargetSnapshot = {
  allocation: Allocation;
  riskScore: number;
  riskVar: number;
  riskGrade: number;
  riskGradeName: string;
  riskLevel: number;
  downside6m: number;
};

export type PortfolioResult = {
  ruleVersion: string;
  modelStatus: ModelStatus;
  sigmaAsof: string;
  riskScore: number;
  riskVar: number;
  riskGrade: number;
  riskGradeName: string;
  riskLevel: number;
  downside6m: number;
  fit: number;
  horizonFit: number;
  typeFitLabel: string;
  horizonFitLabel: string;
  profileRange: Range;
  horizonRange: Range;
  horizonCap: number;
  profileCenter: number;
  horizonCenter: number;
  diversificationReduction: number | null;
  diversificationStatus: DiversificationStatus;
  diversificationGradeDrop: number;
  characteristics: { growth: TraitLevel; defense: TraitLevel; liquidity: TraitLevel };
  recommendationStatus: RecommendationStatus;
  nearTarget: TargetSnapshot | null;
  baseTarget: TargetSnapshot;
  rebalancingActions: { asset: AssetKey; delta: number; action: "확대" | "축소" }[];
  residualItems: { asset: AssetKey; delta: number }[];
  signals: PortfolioSignal[];
  strengthAxes: StrengthAxis[];
  strengths: string[];
  cautions: string[];
  unlockTags: string[];
  coach: string;
};

// 규칙 버전이 바뀌면 저장된 옛 결과는 다시 계산한다.
export const PORTFOLIO_RULE_VERSION = `5.0.0-portfolio-${C.RULE_VERSION}`;
export const PORTFOLIO_MODEL_STATUS: ModelStatus = "generated_from_rules_json";
export const PORTFOLIO_SIGMA_ASOF = C.SIGMA_ASOF;
export const MODEL_LIMITATION = C.FREQUENCY === "weekly"
  ? `${C.SIGMA_ASOF} 기준 주간 시계열 ${C.N_OBS}개로 계산해요. 손실 위험(VaR)은 일간 시계열로 재산출하기 전까지 임시값이에요.`
  : `${C.SIGMA_ASOF} 기준 일간 시계열 ${C.N_OBS}개로 계산해요. 현행 펀드 위험등급과 같은 3년·2.5퍼센타일 기준이에요.`;

export const OK_TYPE_LABEL = "성향과 잘 맞아요";
export const OK_HORIZON_LABEL = "투자기간 기준 안이에요";

const ASSET_META: Omit<AssetDefinition, "volatility">[] = [
  { key: "domestic", label: "국내주식", short: "국내", color: "#58cc02", icon: "KR", help: "국내 거래소에 상장된 개별기업 주식의 합계예요. 국내 주식형 ETF·펀드는 ‘주식형 ETF·펀드’에 입력해 주세요." },
  { key: "overseas", label: "해외주식", short: "해외", color: "#1cb0f6", icon: "GL", help: "해외 거래소에 상장된 개별기업 주식의 합계예요. 환율·국가 위험도 함께 반영하고, 해외 주식형 ETF·펀드는 별도 항목에 입력해 주세요." },
  { key: "bond", label: "채권", short: "채권", color: "#9069e7", icon: "B", help: "직접채권과 일반 채권 ETF·채권형 펀드를 합산해요. 장기채·하이일드·환노출 해외채권은 실제 위험도가 대표값보다 높을 수 있어요." },
  { key: "equityFund", label: "주식형 ETF·펀드", short: "주식형", color: "#ff9600", icon: "F", help: "주식에 주로 투자하는 ETF·펀드예요. 국내·해외 지수형, 액티브형, 섹터·테마형을 포함하고 레버리지·인버스 상품은 제외해요." },
  { key: "cash", label: "현금성자산", short: "현금", color: "#2bb6a8", icon: "₩", help: "현금, 입출금·단기 예금, CMA·MMF처럼 비교적 빠르게 사용할 수 있는 자산이에요. 상품마다 원금보장·예금자보호 여부는 달라요." },
  { key: "gold", label: "금", short: "금", color: "#ffc800", icon: "Au", help: "실물 금, 금 통장과 금 현물 가격을 추종하는 일반 상품을 합산해요. 환헤지형(H) 금 ETF는 환율 변동이 빠져 실제 위험도가 대표값보다 낮을 수 있어요. 금광기업 주식형과 레버리지·인버스 상품은 포함하지 않아요." },
];
export const ASSETS: AssetDefinition[] = ASSET_META.map((asset) => ({ ...asset, volatility: round(C.ASSET_SIGMA[asset.key], 2) }));
export const ASSET_KEYS = ASSETS.map((asset) => asset.key) as AssetKey[];
const MODEL_ORDER = C.MODEL_ORDER as readonly AssetKey[];
export const SIGMA_MAX = C.SIGMA_MAX;
export const CORRELATION_MATRIX: readonly (readonly number[])[] = C.CORRELATION;
export const GRADE_BANDS = C.GRADE_BANDS;

export const EMPTY_ALLOCATION: Allocation = { ...C.TARGET_TABLE.중립형 } as Allocation;
const BASE_TARGETS: Record<PortfolioType, Allocation> = {
  안정형: { ...C.TARGET_TABLE.안정형 } as Allocation,
  중립형: { ...C.TARGET_TABLE.중립형 } as Allocation,
  공격형: { ...C.TARGET_TABLE.공격형 } as Allocation,
};
const PROFILE_ORDER: PortfolioType[] = ["안정형", "중립형", "공격형"];
const HORIZON_ORDER: PortfolioHorizon[] = ["1년 미만", "1~3년", "3~10년", "10년 이상"];
const EPS = 5e-4; // 상수가 소수 4자리로 동결되므로 경계 판정 허용 오차

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
}
function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeAllocation(value: unknown): Allocation {
  const saved = value && typeof value === "object" ? value as Partial<Allocation> & { fund?: number } : {};
  const rawValues = ASSET_KEYS.map((key) => key === "equityFund" ? saved.equityFund ?? saved.fund : saved[key]);
  const usesLegacyPercent = rawValues.some((candidate) => finiteNumber(candidate) && candidate > 1);
  const numberOr = (candidate: unknown, fallback: number) => finiteNumber(candidate)
    ? Math.min(1, Math.max(0, candidate / (usesLegacyPercent ? 100 : 1))) : fallback;
  return {
    domestic: numberOr(saved.domestic, EMPTY_ALLOCATION.domestic),
    overseas: numberOr(saved.overseas, EMPTY_ALLOCATION.overseas),
    bond: numberOr(saved.bond, EMPTY_ALLOCATION.bond),
    equityFund: numberOr(saved.equityFund ?? saved.fund, EMPTY_ALLOCATION.equityFund),
    cash: numberOr(saved.cash, EMPTY_ALLOCATION.cash),
    gold: numberOr(saved.gold, EMPTY_ALLOCATION.gold),
  };
}

export function allocationTotal(allocation: Allocation) { return ASSET_KEYS.reduce((sum, key) => sum + allocation[key], 0); }

export function validateAllocation(allocation: unknown): allocation is Allocation {
  if (!allocation || typeof allocation !== "object" || Array.isArray(allocation)) return false;
  const row = allocation as Record<string, unknown>;
  if (Object.keys(row).some((key) => !ASSET_KEYS.includes(key as AssetKey))) return false;
  if (!ASSET_KEYS.every((key) => finiteNumber(row[key]) && row[key] >= 0 && row[key] <= 1)) return false;
  return Math.abs(ASSET_KEYS.reduce((sum, key) => sum + (row[key] as number), 0) - 1) < 1e-9;
}

export function targetFor(tendency: PortfolioTendency): Allocation {
  const profile = tendency === "진단 전" ? "중립형" : tendency;
  return { ...BASE_TARGETS[profile] };
}

// ── 기본 산식 ──────────────────────────────────────────────────────

/** σ_p = √(wᵀΣw) (%, 연환산) */
function portfolioVolatilityRaw(allocation: Allocation) {
  let variance = 0;
  MODEL_ORDER.forEach((left, i) => MODEL_ORDER.forEach((right, j) => {
    variance += allocation[left] * allocation[right] * C.COV_PCT2[i][j];
  }));
  return Math.sqrt(Math.max(0, variance));
}

/** numpy 의 linear 분위수와 같은 정의 */
function quantileLinear(sorted: number[], q: number) {
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** VaR₉₇.₅ = −quantile(R·w, 0.025) × √P × 100 (%, 연환산, 분포 가정 없음) */
function portfolioVarRaw(allocation: Allocation) {
  const w = MODEL_ORDER.map((key) => allocation[key]);
  const series = C.RETURNS.map((row) => row.reduce((sum, value, i) => sum + value * w[i], 0)).sort((a, b) => a - b);
  return Math.max(0, -quantileLinear(series, C.VAR_QUANTILE) * Math.sqrt(C.PERIODS_PER_YEAR) * 100);
}

export function riskScoreFor(allocation: Allocation) {
  if (!validateAllocation(allocation)) throw new Error("자산 비중은 0.0~1.0의 숫자이고 합계가 1.0이어야 해요.");
  return round(portfolioVolatilityRaw(allocation), 4);
}

export function riskVarFor(allocation: Allocation) {
  if (!validateAllocation(allocation)) throw new Error("자산 비중은 0.0~1.0의 숫자이고 합계가 1.0이어야 해요.");
  return round(portfolioVarRaw(allocation), 4);
}

/** VaR₉₇.₅(%) → 서비스 변동성 등급 1~6 (현행 공시 밴드 1/10/20/30/50) */
export function riskGradeFor(riskVar: number) {
  if (!finiteNumber(riskVar) || riskVar < 0) throw new Error("손실 위험(VaR)은 0 이상의 숫자여야 해요.");
  const names: Record<number, string> = { 6: "매우 낮음", 5: "낮음", 4: "보통", 3: "다소 높음", 2: "높음", 1: "매우 높음" };
  for (const grade of [6, 5, 4, 3, 2] as const) {
    if (riskVar <= C.GRADE_BANDS[String(grade) as keyof typeof C.GRADE_BANDS] + EPS) return { grade, name: names[grade] };
  }
  return { grade: 1, name: names[1] };
}

function downside6mFor(volatility: number) { return Math.expm1(-C.DOWNSIDE.z * (volatility / 100) * Math.sqrt(C.DOWNSIDE.horizonFraction)) * 100; }

export const RISK_CENTERS: Record<PortfolioType, number> = C.CENTERS as Record<PortfolioType, number>;
export const TYPE_RANGES: Record<PortfolioType, Range> = {
  안정형: C.TYPE_RANGES.안정형 as unknown as Range, 중립형: C.TYPE_RANGES.중립형 as unknown as Range, 공격형: C.TYPE_RANGES.공격형 as unknown as Range,
};
export const HORIZON_CENTERS: Record<PortfolioHorizon, number> = C.HORIZON_CENTERS as Record<PortfolioHorizon, number>;
export const HORIZON_CAPS: Record<PortfolioHorizon, number> = C.HORIZON_CAPS as Record<PortfolioHorizon, number>;
/** 기간 적합은 상한 조건이라 범위는 항상 [0, cap] */
export const HORIZON_RANGES: Record<PortfolioHorizon, Range> = Object.fromEntries(
  HORIZON_ORDER.map((horizon) => [horizon, [0, HORIZON_CAPS[horizon]] as Range]),
) as Record<PortfolioHorizon, Range>;
const HORIZON_BANDS = C.HORIZON_BANDS as Record<PortfolioHorizon, [number, number]>;

function trait(value: number, low: number, high: number): TraitLevel {
  if (value < low) return "낮음";
  if (value > high) return "높음";
  return "보통";
}

function manyWord(fit: number) { return Math.round(fit * 1000) / 1000 < C.MANY_THRESHOLD ? "많이" : "조금"; }

function typeFitFor(value: number, profile: PortfolioType) {
  const [lo, hi] = TYPE_RANGES[profile];
  const [stepLo, stepHi] = C.FIT_STEP_TYPE[profile];
  if (value >= lo - EPS && value <= hi + EPS) return { fit: 1, label: OK_TYPE_LABEL, direction: "안" as const };
  if (value > hi) {
    const fit = Math.max(0, 1 - (value - hi) / stepHi);
    return { fit, label: `성향보다 ${manyWord(fit)} 공격적이에요`, direction: "초과" as const };
  }
  const fit = Math.max(0, 1 - (lo - value) / stepLo);
  return { fit, label: `성향보다 ${manyWord(fit)} 안정적이에요`, direction: "미달" as const };
}

/** 기간은 상한 조건 — σ_p ≤ cap 이면 기준 안. 미달 방향은 없다 */
function horizonFitFor(value: number, horizon: PortfolioHorizon) {
  const cap = HORIZON_CAPS[horizon];
  const stepHi = C.FIT_STEP_HORIZON[horizon][1];
  if (value <= cap + EPS) return { fit: 1, label: OK_HORIZON_LABEL, direction: "안" as const };
  const fit = Math.max(0, 1 - (value - cap) / stepHi);
  return { fit, label: `기간에 비해 위험이 ${manyWord(fit)} 커요`, direction: "초과" as const };
}

function displayFit(fit: number) {
  // 1.0 / 0.0 은 판정값이라 반올림으로 만들어내지 않는다
  const r = round(fit, 2);
  if (r >= 1 && fit < 1) return 0.99;
  if (r <= 0 && fit > 0) return 0.01;
  return r;
}

function snapshot(allocation: Allocation): TargetSnapshot {
  const sigma = portfolioVolatilityRaw(allocation);
  const value = portfolioVarRaw(allocation);
  const grade = riskGradeFor(value);
  return { allocation: { ...allocation }, riskScore: round(sigma, 4), riskVar: round(value, 4), riskGrade: grade.grade, riskGradeName: grade.name, riskLevel: round(sigma / SIGMA_MAX, 4), downside6m: round(downside6mFor(sigma), 2) };
}

// ── 가까운 목표 탐색 ──────────────────────────────────────────────

type Candidate = { allocation: Allocation; risk: number };
const gridCache = new Map<number, Candidate[]>();
const GRID_UNITS = Math.round(1 / C.NEAR_TARGET.gridStep);
function maskFor(keys: AssetKey[]) { return keys.reduce((mask, key) => mask | (1 << ASSET_KEYS.indexOf(key)), 0); }
function gridForMask(mask: number) {
  const cached = gridCache.get(mask);
  if (cached) return cached;
  const rows: Candidate[] = [];
  const units = Array<number>(ASSET_KEYS.length).fill(0);
  const walk = (index: number, remaining: number) => {
    if (index === ASSET_KEYS.length - 1) {
      if (!(mask & (1 << index)) && remaining !== 0) return;
      units[index] = remaining;
      const allocation = Object.fromEntries(ASSET_KEYS.map((key, i) => [key, units[i] / GRID_UNITS])) as Allocation;
      rows.push({ allocation, risk: portfolioVolatilityRaw(allocation) });
      return;
    }
    if (!(mask & (1 << index))) { units[index] = 0; walk(index + 1, remaining); return; }
    for (let value = 0; value <= remaining; value += 1) { units[index] = value; walk(index + 1, remaining - value); }
  };
  walk(0, GRID_UNITS);
  gridCache.set(mask, rows);
  return rows;
}
function candidatesInRange(rows: Candidate[], range: Range) { return rows.filter((candidate) => candidate.risk >= range[0] - EPS && candidate.risk <= range[1] + EPS); }
function compareTuple(left: Allocation, right: Allocation) {
  for (const key of MODEL_ORDER) { const difference = left[key] - right[key]; if (Math.abs(difference) > 1e-12) return difference; }
  return 0;
}
function bestCandidate(candidates: Candidate[], current: Allocation, center: number) {
  const held = new Set(ASSET_KEYS.filter((key) => current[key] > 1e-12));
  return [...candidates].sort((left, right) => {
    const leftL1 = ASSET_KEYS.reduce((sum, key) => sum + Math.abs(left.allocation[key] - current[key]), 0);
    const rightL1 = ASSET_KEYS.reduce((sum, key) => sum + Math.abs(right.allocation[key] - current[key]), 0);
    const leftAdded = ASSET_KEYS.filter((key) => left.allocation[key] > 0 && !held.has(key)).length;
    const rightAdded = ASSET_KEYS.filter((key) => right.allocation[key] > 0 && !held.has(key)).length;
    return Math.round((leftL1 - rightL1) * 1e6) || leftAdded - rightAdded || Math.abs(left.risk - center) - Math.abs(right.risk - center) || compareTuple(left.allocation, right.allocation);
  })[0];
}

/** 목표 범위 I. 성향 하한 ≥ 기간 상한이면 충돌 → 기간 밴드 (horizon_capped) */
export function targetInterval(profile: PortfolioType, horizon: PortfolioHorizon): { range: Range; basis: "recommended" | "horizon_capped" } {
  const [lo, hi] = TYPE_RANGES[profile];
  const cap = HORIZON_CAPS[horizon];
  if (lo >= cap - EPS) return { range: [HORIZON_BANDS[horizon][0], HORIZON_BANDS[horizon][1]], basis: "horizon_capped" };
  return { range: [lo, Math.min(hi, cap)], basis: "recommended" };
}

function recommendationFor(current: Allocation, currentRisk: number, profile: PortfolioType, horizon: PortfolioHorizon) {
  const [lo, hi] = TYPE_RANGES[profile];
  const cap = HORIZON_CAPS[horizon];
  const inType = currentRisk >= lo - EPS && currentRisk <= hi + EPS;
  const inHorizon = currentRisk <= cap + EPS;
  const { range, basis } = targetInterval(profile, horizon);
  if (inType && inHorizon) return { status: "hold" as const, allocation: current, range };
  if (basis === "horizon_capped" && currentRisk >= range[0] - EPS && currentRisk <= range[1] + EPS) return { status: "horizon_capped" as const, allocation: current, range, unchanged: true };
  const held = ASSET_KEYS.filter((key) => current[key] > 1e-12);
  const masks: number[] = [];
  for (const addition of [null, ...C.NEAR_TARGET.extraOrder] as (AssetKey | null)[]) {
    const keys = addition && !held.includes(addition) ? [...held, addition] : held;
    const mask = maskFor(keys);
    if (!masks.includes(mask)) masks.push(mask);
  }
  const center = (range[0] + range[1]) / 2;
  for (const mask of masks) {
    const outer = candidatesInRange(gridForMask(mask), range);
    if (!outer.length) continue;
    const inset = (range[1] - range[0]) * C.NEAR_TARGET.margin;
    const inner: Range = [range[0] + inset, range[1] - inset];
    const preferred = inner[0] <= inner[1] ? outer.filter((candidate) => candidate.risk >= inner[0] && candidate.risk <= inner[1]) : [];
    return { status: basis, allocation: bestCandidate(preferred.length ? preferred : outer, current, center).allocation, range };
  }
  return { status: "no_feasible_target" as const, allocation: null, range };
}

// ── 특성·신호 ──────────────────────────────────────────────────────

function allocationMetrics(allocation: Allocation) { return { growth: allocation.domestic + allocation.overseas + allocation.equityFund, defense: allocation.bond + allocation.cash, cash: allocation.cash }; }
const TH = {
  growth: [C.CHARACTERISTIC_THRESHOLDS.성장성[0] / 100, C.CHARACTERISTIC_THRESHOLDS.성장성[1] / 100],
  defense: [C.CHARACTERISTIC_THRESHOLDS.방어력[0] / 100, C.CHARACTERISTIC_THRESHOLDS.방어력[1] / 100],
  cash: [C.CHARACTERISTIC_THRESHOLDS.유동성[0] / 100, C.CHARACTERISTIC_THRESHOLDS.유동성[1] / 100],
} as const;
// 번호는 파이썬 엔진과 같다: 1 성장 높음 · 2 성장 낮음 · 3 방어 낮음 · 4 방어 높음 · 5 현금 높음 · 6 현금 낮음
function allocationSignalIds(allocation: Allocation) {
  const m = allocationMetrics(allocation);
  const ids: number[] = [];
  if (m.growth > TH.growth[1]) ids.push(1);
  if (m.growth < TH.growth[0]) ids.push(2);
  if (m.defense < TH.defense[0]) ids.push(3);
  if (m.defense > TH.defense[1]) ids.push(4);
  if (m.cash > TH.cash[1]) ids.push(5);
  if (m.cash < TH.cash[0]) ids.push(6);
  return ids;
}
const pct = (v: number) => `${round(v * 100, 1)}%`;
const SIGNAL_META: Record<number, { metric: "growth" | "defense" | "cash"; direction: "low" | "high"; text: string }> = {
  1: { metric: "growth", direction: "high", text: `성장자산 비중이 ${pct(TH.growth[1])}보다 높아 성장성과 변동성이 모두 높은 구조예요.` },
  2: { metric: "growth", direction: "low", text: `성장자산 비중이 ${pct(TH.growth[0])}보다 낮아 장기 성장성이 제한될 수 있어요.` },
  3: { metric: "defense", direction: "low", text: `방어자산(채권+현금) 비중이 ${pct(TH.defense[0])}보다 낮아요.` },
  4: { metric: "defense", direction: "high", text: `방어자산 비중이 ${pct(TH.defense[1])}보다 높아 하락장 방어력은 좋지만 성장성이 제한될 수 있어요.` },
  5: { metric: "cash", direction: "high", text: `현금성자산 비중이 ${pct(TH.cash[1])}보다 높아 유동성은 좋지만 성장성이 제한될 수 있어요.` },
  6: { metric: "cash", direction: "low", text: `현금성자산 비중이 ${pct(TH.cash[0])}보다 낮아 갑작스러운 자금 필요에 대응하기 어려울 수 있어요.` },
};
function signalKind(id: number, current: Allocation, baseTarget: Allocation): SignalKind {
  if (!allocationSignalIds(baseTarget).includes(id)) return "caution";
  const meta = SIGNAL_META[id];
  const currentValue = allocationMetrics(current)[meta.metric];
  const targetValue = allocationMetrics(baseTarget)[meta.metric];
  return (meta.direction === "high" ? currentValue > targetValue : currentValue < targetValue) ? "caution" : "structural";
}

// ── 분산효과 ──────────────────────────────────────────────────────

function diversificationFor(allocation: Allocation, sigma: number, value: number) {
  const held = ASSET_KEYS.filter((key) => allocation[key] > 1e-12).length;
  const budget = ASSET_KEYS.reduce((sum, key) => sum + allocation[key] * Math.sqrt(C.COV_PCT2[MODEL_ORDER.indexOf(key)][MODEL_ORDER.indexOf(key)]), 0);
  const eps = C.DIVERSIFICATION.epsilon;
  if (!finiteNumber(budget) || !finiteNumber(sigma)) return { status: "invalid" as const, reduction: null, gradeDrop: 0, held };
  if (budget <= eps) return { status: "zero_reference" as const, reduction: null, gradeDrop: 0, held };
  let reduction = held <= 1 ? 0 : 1 - sigma / budget;
  if (Math.abs(reduction) <= eps) reduction = 0;
  else if (reduction > 1 && reduction <= 1 + eps) reduction = 1;
  else if (reduction < -eps || reduction > 1 + eps) return { status: "invalid" as const, reduction: null, gradeDrop: 0, held };
  // 완전 양의 상관 가정의 VaR = 자산별 VaR 가중합. 등급 번호는 위험이 낮을수록 크다 → 하락 폭 = 실제 등급 − 가정 등급
  const varBudget = ASSET_KEYS.reduce((sum, key) => sum + allocation[key] * C.ASSET_VAR[key], 0);
  const gradeDrop = held >= 2 ? Math.max(0, riskGradeFor(value).grade - riskGradeFor(varBudget).grade) : 0;
  return { status: "valid" as const, reduction, gradeDrop, held };
}

const UNLOCK_TAG_BY_ASSET = C.UNLOCK_TAGS as Record<AssetKey, string[]>;
const STATUS_COACH: Record<RecommendationStatus, string> = {
  hold: "성향과 기간 기준 범위에 모두 들어와 지금 비중을 유지해도 좋아요.",
  recommended: "성향 범위와 기간 상한이 겹치는 범위 안에서 5% 단위의 가까운 학습용 배분을 찾아봤어요.",
  horizon_capped: "입력한 투자기간이 성향보다 낮은 위험을 요구해서, 기간 기준을 우선한 배분이에요. 기간이 길어지면 성향 기준으로 다시 볼 수 있어요.",
  no_feasible_target: "현재 보유 자산과 한 종류 추가 조건으로는 5% 단위 조정안을 찾지 못했어요.",
};

export function analyzeAllocation(current: Allocation, tendency: PortfolioTendency, horizon: string): PortfolioResult {
  if (!validateAllocation(current)) throw new Error("자산 비중은 0.0~1.0의 숫자이고 합계가 1.0이어야 해요.");
  if (!(horizon in HORIZON_CAPS)) throw new Error("지원하지 않는 투자 기간이에요.");
  const profile: PortfolioType = tendency === "진단 전" ? "중립형" : tendency;
  const typedHorizon = horizon as PortfolioHorizon;
  const sigma = portfolioVolatilityRaw(current);
  const value = portfolioVarRaw(current);
  const grade = riskGradeFor(value);
  const profileRange = TYPE_RANGES[profile];
  const horizonRange = HORIZON_RANGES[typedHorizon];
  const typeFit = typeFitFor(sigma, profile);
  const periodFit = horizonFitFor(sigma, typedHorizon);
  const div = diversificationFor(current, sigma, value);

  const strengthAxes: StrengthAxis[] = [];
  if (typeFit.direction === "안") strengthAxes.push({ axis: "type_fit", sentence: `연환산 변동성 ${round(sigma, 2)}%가 ${profile} 기준 범위 ${round(profileRange[0], 2)}~${round(profileRange[1], 2)}% 안에 들어와 성향과 잘 맞아요.` });
  if (div.status === "valid" && div.held >= 2 && div.gradeDrop >= C.DIVERSIFICATION.minGradeDrop) {
    const from = riskGradeFor(ASSET_KEYS.reduce((sum, key) => sum + current[key] * C.ASSET_VAR[key], 0));
    strengthAxes.push({ axis: "diversification", sentence: `자산을 섞은 효과로 위험이 ${from.grade}등급(${from.name})에서 ${grade.grade}등급(${grade.name})으로 ${div.gradeDrop}단계 낮아져 있어요.` });
  }
  if (periodFit.direction === "안") strengthAxes.push({ axis: "horizon_fit", sentence: `연환산 변동성 ${round(sigma, 2)}%가 ${typedHorizon} 투자기간이 허용하는 상한 ${round(HORIZON_CAPS[typedHorizon], 2)}% 안이라 기간 기준에 맞아요.` });

  const baseTarget = BASE_TARGETS[profile];
  const signals = allocationSignalIds(current).map((id) => ({ id, kind: signalKind(id, current, baseTarget), text: SIGNAL_META[id].text }));
  const cautions = [
    ...(typeFit.direction !== "안" ? [`연환산 변동성 ${round(sigma, 2)}%는 ${profile} 기준 범위 ${round(profileRange[0], 2)}~${round(profileRange[1], 2)}% 밖이라 ${typeFit.label}.`] : []),
    ...(periodFit.direction !== "안" ? [`${typedHorizon} 투자기간이 허용하는 위험 상한은 ${round(HORIZON_CAPS[typedHorizon], 2)}%인데 지금은 ${round(sigma, 2)}%라 ${periodFit.label}.`] : []),
    ...signals.filter((signal) => signal.kind === "caution").map((signal) => signal.text),
  ];

  const recommendation = recommendationFor(current, sigma, profile, typedHorizon);
  const nearTarget = recommendation.allocation ? snapshot(recommendation.allocation) : null;
  const unchanged = recommendation.status === "hold" || ("unchanged" in recommendation && recommendation.unchanged);
  const allDeltas = nearTarget && !unchanged ? ASSET_KEYS.map((asset) => ({ asset, delta: round((nearTarget.allocation[asset] - current[asset]) * 100, 1) })) : [];
  const rebalancingActions = allDeltas.filter((item) => Math.abs(item.delta) >= C.REBALANCE_MIN_DELTA * 100 - 1e-9).map((item) => ({ ...item, action: (item.delta > 0 ? "확대" : "축소") as "확대" | "축소" }));
  const residualItems = allDeltas.filter((item) => Math.abs(item.delta) >= C.RESIDUAL_MIN_DELTA * 100 && Math.abs(item.delta) < C.REBALANCE_MIN_DELTA * 100);
  const unlockTags = nearTarget && !unchanged
    ? ASSET_KEYS.filter((key) => current[key] <= 1e-12 && nearTarget.allocation[key] > 0).flatMap((key) => UNLOCK_TAG_BY_ASSET[key]).filter((tag, i, all) => all.indexOf(tag) === i)
    : [];
  const metrics = allocationMetrics(current);
  return {
    ruleVersion: PORTFOLIO_RULE_VERSION, modelStatus: PORTFOLIO_MODEL_STATUS, sigmaAsof: PORTFOLIO_SIGMA_ASOF,
    riskScore: round(sigma, 4), riskVar: round(value, 4), riskGrade: grade.grade, riskGradeName: grade.name,
    riskLevel: round(sigma / SIGMA_MAX, 4), downside6m: round(downside6mFor(sigma), 2),
    fit: displayFit(typeFit.fit), horizonFit: displayFit(periodFit.fit), typeFitLabel: typeFit.label, horizonFitLabel: periodFit.label,
    profileRange, horizonRange, horizonCap: round(HORIZON_CAPS[typedHorizon], 4), profileCenter: round(RISK_CENTERS[profile], 4), horizonCenter: round(HORIZON_CENTERS[typedHorizon], 4),
    diversificationReduction: div.reduction === null ? null : round(div.reduction, 4), diversificationStatus: div.status, diversificationGradeDrop: div.gradeDrop,
    characteristics: { growth: trait(metrics.growth, TH.growth[0], TH.growth[1]), defense: trait(metrics.defense, TH.defense[0], TH.defense[1]), liquidity: trait(metrics.cash, TH.cash[0], TH.cash[1]) },
    recommendationStatus: recommendation.status, nearTarget, baseTarget: snapshot(baseTarget), rebalancingActions, residualItems, signals,
    strengthAxes, strengths: strengthAxes.map((axis) => axis.sentence), cautions, unlockTags, coach: STATUS_COACH[recommendation.status],
  };
}
