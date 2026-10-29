import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSETS,
  CORRELATION_MATRIX,
  GRADE_BANDS,
  HORIZON_CAPS,
  HORIZON_CENTERS,
  HORIZON_RANGES,
  OK_HORIZON_LABEL,
  OK_TYPE_LABEL,
  PORTFOLIO_RULE_VERSION,
  RISK_CENTERS,
  SIGMA_MAX,
  TYPE_RANGES,
  allocationTotal,
  analyzeAllocation,
  normalizeAllocation,
  riskGradeFor,
  riskScoreFor,
  riskVarFor,
  targetFor,
  targetInterval,
  validateAllocation,
} from "../app/portfolio-rules.ts";
import * as C from "../app/portfolio-rules.constants.ts";

const single = (key) => ({ domestic: 0, overseas: 0, bond: 0, equityFund: 0, cash: 0, gold: 0, [key]: 1 });
const MATCHED = { 안정형: "1~3년", 중립형: "3~10년", 공격형: "10년 이상" };

test("v12 reads the six assets and matrices from the generated constants file", () => {
  assert.deepEqual(ASSETS.map((asset) => asset.label), ["국내주식", "해외주식", "채권", "주식형 ETF·펀드", "현금성자산", "금"]);
  for (const asset of ASSETS) assert.ok(Math.abs(asset.volatility - C.ASSET_SIGMA[asset.key]) < 0.006);
  assert.equal(SIGMA_MAX, C.SIGMA_MAX);
  assert.equal(CORRELATION_MATRIX.length, 6);
  assert.ok(CORRELATION_MATRIX.every((row) => row.length === 6));
  assert.equal(C.RETURNS.length, C.N_OBS);
  assert.ok(C.RETURNS.every((row) => row.length === 6));
  for (const asset of ASSETS) {
    assert.ok(Math.abs(riskScoreFor(single(asset.key)) - C.ASSET_SIGMA[asset.key]) < 1e-3);
    assert.ok(Math.abs(riskVarFor(single(asset.key)) - C.ASSET_VAR[asset.key]) < 1e-3, `${asset.key} VaR 가 상수와 다름`);
  }
});

test("profile centers are the target-table sigma and boundaries are midpoints", () => {
  for (const profile of ["안정형", "중립형", "공격형"]) {
    const target = targetFor(profile);
    assert.equal(validateAllocation(target), true);
    assert.ok(Math.abs(allocationTotal(target) - 1) < 1e-9);
    assert.ok(Math.abs(riskScoreFor(target) - RISK_CENTERS[profile]) < 1e-3);
  }
  assert.ok(Math.abs((RISK_CENTERS.안정형 + RISK_CENTERS.중립형) / 2 - TYPE_RANGES.안정형[1]) < 1e-3);
  assert.ok(Math.abs((RISK_CENTERS.중립형 + RISK_CENTERS.공격형) / 2 - TYPE_RANGES.중립형[1]) < 1e-3);
  assert.equal(TYPE_RANGES.안정형[0], 0);
  assert.ok(Math.abs(TYPE_RANGES.공격형[1] - riskScoreFor(single("equityFund"))) < 1e-3);
  assert.deepEqual(Object.keys(HORIZON_RANGES), ["1년 미만", "1~3년", "3~10년", "10년 이상"]);
  for (const horizon of Object.keys(HORIZON_RANGES)) assert.deepEqual(HORIZON_RANGES[horizon], [0, HORIZON_CAPS[horizon]]);
  assert.ok(Math.abs(HORIZON_CAPS["1년 미만"] - (HORIZON_CENTERS["1년 미만"] + RISK_CENTERS.안정형) / 2) < 1e-3);
  assert.ok(Math.abs(HORIZON_CAPS["1~3년"] - TYPE_RANGES.안정형[1]) < 1e-6);
  assert.ok(Math.abs(HORIZON_CAPS["3~10년"] - TYPE_RANGES.중립형[1]) < 1e-6);
  assert.ok(Math.abs(HORIZON_CAPS["10년 이상"] - TYPE_RANGES.공격형[1]) < 1e-6);
});

test("grade uses the current Korean fund risk-grade VaR bands 1/10/20/30/50", () => {
  assert.deepEqual(GRADE_BANDS, { 6: 1, 5: 10, 4: 20, 3: 30, 2: 50 });
  assert.deepEqual(riskGradeFor(1), { grade: 6, name: "매우낮은위험" });
  assert.deepEqual(riskGradeFor(1.01), { grade: 5, name: "낮은위험" });
  assert.equal(riskGradeFor(10).grade, 5);
  assert.equal(riskGradeFor(20).grade, 4);
  assert.equal(riskGradeFor(30).grade, 3);
  assert.equal(riskGradeFor(50).grade, 2);
  assert.equal(riskGradeFor(50.01).grade, 1);
  // 단일 자산군의 등급은 그 자산 VaR 의 등급
  const result = analyzeAllocation(single("cash"), "안정형", "1년 미만");
  assert.equal(result.riskGrade, riskGradeFor(C.ASSET_VAR.cash).grade);
});

test("invalid, non-finite and non-normalized allocations are rejected", () => {
  assert.equal(validateAllocation({ ...single("cash"), cash: 1.01 }), false);
  assert.equal(validateAllocation({ ...single("cash"), cash: Number.NaN }), false);
  assert.equal(validateAllocation({ ...single("cash"), cash: true }), false);
  assert.equal(validateAllocation({ ...single("cash"), extra: 0 }), false);
  assert.throws(() => riskScoreFor({ ...single("cash"), cash: 1.01 }));
  assert.throws(() => analyzeAllocation(single("cash"), "중립형", "5~10년"));
});

test("three independent axes, three strengths on a matched target table", () => {
  for (const profile of ["안정형", "중립형", "공격형"]) {
    const result = analyzeAllocation(targetFor(profile), profile, MATCHED[profile]);
    assert.equal("score" in result, false);
    assert.equal(result.fit, 1);
    assert.equal(result.horizonFit, 1);
    assert.equal(result.typeFitLabel, OK_TYPE_LABEL);
    assert.equal(result.horizonFitLabel, OK_HORIZON_LABEL);
    assert.equal(result.recommendationStatus, "hold");
    assert.deepEqual(result.strengthAxes.map((item) => item.axis), ["type_fit", "diversification", "horizon_fit"]);
    assert.ok(result.diversificationGradeDrop >= 1);
    assert.match(result.strengths[1], /등급.*에서.*등급.*낮아져/);
    assert.deepEqual(result.rebalancingActions, []);
    assert.equal(result.signals.filter((signal) => signal.kind === "caution").length, 0);
  }
});

test("horizon is a cap: no 'too low' verdict, long horizons never block a low-risk portfolio", () => {
  for (const horizon of ["1년 미만", "1~3년", "3~10년", "10년 이상"]) {
    const result = analyzeAllocation(single("cash"), "안정형", horizon);
    assert.equal(result.horizonFitLabel, OK_HORIZON_LABEL);
    assert.equal(result.horizonFit, 1);
    assert.ok(!/작아요/.test(result.horizonFitLabel));
  }
  const stable = analyzeAllocation(targetFor("안정형"), "안정형", "10년 이상");
  assert.equal(stable.recommendationStatus, "hold");
  assert.equal(stable.strengthAxes.some((item) => item.axis === "horizon_fit"), true);
});

test("diversification strength requires a grade drop, not merely a positive reduction", () => {
  const tiny = analyzeAllocation({ ...single("domestic"), domestic: 0.95, cash: 0.05 }, "공격형", "10년 이상");
  assert.ok(tiny.diversificationReduction > 0);
  assert.equal(tiny.diversificationGradeDrop, 0);
  assert.equal(tiny.strengthAxes.some((item) => item.axis === "diversification"), false);
  const etf = analyzeAllocation(single("equityFund"), "공격형", "10년 이상");
  assert.equal(etf.recommendationStatus, "hold");
  assert.equal(etf.diversificationReduction, 0);
  assert.equal(etf.strengthAxes.some((item) => item.axis === "diversification"), false);
});

test("conflicting profile and horizon is capped by the horizon, never held back", () => {
  const capped = [["중립형", "1년 미만"], ["중립형", "1~3년"], ["공격형", "1년 미만"], ["공격형", "1~3년"], ["공격형", "3~10년"]];
  for (const [profile, horizon] of capped) {
    assert.equal(targetInterval(profile, horizon).basis, "horizon_capped");
    const result = analyzeAllocation(targetFor(profile), profile, horizon);
    assert.equal(result.recommendationStatus, "horizon_capped");
    assert.ok(result.nearTarget, "capped 상태에서도 가까운 목표가 있어야 한다");
    const [lo, hi] = C.HORIZON_BANDS[horizon];
    assert.ok(result.nearTarget.riskScore >= lo - 0.01 && result.nearTarget.riskScore <= hi + 0.01);
    assert.equal(result.typeFitLabel, OK_TYPE_LABEL);
    assert.match(result.horizonFitLabel, /커요/);
    assert.match(result.coach, /기간 기준을 우선/);
  }
  const gold = analyzeAllocation(single("gold"), "중립형", "1년 미만");
  assert.equal(gold.recommendationStatus, "horizon_capped");
  assert.ok(gold.nearTarget && gold.rebalancingActions.length > 0);
});

test("recommended status moves into profile range ∩ horizon cap with at most one added asset", () => {
  const recommended = analyzeAllocation(single("domestic"), "안정형", "1~3년");
  assert.equal(recommended.recommendationStatus, "recommended");
  assert.ok(recommended.nearTarget);
  assert.ok(recommended.nearTarget.riskScore >= TYPE_RANGES.안정형[0] - 0.01 && recommended.nearTarget.riskScore <= Math.min(TYPE_RANGES.안정형[1], HORIZON_CAPS["1~3년"]) + 0.01);
  assert.ok(recommended.rebalancingActions.every((item) => Math.abs(item.delta) >= 5));
  const added = Object.keys(recommended.nearTarget.allocation).filter((key) => recommended.nearTarget.allocation[key] > 0 && key !== "domestic");
  assert.ok(added.length <= 1);
  // 성향 안 · 기간 초과 → 기간 상한 아래로 조정
  const over = analyzeAllocation(targetFor("안정형"), "안정형", "1년 미만");
  assert.equal(over.recommendationStatus, "recommended");
  assert.equal(over.typeFitLabel, OK_TYPE_LABEL);
  assert.match(over.horizonFitLabel, /조금 커요/);
  assert.ok(over.nearTarget.riskScore <= HORIZON_CAPS["1년 미만"] + 0.01);
});

test("every profile × horizon cell yields hold, recommended or horizon_capped", () => {
  for (const profile of ["안정형", "중립형", "공격형"]) {
    for (const horizon of ["1년 미만", "1~3년", "3~10년", "10년 이상"]) {
      for (const allocation of [single("domestic"), single("cash"), single("gold"), targetFor(profile)]) {
        const result = analyzeAllocation(allocation, profile, horizon);
        assert.ok(["hold", "recommended", "horizon_capped"].includes(result.recommendationStatus), `${profile}·${horizon} → ${result.recommendationStatus}`);
        assert.ok(result.nearTarget);
      }
    }
  }
});

test("legacy fund allocation migrates and the new rule version invalidates old results", () => {
  const migrated = normalizeAllocation({ domestic: 10, overseas: 20, bond: 30, fund: 20, cash: 10, gold: 10 });
  assert.equal(migrated.equityFund, 0.2);
  assert.equal(allocationTotal(migrated), 1);
  assert.match(PORTFOLIO_RULE_VERSION, /^5\.1\.0-portfolio-v12/);
});

test("rebalancing actions are sorted by |delta| desc, then asset σ desc", () => {
  const capped = analyzeAllocation(targetFor("공격형"), "공격형", "1~3년");
  const sizes = capped.rebalancingActions.map((item) => Math.abs(item.delta));
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  // 금 100% → 금 10 / 현금 90: 크기가 같으면 σ 가 큰 금이 먼저
  const gold = analyzeAllocation(single("gold"), "중립형", "1년 미만");
  assert.deepEqual(gold.rebalancingActions.map((item) => item.asset), ["gold", "cash"]);
});

test("distance to range, grade sentence and fixed strength sentences follow the spec", () => {
  const p01 = analyzeAllocation({ ...single("domestic"), domestic: 0.55, equityFund: 0.15, cash: 0.3 }, "안정형", "3~10년");
  assert.ok(Math.abs(p01.distanceToRange - (p01.riskScore - TYPE_RANGES.안정형[1])) < 0.01);
  const matched = analyzeAllocation(targetFor("중립형"), "중립형", "3~10년");
  assert.equal(matched.distanceToRange, 0);
  assert.equal(matched.riskGradeSentence, `연간 손실 위험(VaR) ${GRADE_BANDS[matched.riskGrade]}% 이하 구간이에요`);
  assert.equal(analyzeAllocation(single("domestic"), "공격형", "10년 이상").riskGradeSentence, "연간 손실 위험(VaR) 50% 초과 구간이에요");
  assert.equal(matched.strengths[0], "현재 배분의 위험 수준이 진단된 성향에 대해 설정한 기준 범위에 들어와 있어요.");
  assert.equal(matched.strengths[2], "현재 배분의 위험 수준이 입력한 투자기간이 허용하는 범위 안에 있어요.");
  assert.ok(matched.strengths[1].startsWith(`자산을 섞은 효과로 위험이 ${matched.diversificationBaseGrade}등급`));
  assert.equal(matched.baseTarget.horizonFitLabel, OK_HORIZON_LABEL);
});

test("unlock tags include assets new in the near target or the base target", () => {
  // 현금 100% 공격형 → 가까운 목표에 ETF, 기준 목표에 주식·채권·금이 새로 등장
  const cash = analyzeAllocation(single("cash"), "공격형", "10년 이상");
  assert.deepEqual(cash.unlockTags.slice(0, 2), ["ETF의 개념", "인덱스 ETF 분산효과"]);
  assert.ok(cash.unlockTags.includes("채권의 개념"));
  // hold 여도 기준 목표에 새로 등장하는 자산군의 태그는 붙는다
  const etf = analyzeAllocation(single("equityFund"), "공격형", "10년 이상");
  assert.equal(etf.recommendationStatus, "hold");
  assert.ok(etf.unlockTags.includes("채권의 개념"));
});
