import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSETS, HORIZON_CAPS, OK_HORIZON_LABEL, OK_TYPE_LABEL, SIGMA_MAX, TYPE_RANGES,
  allocationTotal, analyzeAllocation, riskGradeFor, riskVarFor, validateAllocation,
} from "../app/portfolio-rules.ts";
import * as C from "../app/portfolio-rules.constants.ts";

const PROFILES = ["안정형", "중립형", "공격형"];
const HORIZONS = ["1년 미만", "1~3년", "3~10년", "10년 이상"];
const ORDER = ["type_fit", "diversification", "horizon_fit"];
const EPS = 5e-4;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomAllocation(random) {
  const cuts = Array.from({ length: 5 }, () => Math.floor(random() * 101)).sort((a, b) => a - b);
  const values = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], cuts[3] - cuts[2], cuts[4] - cuts[3], 100 - cuts[4]];
  return { domestic: values[0] / 100, overseas: values[1] / 100, bond: values[2] / 100, equityFund: values[3] / 100, cash: values[4] / 100, gold: values[5] / 100 };
}

test("1,500 randomized portfolios preserve v12 calculation invariants", () => {
  const random = randomGenerator(20261003);
  for (let index = 0; index < 1_500; index += 1) {
    const allocation = randomAllocation(random);
    const profile = PROFILES[index % PROFILES.length];
    const horizon = HORIZONS[index % HORIZONS.length];
    assert.equal(validateAllocation(allocation), true);
    const result = analyzeAllocation(allocation, profile, horizon);

    assert.ok(result.riskScore >= 0 && result.riskScore <= SIGMA_MAX + 1e-3);
    assert.ok(result.riskVar >= 0);
    assert.equal(result.riskGrade, riskGradeFor(riskVarFor(allocation)).grade);
    assert.ok(result.riskLevel >= 0 && result.riskLevel <= 1);
    assert.ok(result.fit >= 0 && result.fit <= 1);
    assert.ok(result.horizonFit >= 0 && result.horizonFit <= 1);
    assert.ok(result.riskGrade >= 1 && result.riskGrade <= 6);
    assert.ok(result.downside6m <= 0 && result.downside6m > -100);
    assert.equal("score" in result, false);

    const inType = result.riskScore >= TYPE_RANGES[profile][0] - EPS && result.riskScore <= TYPE_RANGES[profile][1] + EPS;
    const inHorizon = result.riskScore <= HORIZON_CAPS[horizon] + EPS;
    assert.equal(result.typeFitLabel === OK_TYPE_LABEL, inType);
    assert.equal(result.horizonFitLabel === OK_HORIZON_LABEL, inHorizon);
    assert.equal(result.fit === 1, inType);
    assert.equal(result.horizonFit === 1, inHorizon);
    assert.ok(!/작아요/.test(result.horizonFitLabel));

    const axes = result.strengthAxes.map((item) => item.axis);
    assert.deepEqual(axes, ORDER.filter((axis) => axes.includes(axis)));
    assert.equal(axes.includes("type_fit"), inType);
    assert.equal(axes.includes("horizon_fit"), inHorizon);
    const held = ASSETS.filter((asset) => allocation[asset.key] > 0).length;
    assert.equal(axes.includes("diversification"), held >= 2 && result.diversificationStatus === "valid" && result.diversificationGradeDrop >= 1);
    if (held === 1) assert.equal(result.diversificationReduction, 0);
    if (result.diversificationReduction !== null) assert.ok(result.diversificationReduction >= 0 && result.diversificationReduction <= 1);

    assert.ok(["hold", "recommended", "horizon_capped"].includes(result.recommendationStatus), result.recommendationStatus);
    assert.ok(result.nearTarget);
    assert.ok(Math.abs(allocationTotal(result.nearTarget.allocation) - 1) < 1e-9);
    const extra = ASSETS.filter((asset) => result.nearTarget.allocation[asset.key] > 0 && allocation[asset.key] <= 0).length;
    assert.ok(extra <= 1);
    if (result.recommendationStatus === "hold") {
      assert.ok(inType && inHorizon);
      assert.deepEqual(result.rebalancingActions, []);
    }
    if (result.recommendationStatus === "recommended") {
      const hi = Math.min(TYPE_RANGES[profile][1], HORIZON_CAPS[horizon]);
      assert.ok(result.nearTarget.riskScore >= TYPE_RANGES[profile][0] - 0.01 && result.nearTarget.riskScore <= hi + 0.01);
    }
    if (result.recommendationStatus === "horizon_capped") {
      assert.ok(TYPE_RANGES[profile][0] >= HORIZON_CAPS[horizon] - EPS, "capped 는 성향 하한 ≥ 기간 상한일 때만");
      const [lo, hi] = C.HORIZON_BANDS[horizon];
      assert.ok(result.nearTarget.riskScore >= lo - 0.01 && result.nearTarget.riskScore <= hi + 0.01);
    }
    for (const item of result.rebalancingActions) assert.ok(Math.abs(item.delta) >= 5);
    for (const item of result.residualItems) assert.ok(Math.abs(item.delta) > 0 && Math.abs(item.delta) < 5);
    for (const signal of result.signals) assert.ok(["structural", "caution"].includes(signal.kind) && signal.id >= 1 && signal.id <= 6);
  }
});
