import assert from "node:assert/strict";
import test from "node:test";
import {
  assessConfiguredEligibility,
  assessEligibility,
} from "../lib/eligibility";

test("pre-reform income at the examination floor requires no statutory scrutiny", () => {
  const result = assessEligibility("2026-09-29", 25_000, 100_000);
  assert.equal(result.scrutiny, "NONE");
});

test("pre-reform income above the floor permits independent examination", () => {
  const result = assessEligibility("2026-09-29", 25_001, 100_000);
  assert.equal(result.scrutiny, "INDEPENDENT_EXAMINATION");
  assert.equal(result.qualifiedExaminerRequired, false);
});

test("pre-reform income above the qualification floor requires a qualified examiner", () => {
  assert.equal(
    assessEligibility("2026-09-29", 250_001, 100_000).qualifiedExaminerRequired,
    true,
  );
});

test("pre-reform audit threshold routes to audit", () => {
  assert.equal(
    assessEligibility("2026-09-29", 1_000_001, 100_000).scrutiny,
    "AUDIT",
  );
});

test("revised thresholds apply from 30 September 2026", () => {
  const result = assessEligibility("2026-09-30", 40_000, 100_000);
  assert.equal(result.scrutiny, "NONE");
  assert.equal(result.thresholds.auditIncome, 1_500_000);
});

test("an overriding audit requirement always routes to audit", () => {
  assert.equal(
    assessEligibility("2026-09-30", 100_000, 100_000, { funderAudit: true })
      .scrutiny,
    "AUDIT",
  );
});

test("Scottish 2026 rules use the accounting period start and require scrutiny", () => {
  const result = assessConfiguredEligibility("2026-06-30", 10_000, 20_000, {
    version: "OSCR-2006.2026",
    effectiveFrom: "2026-01-01",
    effectiveDateBasis: "PERIOD_START",
    periodStart: "2026-01-01",
    examinationFloor: 0,
    qualificationFloor: 250_000,
    qualificationFloorInclusive: true,
    auditIncome: 1_000_000,
    auditIncomeInclusive: true,
    assetIncomeFloor: 0,
    auditAssets: 3_260_000,
    allCharitiesScrutinised: true,
    assetTestBasis: "ACCRUALS_ASSETS",
    accountingBasis: "Receipts and payments",
    jurisdictionName: "Scotland",
  });
  assert.equal(result.scrutiny, "INDEPENDENT_EXAMINATION");
  assert.match(result.framework, /periods starting/);
});

test("Northern Ireland configuration routes all registered charities to scrutiny", () => {
  const result = assessConfiguredEligibility("2026-03-31", 5_000, 1_000, {
    version: "CCNI-2016.1",
    effectiveFrom: "2016-01-01",
    examinationFloor: 0,
    qualificationFloor: 250_000,
    auditIncome: 500_000,
    assetIncomeFloor: 0,
    auditAssets: 0,
    allCharitiesScrutinised: true,
    assetTestBasis: "NONE",
    jurisdictionName: "Northern Ireland",
  });
  assert.equal(result.scrutiny, "INDEPENDENT_EXAMINATION");
});

test("a pinned rule outside its effective period fails closed", () => {
  const result = assessConfiguredEligibility("2026-12-31", 100_000, 10_000, {
    version: "historic",
    effectiveFrom: "2020-01-01",
    effectiveTo: "2025-12-31",
    examinationFloor: 25_000,
    qualificationFloor: 250_000,
    auditIncome: 1_000_000,
    assetIncomeFloor: 250_000,
    auditAssets: 3_260_000,
  });
  assert.equal(result.eligible, false);
  assert.match(result.reason, /not effective/);
});
